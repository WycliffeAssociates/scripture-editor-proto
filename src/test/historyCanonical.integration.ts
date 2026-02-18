import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { transformToMode } from "@/app/domain/editor/utils/modeTransforms.ts";
import {
    canonicalSnapshotToChapterState,
    chapterSnapshotsAreEqual,
    chapterStateToCanonicalSnapshot,
} from "@/app/domain/history/canonicalChapterState.ts";
import { createTestEditor } from "@/test/helpers/testEditor.ts";

describe("history canonical snapshot integration", () => {
    it("remains mode-agnostic between regular and usfm projections", () => {
        const editor = createTestEditor(
            "\\c 1\n\\p\n\\v 1 In the beginning\\f + \\ft Note\\f*",
            { needsParagraphs: true },
        );
        const regularState = editor.getEditorState().toJSON();
        const usfmState = transformToMode(
            structuredClone(regularState),
            "usfm",
        );

        const regularSnapshot = chapterStateToCanonicalSnapshot(regularState);
        const usfmSnapshot = chapterStateToCanonicalSnapshot(usfmState);

        expect(chapterSnapshotsAreEqual(regularSnapshot, usfmSnapshot)).toBe(
            true,
        );
    });

    it("round-trips canonical snapshot back to regular mode", () => {
        const editor = createTestEditor("\\c 1\n\\p\n\\v 1 Alpha beta", {
            needsParagraphs: true,
        });
        const startState = editor.getEditorState().toJSON();
        const startUsfm = serializeToUsfmString(
            startState.root.children as SerializedLexicalNode[],
        );

        const snapshot = chapterStateToCanonicalSnapshot(startState);
        const restored = canonicalSnapshotToChapterState({
            snapshot,
            targetMode: "regular",
        });
        const restoredUsfm = serializeToUsfmString(
            restored.root.children as SerializedLexicalNode[],
        );

        expect(restoredUsfm).toBe(startUsfm);
    });
});
