import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { transformToMode } from "@/app/domain/editor/utils/modeTransforms.ts";
import { createTestEditor } from "@/test/helpers/testEditor.ts";

describe("modeTransforms nested editor round-trip", () => {
    it("rewraps flattened footnotes when switching back to regular", () => {
        const editor = createTestEditor(
            "\\c 1\n" +
                "\\q2\n" +
                "\\v 9 The land mourns and wastes away; " +
                "\\q2 Lebanon is ashamed and withers away;" +
                "\\f + \\ft The word \\fqa mourns \\fqa* can be also be read as \\fqa dries up\\fqa*. \\f*",
            { needsParagraphs: true },
        );

        const start = editor.getEditorState().toJSON() as unknown as {
            root: { children: SerializedLexicalNode[] };
        };
        const startUsfm = serializeToUsfmString(start.root.children);

        const toUsfmMode = transformToMode(structuredClone(start), "usfm");
        const backToRegular = transformToMode(
            structuredClone(toUsfmMode),
            "regular",
        );

        const backUsfm = serializeToUsfmString(
            backToRegular.root.children as SerializedLexicalNode[],
        );
        expect(backUsfm).toBe(startUsfm);

        const tokensPreservingNested = materializeFlatTokensArray(
            backToRegular.root.children as SerializedLexicalNode[],
            { nested: "preserve" },
        );

        expect(
            tokensPreservingNested.some(isSerializedUSFMNestedEditorNode),
        ).toBe(true);

        const hasInlineFootnoteMarker = tokensPreservingNested.some((n) => {
            if (!isSerializedUSFMTextNode(n)) return false;
            return (
                n.tokenType === UsfmTokenTypes.marker &&
                (n.marker ?? "") === "f"
            );
        });
        expect(hasInlineFootnoteMarker).toBe(false);
    });

    it("infers a missing note close marker at the next paragraph boundary", () => {
        const editor = createTestEditor(
            "\\c 1\n" +
                "\\v 9 The land mourns and wastes away; " +
                "\\f + \\ft Note without an explicit closer.\n" +
                "\\q1 Next paragraph",
            { needsParagraphs: false },
        );

        const start = editor.getEditorState().toJSON() as unknown as {
            root: { children: SerializedLexicalNode[] };
        };
        const toRegular = transformToMode(structuredClone(start), "regular");
        const usfm = serializeToUsfmString(toRegular.root.children);

        expect(usfm).toContain("\\f*");

        const tokensPreservingNested = materializeFlatTokensArray(
            toRegular.root.children as SerializedLexicalNode[],
            { nested: "preserve" },
        );
        expect(
            tokensPreservingNested.some(isSerializedUSFMNestedEditorNode),
        ).toBe(true);
    });
});
