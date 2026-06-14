import type { SerializedEditorState, SerializedLexicalNode } from "lexical";

import { EDITOR_SHAPES, type EditorShape } from "@/app/data/editor.ts";
import {
  isFormModeRootChildren,
  isRegularModeRootChildren,
  materializeFlatTokensArray,
  transformToShape,
  wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import {
  lexicalToTokens,
  tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * History/version features need a mode-independent representation of a chapter.
 * Canonical snapshots flatten the chapter into a stable token stream so any
 * tree shape can round-trip through the same history entry.
 */
export type CanonicalChapterSnapshot = {
  direction: LanguageDirection;
  flatNodes: SerializedLexicalNode[];
};

/**
 * Detect the tree shape of a chapter's current state so a canonical snapshot
 * rehydrates into the SAME presentation the chapter is showing.
 *
 * This is the one sanctioned shape *detection* outside `transformToShape`:
 * undo/redo restores what the user is looking at, and the live tree — not the
 * mode setting — is the authority on that (the two only diverge transiently,
 * mid mode-switch). It compares shapes; it never decides mode intent.
 */
export function inferChapterShapeFromState(
  state: SerializedEditorState,
): EditorShape {
  const rootChildren = state.root.children as SerializedLexicalNode[];
  if (isFormModeRootChildren(rootChildren)) return EDITOR_SHAPES.form;
  if (isRegularModeRootChildren(rootChildren)) return EDITOR_SHAPES.regular;
  return EDITOR_SHAPES.flat;
}

export function chapterStateToCanonicalSnapshot(
  state: SerializedEditorState,
): CanonicalChapterSnapshot {
  const direction = state.root.direction ?? LanguageDirection.LTR;
  const rootChildren = state.root.children as SerializedLexicalNode[];
  const flatNodes = materializeFlatTokensArray(rootChildren, {
    nested: "flatten",
  });
  return {
    direction,
    flatNodes,
  };
}

export function canonicalSnapshotToChapterState(args: {
  snapshot: CanonicalChapterSnapshot;
  targetShape: EditorShape;
}): SerializedEditorState {
  const baseState: SerializedEditorState = {
    root: {
      children: [
        wrapFlatTokensInLexicalParagraph(
          args.snapshot.flatNodes,
          args.snapshot.direction,
        ),
      ],
      type: "root",
      version: 1,
      direction: args.snapshot.direction,
      format: "start",
      indent: 0,
    },
  };

  return transformToShape(baseState, args.targetShape);
}

/**
 * Canonical snapshot straight from a chapter's flat token stream — the
 * token-space equivalent of `chapterStateToCanonicalSnapshot`. Routes through
 * the flat shape so the produced `flatNodes` match what flattening any shaped
 * tree of the same content would yield (the flat↔shape round-trip is lossless).
 */
export function chapterTokensToCanonicalSnapshot(
  tokens: Token[],
  direction: LanguageDirection,
): CanonicalChapterSnapshot {
  return chapterStateToCanonicalSnapshot(
    tokensToLexical({ tokens, direction, mode: EDITOR_SHAPES.flat }),
  );
}

/** Inverse of `chapterTokensToCanonicalSnapshot`: snapshot → flat token stream. */
export function canonicalSnapshotToTokens(
  snapshot: CanonicalChapterSnapshot,
): Token[] {
  return lexicalToTokens(
    canonicalSnapshotToChapterState({
      snapshot,
      targetShape: EDITOR_SHAPES.flat,
    }),
  );
}

export function chapterSnapshotsAreEqual(
  a: CanonicalChapterSnapshot,
  b: CanonicalChapterSnapshot,
) {
  if (a.direction !== b.direction) return false;
  return JSON.stringify(a.flatNodes) === JSON.stringify(b.flatNodes);
}
