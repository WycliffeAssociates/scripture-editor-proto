import { $dfsIterator } from "@lexical/utils";
import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { $insertPara } from "@/app/domain/editor/utils/insertMarkerOperations.ts";
import { serializeToUsfmString } from "@/test/helpers/serializeToUsfmString.ts";
import { createTestEditor } from "@/test/helpers/testEditor.ts";

function serializeEditor(editor: LexicalEditor): string {
    const json = editor.getEditorState().toJSON();
    return serializeToUsfmString(json.root.children as SerializedLexicalNode[]);
}

describe("$insertPara regular mode", () => {
    it("splits verse text into a new paragraph container without running markers together", async () => {
        const editor = await createTestEditor(
            "\\q\n" +
                "\\v 1 Why are the nations in turmoil,\n" +
                "\\q2 and why do the peoples devise vain plans?\n" +
                "\\q\n" +
                "\\v 2 The kings of the earth take their stand together",
        );

        editor.update(
            () => {
                let target: USFMTextNode | null = null;
                for (const { node } of $dfsIterator()) {
                    if (
                        $isUSFMTextNode(node) &&
                        node.getTokenType() === UsfmTokenTypes.text &&
                        node
                            .getTextContent()
                            .includes("Why are the nations in turmoil")
                    ) {
                        target = node;
                        break;
                    }
                }
                expect(target).not.toBeNull();
                if (!target) return;

                const text = target.getTextContent();
                const splitAt = text.indexOf("in turmoil");
                expect(splitAt).toBeGreaterThan(0);

                // Place caret before "in turmoil" and insert a paragraph marker via UI path.
                target.select(splitAt, splitAt);
                $insertPara({
                    anchorNode: target,
                    anchorOffsetToUse: splitAt,
                    marker: "p",
                    isStartOfLine: false,
                    restOfText: "",
                    languageDirection: "ltr",
                    isTypedInsertion: false,
                    editorMode: "regular",
                });
            },
            { discrete: true },
        );

        const usfm = serializeEditor(editor);
        // Verse marker stays on the q line.
        expect(usfm).toContain("\\q\n\\v 1");

        // Paragraph marker is on its own line (no `\\q \\p`).
        expect(usfm).not.toContain("\\q \\p");
        expect(usfm).toContain("\\p");
        expect(/Why are the nations\s*\n\\p\s*in turmoil,/u.test(usfm)).toBe(
            true,
        );
    });
});
