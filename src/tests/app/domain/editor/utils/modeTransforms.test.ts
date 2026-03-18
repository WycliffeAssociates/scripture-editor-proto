import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import { transformToMode } from "@/app/domain/editor/utils/modeTransforms.ts";
import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { serializeToUsfmString } from "@/test/helpers/serializeToUsfmString.ts";
import { createTestEditor } from "@/test/helpers/testEditor.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

describe("modeTransforms nested editor round-trip", () => {
    it("rewraps flattened footnotes when switching back to regular", async () => {
        const editor = await createTestEditor(
            "\\c 1\n" +
                "\\q2\n" +
                "\\v 9 The land mourns and wastes away; " +
                "\\q2 Lebanon is ashamed and withers away;" +
                "\\f + \\ft The word \\fqa mourns \\fqa* can be also be read as \\fqa dries up\\fqa*. \\f*",
            { needsParagraphs: true },
        );

        const start = editor
            .getEditorState()
            .toJSON() as SerializedEditorState<SerializedLexicalNode>;
        const startUsfm = serializeToUsfmString(
            start.root.children as SerializedLexicalNode[],
        );

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

    it("infers a missing note close marker at the next paragraph boundary", async () => {
        const editor = await createTestEditor(
            "\\c 1\n" +
                "\\v 9 The land mourns and wastes away; " +
                "\\f + \\ft Note without an explicit closer.\n" +
                "\\q1 Next paragraph",
            { needsParagraphs: false },
        );

        const start = editor
            .getEditorState()
            .toJSON() as SerializedEditorState<SerializedLexicalNode>;
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

    it("preserves inline char separator spaces when flattening notes to usfm mode", async () => {
        const editor = await createTestEditor(
            "\\c 5\n" +
                "\\p\n" +
                "\\v 2 Male and female He created them,\\f + \\fr 5:2 \\ft Cited in \\+xt Matthew 19:4\\+xt* and \\+xt Mark 10:6\\+xt*\\f*",
            { needsParagraphs: true },
        );

        const start = editor
            .getEditorState()
            .toJSON() as SerializedEditorState<SerializedLexicalNode>;
        const toUsfmMode = transformToMode(structuredClone(start), "usfm");
        const usfm = serializeToUsfmString(
            toUsfmMode.root.children as SerializedLexicalNode[],
        );

        expect(usfm).toContain(
            "\\+xt Matthew 19:4\\+xt* and \\+xt Mark 10:6\\+xt*",
        );
        expect(usfm).not.toContain("\\+xtMatthew");
        expect(usfm).not.toContain("\\+xtMark");
    });

    it("preserves +xt note submarkers when flattening regular mode for lint", async () => {
        const editor = await createTestEditor(
            "\\c 5\n" +
                "\\p\n" +
                "\\v 2 Male and female He created them,\\f + \\fr 5:2 \\ft Cited in \\+xt Matthew 19:4\\+xt* and \\+xt Mark 10:6\\+xt*\\f*",
            { needsParagraphs: true },
        );

        const start = editor
            .getEditorState()
            .toJSON() as SerializedEditorState<SerializedLexicalNode>;
        const lintTokens = lexicalToTokens(start, {
            structuralParagraphBreaks: true,
        });
        const lintUsfm = lintTokens.map((token) => token.text).join("");

        expect(lintUsfm).toContain(
            "\\+xt Matthew 19:4\\+xt* and \\+xt Mark 10:6\\+xt*",
        );

        const strayCloseIssues = (
            await webUsfmOnionService.lintExisting(lintTokens)
        ).filter((issue) => issue.code === "stray-close-marker");
        expect(strayCloseIssues).toEqual([]);
    });

    it("preserves close-marker punctuation spacing in regular-mode projection", async () => {
        const editor = await createTestEditor(
            "\\c 5\n" +
                "\\p\n" +
                "\\v 29 And he named him Noah,\\f + \\fr 5:29 \\fqa Noah \\ft sounds like the Hebrew for \\fqa rest \\ft or \\fqa comfort\\ft .\\f* saying, “May this one comfort us in the labor and toil of our hands caused by the ground that the \\nd Lord\\nd* has cursed.”\n",
            { needsParagraphs: true },
        );

        const start = editor
            .getEditorState()
            .toJSON() as SerializedEditorState<SerializedLexicalNode>;
        const projected = lexicalToTokens(start)
            .map((token) => token.text)
            .join("");

        expect(projected).toContain("\\fqa comfort\\ft .\\f*");
        expect(projected).not.toContain("\\fqa comfort \\ft  .\\f*");
    });

    it("preserves implicit note submarker closure when flattening regular mode for lint", async () => {
        const editor = await createTestEditor(
            "\\c 1\n" +
                "\\p\n" +
                "\\v 26 Then God said, “Let Us make man in Our image, after Our likeness, to rule over the fish of the sea and the birds of the air, over the livestock, and over all the earth itself\\f + \\fr 1:26 \\ft MT; Syriac \\fqa and over all the beasts of the earth\\f* and every creature that crawls upon it.”\n",
            { needsParagraphs: true },
        );

        const start = editor
            .getEditorState()
            .toJSON() as SerializedEditorState<SerializedLexicalNode>;
        const lintTokens = lexicalToTokens(start, {
            structuralParagraphBreaks: true,
        });

        const lintUsfm = lintTokens.map((token) => token.text).join("");
        expect(lintUsfm).toContain(
            "\\f + \\fr 1:26 \\ft MT; Syriac \\fqa and over all the beasts of the earth\\f*",
        );

        const strayCloseIssues = (
            await webUsfmOnionService.lintExisting(lintTokens)
        ).filter((issue) => issue.code === "stray-close-marker");
        expect(strayCloseIssues).toEqual([]);
    });
});
