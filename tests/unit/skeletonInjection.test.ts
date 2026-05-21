// skeletonInjection.test.ts
//
// Regression-quality tests over the match-formatting skeleton-injection
// pipeline. The user-facing guarantee these protect: running match
// formatting from a richly-formatted reference onto a sparse target
// yields the same marker skeleton (and verse list) that previous
// versions produced.
//
// Each test runs:
//   1. matchFormattingByVerseAnchors   (places inter-verse boundary markers)
//   2. injectSkeletonVersesFromSource  (adds any verse SIDs target lacks)
//   3. injectSkeletonMarkersFromSource (adds any per-verse markers target lacks)
// then asserts on `formatMarkerSkeleton` of the result.

import { describe, expect, it } from "vitest";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import { matchFormattingByVerseAnchors } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import type { PrettifyToken } from "@/core/domain/usfm/prettify/prettifyTokenStream.ts";
import {
    formatMarkerSkeleton,
    injectSkeletonMarkersFromSource,
    injectSkeletonVersesFromSource,
    stripDeprecatedMarkers,
} from "@/core/domain/usfm/skeletonInjection.ts";

const marker = (m: string, sid?: string): PrettifyToken => ({
    tokenType: TokenMap.marker,
    marker: m,
    text: `\\${m}`,
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

const verse = (sid: string) => marker("v", sid);

/**
 * Run the full skeleton pipeline (strip deprecated → match-format →
 * inject skeleton verses → inject skeleton markers) and return the
 * resulting token stream.
 */
function runPipeline(
    sourceTokens: PrettifyToken[],
    targetTokens: PrettifyToken[],
): PrettifyToken[] {
    const cleanSource = stripDeprecatedMarkers(sourceTokens);
    const matched = matchFormattingByVerseAnchors({
        sourceTokens: cleanSource,
        targetTokens,
        scope: "chapter",
    });
    const versesEnriched = injectSkeletonVersesFromSource(
        matched.tokens,
        cleanSource,
    );
    return injectSkeletonMarkersFromSource(versesEnriched, cleanSource);
}

describe("skeleton injection pipeline", () => {
    it("copies verse-bounded paragraph + poetry markers onto target", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("p"),
            nl(),
            verse("PSA 1:1"),
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
            verse("PSA 1:1"),
            number("1", "PSA 1:1"),
            text(" Blessed who does not walk", "PSA 1:1"),
            verse("PSA 1:2"),
            number("2", "PSA 1:2"),
            text(" But", "PSA 1:2"),
        ];
        const out = runPipeline(sourceTokens, targetTokens);
        const skeleton = formatMarkerSkeleton(out);
        // Target now has \p (placed by match-formatting before v1) and
        // \q (injected because source has it inside v1)
        expect(skeleton).toContain("\\p");
        expect(skeleton).toContain("\\q");
        expect(skeleton).toContain("\\v 1");
        expect(skeleton).toContain("\\v 2");
    });

    it("adds missing verses from reference into target", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("p"),
            nl(),
            verse("HEB 9:2"),
            number("2", "HEB 9:2"),
            text(" Lihema", "HEB 9:2"),
            verse("HEB 9:3"),
            number("3", "HEB 9:3"),
            text(" v3", "HEB 9:3"),
            verse("HEB 9:4"),
            number("4", "HEB 9:4"),
            text(" v4", "HEB 9:4"),
            verse("HEB 9:7"),
            number("7", "HEB 9:7"),
            text(" Khulwa", "HEB 9:7"),
        ];
        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("p"),
            nl(),
            verse("HEB 9:2"),
            number("2", "HEB 9:2"),
            text(" target v2", "HEB 9:2"),
            verse("HEB 9:7"),
            number("7", "HEB 9:7"),
            text(" target v7", "HEB 9:7"),
        ];
        const out = runPipeline(sourceTokens, targetTokens);
        const verseNumbers = out
            .filter((t) => t.tokenType === TokenMap.numberRange && t.sid)
            .map((t) => t.text);
        expect(verseNumbers).toContain("2");
        expect(verseNumbers).toContain("3");
        expect(verseNumbers).toContain("4");
        expect(verseNumbers).toContain("7");
    });

    it("strips deprecated \\s5 from source so it never reaches target", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("s5", "MAT 1:1"),
            marker("p"),
            nl(),
            verse("MAT 1:1"),
            number("1", "MAT 1:1"),
            text(" The book of the genealogy", "MAT 1:1"),
        ];
        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            verse("MAT 1:1"),
            number("1", "MAT 1:1"),
            text(" target text", "MAT 1:1"),
        ];
        const out = runPipeline(sourceTokens, targetTokens);
        const sawS5 = out.some(
            (t) => t.tokenType === TokenMap.marker && t.marker === "s5",
        );
        expect(sawS5).toBe(false);
    });

    it("multiset-preserves repeated markers across a verse", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("p"),
            nl(),
            verse("HEB 1:5"),
            number("5", "HEB 1:5"),
            text(" prose", "HEB 1:5"),
            marker("q", "HEB 1:5"),
            text(" line one", "HEB 1:5"),
            marker("q2", "HEB 1:5"),
            text(" line two", "HEB 1:5"),
            marker("p", "HEB 1:5"),
            text(" more prose", "HEB 1:5"),
            marker("q", "HEB 1:5"),
            text(" line three", "HEB 1:5"),
            marker("q2", "HEB 1:5"),
            text(" line four", "HEB 1:5"),
        ];
        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            verse("HEB 1:5"),
            number("5", "HEB 1:5"),
            text(" target prose", "HEB 1:5"),
        ];
        const out = runPipeline(sourceTokens, targetTokens);
        const inV5 = out.filter((t) => t.sid === "HEB 1:5");
        const qCount = inV5.filter(
            (t) => t.tokenType === TokenMap.marker && t.marker === "q",
        ).length;
        const q2Count = inV5.filter(
            (t) => t.tokenType === TokenMap.marker && t.marker === "q2",
        ).length;
        const pCount = inV5.filter(
            (t) => t.tokenType === TokenMap.marker && t.marker === "p",
        ).length;
        // Source has two \q, two \q2, one \p inside v5 → target should
        // mirror all of them (target had none of these to start).
        expect(qCount).toBe(2);
        expect(q2Count).toBe(2);
        expect(pCount).toBe(1);
    });

    it("preserves target-only verses when reference is missing them", () => {
        const sourceTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            marker("p"),
            nl(),
            verse("REV 1:1"),
            number("1", "REV 1:1"),
            text(" v1", "REV 1:1"),
        ];
        const targetTokens: PrettifyToken[] = [
            marker("c"),
            number("1"),
            nl(),
            verse("REV 1:1"),
            number("1", "REV 1:1"),
            text(" target v1", "REV 1:1"),
            verse("REV 1:99"),
            number("99", "REV 1:99"),
            text(" extra target verse", "REV 1:99"),
        ];
        const out = runPipeline(sourceTokens, targetTokens);
        const sids = new Set(
            out
                .filter((t) => t.tokenType === TokenMap.marker && t.marker === "v")
                .map((t) => t.sid),
        );
        expect(sids.has("REV 1:1")).toBe(true);
        expect(sids.has("REV 1:99")).toBe(true);
    });
});

describe("formatMarkerSkeleton", () => {
    it("collapses text spans into …  while preserving marker order", () => {
        const tokens: PrettifyToken[] = [
            marker("p"),
            verse("REV 1:1"),
            number("1", "REV 1:1"),
            text(" content", "REV 1:1"),
            marker("q1", "REV 1:1"),
            text(" poetry", "REV 1:1"),
        ];
        // Trailing text after the last marker is not summarized — `…`
        // only appears between markers as a "there was content here" cue.
        expect(formatMarkerSkeleton(tokens)).toBe("\\p \\v 1 … \\q1");
    });
});
