// formModeBlockTree.test.ts
//
// Round-trip + structure tests for the form-mode block-tree builder.
//
// Two invariants drive these tests:
//   1. Round-trip identity: flatten(build(input)) == input, token-by-token.
//   2. Structure: paragraph-class markers create blocks; verses become
//      fragments inside blocks; isFirstOfVerse is stamped exactly once
//      per verse run across the chapter.

import type { SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { USFM_TEXT_NODE_TYPE, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { SerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    buildFormBlockTree,
    flattenFormBlockTree,
    type FormBlockKind,
} from "@/app/domain/editor/utils/formModeBlockTree.ts";

// Test-token helpers. The block tree only inspects `tokenType`, `marker`,
// `sid`, `text`, and the `linebreak` type, so we keep the shape minimal.
const marker = (m: string, sid?: string): SerializedUSFMTextNode => ({
    type: USFM_TEXT_NODE_TYPE,
    lexicalType: USFM_TEXT_NODE_TYPE,
    tokenType: UsfmTokenTypes.marker,
    marker: m,
    sid,
    id: "test",
    text: `\\${m} `,
    version: 1,
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
});

const num = (n: string, sid?: string): SerializedUSFMTextNode => ({
    type: USFM_TEXT_NODE_TYPE,
    lexicalType: USFM_TEXT_NODE_TYPE,
    tokenType: UsfmTokenTypes.numberRange,
    marker: "v",
    sid,
    id: "test",
    text: n,
    version: 1,
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
});

const text = (t: string, sid?: string): SerializedUSFMTextNode => ({
    type: USFM_TEXT_NODE_TYPE,
    lexicalType: USFM_TEXT_NODE_TYPE,
    tokenType: UsfmTokenTypes.text,
    sid,
    id: "test",
    text: t,
    version: 1,
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
});

const nl = (): SerializedLexicalNode =>
    ({ type: "linebreak", version: 1 }) as SerializedLexicalNode;

const verse = (sid: string) => marker("v", sid);

const kindsOf = (input: ReturnType<typeof buildFormBlockTree>) =>
    input.map((b) => b.kind);

const sidsOf = (input: ReturnType<typeof buildFormBlockTree>) =>
    input.flatMap((b) => b.fragments.map((f) => f.sid));

describe("buildFormBlockTree", () => {
    describe("Heb 1:5 pattern — one verse spans many discourse markers", () => {
        const tokens: SerializedLexicalNode[] = [
            marker("p"),
            nl(),
            verse("HEB 1:5"),
            num("5", "HEB 1:5"),
            text(" For to which of the angels did God ever say,", "HEB 1:5"),
            marker("q", "HEB 1:5"),
            text(" You are my Son,", "HEB 1:5"),
            marker("q2", "HEB 1:5"),
            text(" today I have become your Father?", "HEB 1:5"),
            marker("b"),
            marker("p", "HEB 1:5"),
            text(" Or to which of the angels did God ever say,", "HEB 1:5"),
            marker("b"),
            marker("q", "HEB 1:5"),
            text(" I will be a Father to him,", "HEB 1:5"),
            marker("q2", "HEB 1:5"),
            text(" and he will be a Son to me?", "HEB 1:5"),
        ];

        it("creates one block per paragraph-class marker", () => {
            const blocks = buildFormBlockTree(tokens);
            const expectedKinds: FormBlockKind[] = [
                { variant: "paragraph", marker: "p" },
                { variant: "poetry", marker: "q" },
                { variant: "poetry", marker: "q2" },
                { variant: "rule", marker: "b" },
                { variant: "paragraph", marker: "p" },
                { variant: "rule", marker: "b" },
                { variant: "poetry", marker: "q" },
                { variant: "poetry", marker: "q2" },
            ];
            expect(kindsOf(blocks)).toEqual(expectedKinds);
        });

        it("stamps isFirstOfVerse only on the very first fragment of the verse run", () => {
            const blocks = buildFormBlockTree(tokens);
            const allFragments = blocks.flatMap((b) => b.fragments);

            // exactly one firstOfVerse for the entire verse-5 run
            const firstFlags = allFragments.map((f) => f.isFirstOfVerse);
            const firstCount = firstFlags.filter(Boolean).length;
            expect(firstCount).toBe(1);
            expect(allFragments[0]?.isFirstOfVerse).toBe(true);
            expect(allFragments[0]?.sid).toBe("HEB 1:5");
        });

        it("rule blocks (\\b) carry no fragments", () => {
            const blocks = buildFormBlockTree(tokens);
            const rules = blocks.filter((b) => b.kind.variant === "rule");
            expect(rules.length).toBeGreaterThan(0);
            for (const rule of rules) {
                expect(rule.fragments).toHaveLength(0);
            }
        });
    });

    describe("Mt 4:5–6 pattern — one paragraph holds multiple verses", () => {
        const tokens: SerializedLexicalNode[] = [
            marker("p"),
            nl(),
            verse("MAT 4:5"),
            num("5", "MAT 4:5"),
            text(" Then the devil took him...", "MAT 4:5"),
            verse("MAT 4:6"),
            num("6", "MAT 4:6"),
            text(" and said to him...", "MAT 4:6"),
            marker("b"),
            marker("q", "MAT 4:6"),
            text(" 'He will command...'", "MAT 4:6"),
            marker("m", "MAT 4:6"),
            text(" and", "MAT 4:6"),
            marker("q", "MAT 4:6"),
            text(" 'They will carry...'", "MAT 4:6"),
            marker("q2", "MAT 4:6"),
            text(" so that you will not...", "MAT 4:6"),
        ];

        it("packs both verses into the same \\p block as adjacent fragments", () => {
            const blocks = buildFormBlockTree(tokens);
            const firstBlock = blocks[0];
            expect(firstBlock?.kind).toEqual({
                variant: "paragraph",
                marker: "p",
            });
            expect(firstBlock?.fragments).toHaveLength(2);
            expect(firstBlock?.fragments[0]?.sid).toBe("MAT 4:5");
            expect(firstBlock?.fragments[1]?.sid).toBe("MAT 4:6");
        });

        it("stamps isFirstOfVerse on each verse's first fragment", () => {
            const blocks = buildFormBlockTree(tokens);
            const allFragments = blocks.flatMap((b) => b.fragments);
            const firstByVerse = new Map<string, boolean>();
            for (const f of allFragments) {
                if (f.isFirstOfVerse && f.sid !== null) {
                    firstByVerse.set(f.sid, true);
                }
            }
            expect(firstByVerse.get("MAT 4:5")).toBe(true);
            expect(firstByVerse.get("MAT 4:6")).toBe(true);
            // \q, \m, \q, \q2 continuations of v6 should NOT be flagged
            const v6Frags = allFragments.filter(
                (f) => f.sid === "MAT 4:6",
            );
            const v6Firsts = v6Frags.filter((f) => f.isFirstOfVerse);
            expect(v6Firsts).toHaveLength(1);
        });
    });

    describe("Chapter prelude — leading tokens before any \\v", () => {
        const tokens: SerializedLexicalNode[] = [
            marker("c"),
            num("1"),
            nl(),
            marker("s1"),
            text(" Section heading"),
            nl(),
            marker("p"),
            nl(),
            verse("JHN 1:1"),
            num("1", "JHN 1:1"),
            text(" In the beginning...", "JHN 1:1"),
        ];

        it("places \\c before any paragraph-class marker into the implicit block", () => {
            const blocks = buildFormBlockTree(tokens);
            expect(blocks[0]?.kind).toEqual({ variant: "implicit" });
            // \c is not paragraph-class so it stays in implicit
            const implicitTokens = blocks[0]?.tokens ?? [];
            const sawC = implicitTokens.some(
                (t) =>
                    (t as SerializedUSFMTextNode).marker === "c" &&
                    (t as SerializedUSFMTextNode).tokenType ===
                        UsfmTokenTypes.marker,
            );
            expect(sawC).toBe(true);
        });

        it("classifies the section heading as a heading block", () => {
            const blocks = buildFormBlockTree(tokens);
            const headingBlock = blocks.find(
                (b) => b.kind.variant === "heading",
            );
            expect(headingBlock).toBeDefined();
            expect(headingBlock?.kind).toEqual({
                variant: "heading",
                marker: "s1",
            });
        });
    });

    describe("Round-trip identity", () => {
        const cases: Array<{ name: string; tokens: SerializedLexicalNode[] }> =
            [
                {
                    name: "Heb 1:5 pattern",
                    tokens: [
                        marker("p"),
                        nl(),
                        verse("HEB 1:5"),
                        num("5", "HEB 1:5"),
                        text(" prose...", "HEB 1:5"),
                        marker("q", "HEB 1:5"),
                        text(" line one", "HEB 1:5"),
                        marker("q2", "HEB 1:5"),
                        text(" line two", "HEB 1:5"),
                        marker("b"),
                        marker("p", "HEB 1:5"),
                        text(" more prose", "HEB 1:5"),
                    ],
                },
                {
                    name: "Mt 4:5-6 pattern",
                    tokens: [
                        marker("p"),
                        nl(),
                        verse("MAT 4:5"),
                        num("5", "MAT 4:5"),
                        text(" v5", "MAT 4:5"),
                        verse("MAT 4:6"),
                        num("6", "MAT 4:6"),
                        text(" v6", "MAT 4:6"),
                        marker("q", "MAT 4:6"),
                        text(" poetry", "MAT 4:6"),
                    ],
                },
                {
                    name: "chapter prelude with section heading",
                    tokens: [
                        marker("c"),
                        num("1"),
                        nl(),
                        marker("s1"),
                        text(" Heading"),
                        nl(),
                        marker("p"),
                        nl(),
                        verse("JHN 1:1"),
                        num("1", "JHN 1:1"),
                        text(" In the beginning...", "JHN 1:1"),
                    ],
                },
                {
                    name: "empty paragraph followed by verse",
                    tokens: [
                        marker("p"),
                        nl(),
                        verse("PSA 1:1"),
                        num("1", "PSA 1:1"),
                        text(" Blessed", "PSA 1:1"),
                    ],
                },
            ];

        for (const { name, tokens } of cases) {
            it(`flatten(build(x)) === x for ${name}`, () => {
                const out = flattenFormBlockTree(buildFormBlockTree(tokens));
                expect(out).toEqual(tokens);
            });
        }
    });

    describe("classification edge cases", () => {
        it("treats unknown markers as inline (no new block)", () => {
            const tokens: SerializedLexicalNode[] = [
                marker("p"),
                nl(),
                verse("REV 1:1"),
                num("1", "REV 1:1"),
                text(" body", "REV 1:1"),
                // \zCustom is not in any classification set; stays inline
                marker("zCustom", "REV 1:1"),
                text(" still v1", "REV 1:1"),
            ];
            const blocks = buildFormBlockTree(tokens);
            // 1 \p block; \zCustom does NOT split it
            expect(blocks).toHaveLength(1);
            expect(blocks[0]?.kind).toEqual({
                variant: "paragraph",
                marker: "p",
            });
        });

        it("\\v markers do NOT create new blocks; they create fragments within the current block", () => {
            const tokens: SerializedLexicalNode[] = [
                marker("p"),
                nl(),
                verse("REV 1:1"),
                num("1", "REV 1:1"),
                text(" v1", "REV 1:1"),
                verse("REV 1:2"),
                num("2", "REV 1:2"),
                text(" v2", "REV 1:2"),
            ];
            const blocks = buildFormBlockTree(tokens);
            expect(blocks).toHaveLength(1);
            expect(blocks[0]?.fragments).toHaveLength(2);
            expect(sidsOf(blocks)).toEqual(["REV 1:1", "REV 1:2"]);
        });

        it("does not lose any tokens when verse markers appear with no enclosing paragraph", () => {
            const tokens: SerializedLexicalNode[] = [
                verse("REV 1:1"),
                num("1", "REV 1:1"),
                text(" body", "REV 1:1"),
            ];
            const blocks = buildFormBlockTree(tokens);
            expect(blocks).toHaveLength(1);
            expect(blocks[0]?.kind).toEqual({ variant: "implicit" });
            expect(blocks[0]?.fragments).toHaveLength(1);
            // round-trip still holds
            expect(flattenFormBlockTree(blocks)).toEqual(tokens);
        });
    });
});
