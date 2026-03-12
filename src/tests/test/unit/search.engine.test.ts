import { describe, expect, it } from "vitest";
import {
    alignTargetResultsToReferenceOrder,
    applySort,
    dedupeByVerse,
    pairReferenceResultsToTarget,
} from "@/app/domain/search/SearchProjectionService.ts";
import type { SearchResult } from "@/app/domain/search/SearchService.ts";
import { replaceInNodeText } from "@/core/domain/search/replaceEngine.ts";
import { searchChapters } from "@/core/domain/search/searchEngine.ts";

describe("searchChapters", () => {
    it("supports whole-word and case matching", () => {
        const chapters = [
            {
                bookCode: "MAT",
                chapterNum: 1,
                nodes: [
                    { sid: "MAT 1:1", text: "Word word wording" },
                    { sid: "MAT 1:2", text: "Another WORD" },
                ],
            },
        ];

        const strict = searchChapters(chapters, {
            term: "Word",
            matchCase: true,
            wholeWord: true,
        });
        expect(strict).toHaveLength(1);

        const relaxed = searchChapters(chapters, {
            term: "word",
            matchCase: false,
            wholeWord: true,
        });
        expect(relaxed).toHaveLength(3);
    });
});

describe("replaceInNodeText", () => {
    it("replaces by explicit range", () => {
        const next = replaceInNodeText({
            text: "In the beginning",
            start: 3,
            end: 6,
            replacement: "X",
        });
        expect(next).toBe("In X beginning");
    });
});

describe("SearchProjectionService", () => {
    const referenceResults: SearchResult[] = [
        {
            sid: "MAT 1:1",
            sidOccurrenceIndex: 0,
            text: "alpha",
            bibleIdentifier: "MAT",
            chapNum: 1,
            parsedSid: null,
            isCaseMismatch: true,
            naturalIndex: 0,
            source: "reference",
        },
        {
            sid: "MAT 1:2",
            sidOccurrenceIndex: 0,
            text: "beta",
            bibleIdentifier: "MAT",
            chapNum: 1,
            parsedSid: null,
            isCaseMismatch: false,
            naturalIndex: 1,
            source: "reference",
        },
    ];

    it("pairs reference rows with target sid text", () => {
        const paired = pairReferenceResultsToTarget({
            referenceResults,
            targetSidText: new Map([
                ["MAT 1:1", "target one"],
                ["MAT 1:2", "target two"],
            ]),
        });

        expect(paired.map((row) => row.text)).toEqual([
            "target one",
            "target two",
        ]);
        expect(paired.every((row) => row.source === "target")).toBe(true);
    });

    it("aligns target rows to reference order", () => {
        const targetRows = [
            { ...referenceResults[1], source: "target" as const, text: "B" },
            { ...referenceResults[0], source: "target" as const, text: "A" },
        ];

        const aligned = alignTargetResultsToReferenceOrder({
            referenceResults,
            unsortedTargetResults: targetRows,
        });

        expect(aligned.map((r) => r.sid)).toEqual(["MAT 1:1", "MAT 1:2"]);
    });

    it("supports case mismatch sort", () => {
        const sorted = applySort(referenceResults, "caseMismatch");
        expect(sorted[0]?.isCaseMismatch).toBe(true);
    });

    it("dedupes rows by verse while preserving first occurrence metadata", () => {
        const rows: SearchResult[] = [
            {
                sid: "MAT 1:1",
                sidOccurrenceIndex: 0,
                text: "alpha alpha",
                bibleIdentifier: "MAT",
                chapNum: 1,
                parsedSid: null,
                isCaseMismatch: false,
                naturalIndex: 0,
                source: "target",
            },
            {
                sid: "MAT 1:1",
                sidOccurrenceIndex: 1,
                text: "alpha alpha",
                bibleIdentifier: "MAT",
                chapNum: 1,
                parsedSid: null,
                isCaseMismatch: true,
                naturalIndex: 1,
                source: "target",
            },
            {
                sid: "MAT 1:1",
                sidOccurrenceIndex: 0,
                text: "alpha alpha",
                bibleIdentifier: "MAT",
                chapNum: 1,
                parsedSid: null,
                isCaseMismatch: false,
                naturalIndex: 2,
                source: "reference",
            },
            {
                sid: "MAT 2:1",
                sidOccurrenceIndex: 0,
                text: "alpha",
                bibleIdentifier: "MAT",
                chapNum: 2,
                parsedSid: null,
                isCaseMismatch: false,
                naturalIndex: 3,
                source: "target",
            },
        ];

        const deduped = dedupeByVerse(rows);
        expect(deduped).toHaveLength(3);
        expect(deduped[0]).toMatchObject({
            sid: "MAT 1:1",
            sidOccurrenceIndex: 0,
            naturalIndex: 0,
            isCaseMismatch: false,
            source: "target",
        });
        expect(deduped[1]).toMatchObject({
            sid: "MAT 1:1",
            source: "reference",
        });
        expect(deduped[2]).toMatchObject({
            sid: "MAT 2:1",
            chapNum: 2,
        });
    });

    it("produces 1:1 deduped reference/target rows for same verse", () => {
        const rawReferenceRows: SearchResult[] = [
            {
                sid: "MAT 1:1",
                sidOccurrenceIndex: 0,
                text: "alpha alpha",
                bibleIdentifier: "MAT",
                chapNum: 1,
                parsedSid: null,
                isCaseMismatch: false,
                naturalIndex: 0,
                source: "reference",
            },
            {
                sid: "MAT 1:1",
                sidOccurrenceIndex: 1,
                text: "alpha alpha",
                bibleIdentifier: "MAT",
                chapNum: 1,
                parsedSid: null,
                isCaseMismatch: false,
                naturalIndex: 1,
                source: "reference",
            },
            {
                sid: "MAT 1:2",
                sidOccurrenceIndex: 0,
                text: "alpha",
                bibleIdentifier: "MAT",
                chapNum: 1,
                parsedSid: null,
                isCaseMismatch: false,
                naturalIndex: 2,
                source: "reference",
            },
        ];

        const dedupedReferenceRows = dedupeByVerse(rawReferenceRows);
        const pairedTargetRows = pairReferenceResultsToTarget({
            referenceResults: dedupedReferenceRows,
            targetSidText: new Map([
                ["MAT 1:1", "target one"],
                ["MAT 1:2", "target two"],
            ]),
        });

        expect(dedupedReferenceRows.map((row) => row.sid)).toEqual([
            "MAT 1:1",
            "MAT 1:2",
        ]);
        expect(pairedTargetRows).toHaveLength(dedupedReferenceRows.length);
        expect(pairedTargetRows.map((row) => row.sidOccurrenceIndex)).toEqual([
            0, 0,
        ]);
    });
});
