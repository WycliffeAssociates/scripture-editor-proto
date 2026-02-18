import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import type { ContentEditorModeSetting } from "@/app/data/editor.ts";
import {
    materializeFlatTokensArray,
    transformToMode,
    wrapFlatTokensInLexicalParagraph,
} from "@/app/domain/editor/utils/modeTransforms.ts";

export type CanonicalChapterSnapshot = {
    direction: "ltr" | "rtl";
    flatNodes: SerializedLexicalNode[];
};

export type ChapterMode = ContentEditorModeSetting;

export function inferChapterModeFromState(
    state: SerializedEditorState,
): ChapterMode {
    const rootChildren = state.root.children as SerializedLexicalNode[];
    const isRegular = rootChildren.some(
        (child) => (child as { type?: string }).type === "usfm-paragraph-node",
    );
    return isRegular ? "regular" : "usfm";
}

export function chapterStateToCanonicalSnapshot(
    state: SerializedEditorState,
): CanonicalChapterSnapshot {
    const direction = (state.root.direction ?? "ltr") as "ltr" | "rtl";
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
