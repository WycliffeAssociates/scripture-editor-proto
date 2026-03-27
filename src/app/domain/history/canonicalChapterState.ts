import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import {
    type ContentEditorModeSetting,
    EDITOR_MODES,
} from "@/app/data/editor.ts";
import {
    materializeFlatTokensArray,
    transformToMode,
    wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";

/**
 * History/version features need a mode-independent representation of a chapter.
 * Canonical snapshots flatten the chapter into a stable token stream so regular
 * mode and source mode can round-trip through the same history entry.
 */
export type CanonicalChapterSnapshot = {
    direction: LanguageDirection;
    flatNodes: SerializedLexicalNode[];
};

export type ChapterMode = ContentEditorModeSetting;

/**
 * Infer which editor mode originally produced this serialized state so a canonical
 * snapshot can later be rehydrated into the same user-facing shape if needed.
 */
export function inferChapterModeFromState(
    state: SerializedEditorState,
): ChapterMode {
    const rootChildren = state.root.children as SerializedLexicalNode[];
    const isRegular = rootChildren.some(
        (child) => (child as { type?: string }).type === "usfm-paragraph-node",
    );
    return isRegular ? EDITOR_MODES.regular : EDITOR_MODES.usfm;
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
    targetMode: ChapterMode;
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

    return transformToMode(baseState, args.targetMode);
}

export function chapterSnapshotsAreEqual(
    a: CanonicalChapterSnapshot,
    b: CanonicalChapterSnapshot,
) {
    if (a.direction !== b.direction) return false;
    return JSON.stringify(a.flatNodes) === JSON.stringify(b.flatNodes);
}
