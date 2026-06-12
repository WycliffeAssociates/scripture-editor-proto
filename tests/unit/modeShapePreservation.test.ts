// Regression tests for the mode→shape policy
// The rebuild seams used to decide shape with `mode === regular ? "regular" :
// "flat"` ternaries or by inferring mode back out of the tree, which collapsed
// form-mode chapters to flat (USFM-looking) trees on revert / accept-incoming.
// These tests pin the contract: rebuilds take an explicit `EditorShape` and the
// rebuilt tree honors it.

import { makeBook, makeChapter } from "@tests/helpers/workspaceFixtures.ts";
import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";

import {
  EDITOR_SHAPES,
  editorModeToShape,
  shapeForSurface,
} from "@/app/data/editor.ts";
import {
  isFormModeRootChildren,
  isRegularModeRootChildren,
  transformToShape,
  wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import { applyIncomingChapter } from "@/app/domain/project/compare/compareMutations.ts";
import {
  revertChapterDiffByBlockId,
  revertChapterToLoadedState,
} from "@/app/domain/project/saveAndRevertService.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function rootChildren(
  state: SerializedEditorState<SerializedLexicalNode>,
): SerializedLexicalNode[] {
  return state.root.children as SerializedLexicalNode[];
}

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

  it("pins baseline and compare-source surfaces to flat", () => {
    expect(shapeForSurface("savedBaseline")).toBe(EDITOR_SHAPES.flat);
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

describe("workingRebuild shape preservation (the form-collapse regressions)", () => {
  it("revertChapterToLoadedState keeps a form chapter form-shaped", () => {
    const chapter = makeChapter({
      sourceText: "in the beginning",
      text: "IN THE BEGINNING edited",
      shape: "form",
    });
    expect(isFormModeRootChildren(rootChildren(chapter.lexicalState))).toBe(
      true,
    );

    revertChapterToLoadedState(chapter, "form");

    expect(isFormModeRootChildren(rootChildren(chapter.lexicalState))).toBe(
      true,
    );
    expect(chapter.dirty).toBe(false);
    expect(chapter.currentTokens.map((t) => t.source).join("")).toBe(
      "\\p in the beginning",
    );
  });

  it("revertChapterToLoadedState keeps a regular chapter regular-shaped", () => {
    const chapter = makeChapter({
      sourceText: "in the beginning",
      text: "edited",
      shape: "regular",
    });

    revertChapterToLoadedState(chapter, "regular");

    expect(isRegularModeRootChildren(rootChildren(chapter.lexicalState))).toBe(
      true,
    );
  });

  it("revertChapterDiffByBlockId rebuilds into the given shape", async () => {
    const chapter = makeChapter({
      sourceText: "in the beginning",
      text: "edited",
      shape: "form",
    });
    const usfmOnionService = {
      revertDiffBlock: async (baseline: Token[]) => structuredClone(baseline),
    } as unknown as IUsfmOnionService;

    await revertChapterDiffByBlockId({
      chapter,
      diffBlockId: "any",
      usfmOnionService,
      shape: "form",
    });

    expect(isFormModeRootChildren(rootChildren(chapter.lexicalState))).toBe(
      true,
    );
    expect(chapter.dirty).toBe(false);
  });

  it("applyIncomingChapter rebuilds the working chapter into the given shape", () => {
    const workingChapter = makeChapter({ text: "local", shape: "form" });
    const sourceChapter = makeChapter({ text: "incoming", shape: "flat" });

    applyIncomingChapter({
      workingFiles: [makeBook({ chapters: [workingChapter] })],
      sourceFiles: [makeBook({ chapters: [sourceChapter] })],
      bookCode: "GEN",
      chapterNum: 1,
      shape: "form",
    });

    expect(
      isFormModeRootChildren(rootChildren(workingChapter.lexicalState)),
    ).toBe(true);
    expect(workingChapter.currentTokens.map((t) => t.source).join("")).toBe(
      "\\p incoming",
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
