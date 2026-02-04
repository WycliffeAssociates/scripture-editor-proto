import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { parsedUsfmTokensToLexicalStates } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { applyAutofixToSerializedState } from "@/app/domain/editor/utils/autofixSerializedNode.ts";
import { parseUSFMChapter } from "@/core/domain/usfm/parse.ts";

describe("applyAutofixToSerializedState", () => {
    it("does not mutate the loaded baseline state when applying a fix", () => {
        const usfm =
            "\\c 1\n" +
            "\\v 1 Before note \\f + \\ft Note without closer\n" +
            "\\q1 New paragraph";

        const parsed = parseUSFMChapter(usfm, "ISA");
        const tokens = parsed.usfm[1] ?? [];
        const err = parsed.lintErrors.find(
            (e) => e.fix?.type === "insertEndMarker",
        );
        expect(err).toBeTruthy();
        if (!err) return;

        const { loadedLexicalState, lexicalState } =
            parsedUsfmTokensToLexicalStates(tokens, "ltr", true);

        const baselineBefore = serializeToUsfmString(
            loadedLexicalState.root.children as SerializedLexicalNode[],
        );

        const next = applyAutofixToSerializedState(lexicalState, err);
        expect(next).not.toBeNull();
        if (!next) return;

        const baselineAfter = serializeToUsfmString(
            loadedLexicalState.root.children as SerializedLexicalNode[],
        );
        expect(baselineAfter).toBe(baselineBefore);

        const afterUsfm = serializeToUsfmString(
            next.root.children as SerializedLexicalNode[],
        );
        expect(afterUsfm).not.toBe(baselineBefore);
        expect(afterUsfm).toContain("\\f*");
    });
});
