// Regular-mode metadata + insertion context regression tests.
//
// Both behaviors below were written for the FLAT (source/plain) shape, where
// paragraph markers and chapter/verse markers are inline `USFMTextNode`s. In
// regular mode the tree differs: paragraphs are `USFMParagraphNode`
// containers and chapter/verse markers are `USFMNumberedMarkerNode`s. Two
// places walked the flat shape only and so produced wrong derived metadata:
//
//  - maintainDocumentMetaData: derived `inPara` by scanning for inline para
//    `marker` tokens, which regular mode has none of — so inline nodes could
//    never receive their enclosing paragraph's marker (and a real value
//    carried over from a mode switch would be clobbered to "").
//  - findContextForVerseInsert: recovered prior-verse SID from `numberRange`
//    tokens and paragraph context from inline `marker` tokens only — neither
//    of which exists in regular mode — so inserting a verse produced a
//    placeholder SID like "undefined undefined:2" and an empty inPara before
//    the metadata pass could heal it.
//
// These lock the container-aware derivation: paragraph identity comes from
// the enclosing `USFMParagraphNode`, prior SID from the numbered node.

import { $dfsIterator } from "@lexical/utils";
import { describe, expect, it } from "vitest";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import { maintainDocumentMetaData } from "@/app/domain/editor/listeners/maintainMetadata.ts";
import { $isUSFMNumberedMarkerNode } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { $insertVerse } from "@/app/domain/editor/utils/insertMarkerOperations.ts";
import { createTestEditor } from "@tests/helpers/testEditor.ts";

// \p holds verse 1, \q holds verse 2 — distinct paragraph markers so the
// per-node inPara derivation can't be faked by a single global value.
const FIXTURE =
    "\\id GEN\n\\c 1\n\\p\n\\v 1 In the beginning.\n\\q\n\\v 2 Second line.\n";

/**
 * Find the first text-bearing node (text or numbered) with exact content.
 * MUST be called inside a read/update — returns a live node handle.
 */
function $findByText(text: string): USFMTextNode | null {
    for (const { node } of $dfsIterator()) {
        if (
            ($isUSFMTextNode(node) || $isUSFMNumberedMarkerNode(node)) &&
            node.getTextContent() === text
        ) {
            return node;
        }
    }
    return null;
}

describe("regular-mode metadata maintenance", () => {
    it("stamps inPara from the enclosing paragraph container, not flat markers", async () => {
        const editor = await createTestEditor(FIXTURE);

        maintainDocumentMetaData(
            editor.getEditorState(),
            editor,
            "GEN",
            {} as never,
        );
        // The maintainer's writeback `editor.update` flushes on the next
        // tick; let it land before reading the stamped metadata.
        await new Promise((resolve) => setTimeout(resolve, 0));

        const inParaOf = (text: string) =>
            editor.getEditorState().read(() => $findByText(text)?.getInPara());

        // Verse 1 + its prose live in the \p container.
        expect(inParaOf("1 ")).toBe("p");
        expect(inParaOf("In the beginning.")).toBe("p");
        // Verse 2 + its prose live in the \q container.
        expect(inParaOf("2 ")).toBe("q");
        expect(inParaOf("Second line.")).toBe("q");
        // The chapter node sits in the byte-less "c" shell, which is not a
        // paragraph — it gets no paragraph context (unset, not a marker).
        expect(inParaOf("1") ?? "").toBe("");
    });

    it("derives insertion SID/paragraph from numbered + container context", async () => {
        const editor = await createTestEditor(FIXTURE);

        // Insert a verse right after verse 1's prose, inside the \p paragraph.
        editor.update(
            () => {
                const anchorNode = $findByText("In the beginning.");
                if (!$isUSFMTextNode(anchorNode)) {
                    throw new Error("anchor not found");
                }
                $insertVerse({
                    anchorNode,
                    anchorOffsetToUse: anchorNode.getTextContentSize(),
                    marker: "v",
                    isStartOfLine: false,
                    restOfText: "",
                    languageDirection: "ltr",
                    editorMode: EDITOR_MODES.regular,
                });
            },
            { discrete: true },
        );

        // The freshly inserted verse defaults to a lone terminator space.
        const inserted = editor.getEditorState().read(() => {
            for (const { node } of $dfsIterator()) {
                if (
                    $isUSFMNumberedMarkerNode(node) &&
                    node.getMarker() === "v" &&
                    node.getTextContent().trim() === ""
                ) {
                    return { sid: node.getSid(), inPara: node.getInPara() };
                }
            }
            return null;
        });

        expect(inserted).not.toBeNull();
        // Steps forward from verse 1 → GEN 1:2; inherits the \p container.
        expect(inserted?.sid).toBe("GEN 1:2");
        expect(inserted?.inPara).toBe("p");
    });
});
