// Regression tests for the mode→shape policy
// The rebuild seams used to decide shape with `mode === regular ? "regular" :
// "flat"` ternaries or by inferring mode back out of the tree, which collapsed
// form-mode chapters to flat (USFM-looking) trees on revert / accept-incoming.
// These tests pin the contract: rebuilds take an explicit `EditorShape` and the
// rebuilt tree honors it.

import { makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import type { SerializedEditorState } from "lexical";
import { describe, expect, it } from "vitest";

import {
  EDITOR_SHAPES,
  editorModeToShape,
  shapeForSurface,
} from "@/app/data/editor.ts";
import {
  transformToShape,
  wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import { revertChapterToLoadedState } from "@/app/domain/project/saveAndRevertService.ts";

describe("shapeForSurface", () => {
  it("follows the user's mode on mode-dependent surfaces", () => {
    for (const surface of [
      "mainEditor",
      "workingRebuild",
      "referencePane",
    ] as const) {
      expect(shapeForSurface(surface, "form")).toBe(EDITOR_SHAPES.form);
      expect(shapeForSurface(surface, "regular")).toBe(EDITOR_SHAPES.regular);
      expect(shapeForSurface(surface, "view")).toBe(EDITOR_SHAPES.regular);
      expect(shapeForSurface(surface, "usfm")).toBe(EDITOR_SHAPES.flat);
      expect(shapeForSurface(surface, "plain")).toBe(EDITOR_SHAPES.flat);
    }
  });

  it("pins the compare-source surface to flat", () => {
    expect(shapeForSurface("compareSource")).toBe(EDITOR_SHAPES.flat);
  });

  it("agrees with editorModeToShape for the mode-dependent surfaces", () => {
    for (const mode of ["regular", "usfm", "plain", "view", "form"] as const) {
      expect(shapeForSurface("workingRebuild", mode)).toBe(
        editorModeToShape(mode),
      );
    }
  });
});

// Shape is now a read-time derivation (the editor materializes the visible
// chapter's tree from canonical tokens in its mode), so these mutators only
// write `currentTokens`. The old form-collapse regression — a mutator baking a
// flat tree over a form chapter — is structurally impossible; what remains to
// pin is that each path produces the correct token CONTENT. Mode-flip shape
// fidelity itself is covered by `syntheticFixtureRoundTrip.test.ts`.
describe("workingRebuild content preservation", () => {
  it("revertChapterToLoadedState restores the loaded tokens, clean", () => {
    const chapter = makeChapter({
      sourceText: "in the beginning",
      text: "IN THE BEGINNING edited",
      shape: "form",
    });

    revertChapterToLoadedState(chapter);

    expect(chapter.dirty).toBe(false);
    expect(chapter.currentTokens.map((t) => t.source).join("")).toBe(
      "\\p in the beginning",
    );
  });
});

describe("transformToShape on empty content", () => {
  it("keeps the existing valid state instead of emitting a childless root", () => {
    const empty: SerializedEditorState = {
      root: {
        type: "root",
        version: 1,
        direction: "ltr",
        format: "start",
        indent: 0,
        children: [wrapFlatTokensInLexicalParagraph([], "ltr")],
      },
    };

    for (const shape of ["form", "regular"] as const) {
      const transformed = transformToShape(structuredClone(empty), shape);
      expect(transformed.root.children.length).toBeGreaterThan(0);
    }
  });
});
