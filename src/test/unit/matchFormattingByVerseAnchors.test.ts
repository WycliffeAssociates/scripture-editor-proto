import { describe, expect, it } from "vitest";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import { matchFormattingByVerseAnchors } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import type { PrettifyToken } from "@/core/domain/usfm/prettify/prettifyTokenStream.ts";

const marker = (marker: string, sid?: string): PrettifyToken => ({
    tokenType: TokenMap.marker,
    marker,
    text: `\\${marker}`,
    sid,
});

const number = (text: string, sid?: string): PrettifyToken => ({
    tokenType: TokenMap.numberRange,
    marker: "v",
    text,
    sid,
});

const text = (value: string, sid?: string): PrettifyToken => ({
    tokenType: TokenMap.text,
    text: value,
    sid,
});

const nl = (): PrettifyToken => ({
    tokenType: TokenMap.verticalWhitespace,
    text: "\n",
});

describe("matchFormattingByVerseAnchors", () => {
    it("preserves chapter markers while copying structural markers before verse 1", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("p"),
            nl(),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed is the man", "PSA 1:1"),
        ];

        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed is the man", "PSA 1:1"),
        ];

        const result = matchFormattingByVerseAnchors({
            sourceTokens,
            targetTokens,
            scope: "chapter",
        });

        expect(result.tokens[0]).toMatchObject({
            tokenType: TokenMap.marker,
            marker: "c",
        });
        expect(result.tokens[1]).toMatchObject({
            tokenType: TokenMap.numberRange,
            text: "1",
        });
        expect(
            result.tokens.some(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "p",
            ),
        ).toBe(true);
    });

    it("copies boundary markers before the next verse anchor", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed", "PSA 1:1"),
            nl(),
            marker("q"),
            nl(),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];

        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed", "PSA 1:1"),
            nl(),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];

        const result = matchFormattingByVerseAnchors({
            sourceTokens,
            targetTokens,
            scope: "book",
        });

        const verse2Index = result.tokens.findIndex(
            (token) =>
                token.tokenType === TokenMap.marker && token.sid === "PSA 1:2",
        );
        const qBeforeVerse2 = result.tokens
            .slice(Math.max(0, verse2Index - 3), verse2Index)
            .some(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "q",
            );

        expect(qBeforeVerse2).toBe(true);
        expect(result.suggestions).toHaveLength(0);
    });

    it("emits skipped suggestions for intra-verse markers that are not boundary markers", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed", "PSA 1:1"),
            marker("q", "PSA 1:1"),
            text(" who does not walk", "PSA 1:1"),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];

        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed who does not walk", "PSA 1:1"),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];

        const result = matchFormattingByVerseAnchors({
            sourceTokens,
            targetTokens,
            scope: "project",
        });

        expect(result.suggestions).toHaveLength(1);
        expect(result.suggestions[0]).toMatchObject({
            scope: "project",
            marker: "q",
            verse: "1",
            chapter: 1,
            bookCode: "PSA",
        });
    });

    it("does not suggest intra-verse markers already present in target in sequence", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            marker("v", "PSA 34:1"),
            number("1", "PSA 34:1"),
            text(" I will praise Yahweh at all times,", "PSA 34:1"),
            marker("q2", "PSA 34:1"),
            text(" his praise will always be in my mouth.", "PSA 34:1"),
            marker("v", "PSA 34:2"),
            number("2", "PSA 34:2"),
            text(" I will boast in Yahweh;", "PSA 34:2"),
        ];

        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            marker("v", "PSA 34:1"),
            number("1", "PSA 34:1"),
            text(" I will praise Yahweh at all times,", "PSA 34:1"),
            marker("q2", "PSA 34:1"),
            text(" his praise will always be in my mouth.", "PSA 34:1"),
            marker("v", "PSA 34:2"),
            number("2", "PSA 34:2"),
            text(" I will boast in Yahweh;", "PSA 34:2"),
        ];

        const result = matchFormattingByVerseAnchors({
            sourceTokens,
            targetTokens,
            scope: "chapter",
            targetMarkerPreservation: "keep_all",
        });

        expect(
            result.suggestions.some(
                (suggestion) =>
                    suggestion.verse === "1" && suggestion.marker === "q2",
            ),
        ).toBe(false);
    });

    it("strips target paragraph markers and linebreaks before applying source boundaries", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed", "PSA 1:1"),
            marker("q"),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];
        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("p"),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed", "PSA 1:1"),
            nl(),
            marker("m"),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];

        const result = matchFormattingByVerseAnchors({
            sourceTokens,
            targetTokens,
            scope: "chapter",
        });

        expect(
            result.tokens.some(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "p",
            ),
        ).toBe(false);
        expect(
            result.tokens.some(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "m",
            ),
        ).toBe(false);
        expect(
            result.tokens.filter(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "q",
            ),
        ).toHaveLength(1);
    });

    it("does not carry source s5 markers", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed", "PSA 1:1"),
            marker("s5"),
            marker("q"),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];
        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed", "PSA 1:1"),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];

        const result = matchFormattingByVerseAnchors({
            sourceTokens,
            targetTokens,
            scope: "chapter",
        });

        expect(
            result.tokens.some(
                (token) =>
                    token.tokenType === TokenMap.marker &&
                    token.marker === "s5",
            ),
        ).toBe(false);
        expect(
            result.tokens.some(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "q",
            ),
        ).toBe(true);
    });

    it("keeps boundary markers across disallowed s5 separators", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            marker("v", "PSA 1:14"),
            number("14", "PSA 1:14"),
            text(" Turn away from evil and do good.", "PSA 1:14"),
            nl(),
            marker("b"),
            nl(),
            marker("s5"),
            nl(),
            marker("q"),
            nl(),
            marker("v", "PSA 1:15"),
            number("15", "PSA 1:15"),
            text(" The eyes of Yahweh are on the righteous", "PSA 1:15"),
        ];

        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            marker("v", "PSA 1:14"),
            number("14", "PSA 1:14"),
            text(" Turn away from evil and do good.", "PSA 1:14"),
            marker("v", "PSA 1:15"),
            number("15", "PSA 1:15"),
            text(" The eyes of Yahweh are on the righteous", "PSA 1:15"),
        ];

        const result = matchFormattingByVerseAnchors({
            sourceTokens,
            targetTokens,
            scope: "chapter",
        });

        const verse15Index = result.tokens.findIndex(
            (token) =>
                token.tokenType === TokenMap.marker && token.sid === "PSA 1:15",
        );
        const boundaryBeforeVerse15 = result.tokens.slice(
            Math.max(0, verse15Index - 8),
            verse15Index,
        );

        expect(
            boundaryBeforeVerse15.some(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "b",
            ),
        ).toBe(true);
        expect(
            boundaryBeforeVerse15.some(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "q",
            ),
        ).toBe(true);
        expect(
            result.tokens.some(
                (token) =>
                    token.tokenType === TokenMap.marker &&
                    token.marker === "s5",
            ),
        ).toBe(false);
        expect(
            result.suggestions.map((suggestion) => suggestion.marker),
        ).not.toContain("b");
    });

    it("recommended mode preserves inline markers but strips boundary-style markers", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed is the man", "PSA 1:1"),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But his delight", "PSA 1:2"),
        ];

        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            marker("v", "PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed is the man ", "PSA 1:1"),
            marker("q2"),
            text(" who does not walk", "PSA 1:1"),
            marker("b"),
            nl(),
            marker("v", "PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But his delight", "PSA 1:2"),
        ];

        const result = matchFormattingByVerseAnchors({
            sourceTokens,
            targetTokens,
            scope: "chapter",
            targetMarkerPreservation: "recommended",
        });

        const verse1Index = result.tokens.findIndex(
            (token) =>
                token.tokenType === TokenMap.marker && token.sid === "PSA 1:1",
        );
        const verse2Index = result.tokens.findIndex(
            (token) =>
                token.tokenType === TokenMap.marker && token.sid === "PSA 1:2",
        );
        const verse1Body = result.tokens.slice(verse1Index, verse2Index);

        expect(
            verse1Body.some(
                (token) =>
                    token.tokenType === TokenMap.marker &&
                    token.marker === "q2",
            ),
        ).toBe(true);
        expect(
            verse1Body.some(
                (token) =>
                    token.tokenType === TokenMap.marker && token.marker === "b",
            ),
        ).toBe(false);
    });
});
