import { describe, expect, it } from "vitest";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import {
    buildAutoAcceptIncomingPlan,
    buildBookTextByCodeFromSnapshot,
    collectChangedBookCodes,
    extractBookCodeFromStorageKey,
    hasDiffsByChapter,
    listChangedChapterRefs,
    splitRemoteDiffsByDirtySemanticSid,
} from "@/app/domain/project/remoteSync/incomingReconciliationPlan.ts";

// Minimal ProjectDiff factory — the planner only reads
// semanticSid / uniqueKey / bookCode / chapterNum.
function diff(overrides: Partial<ProjectDiff>): ProjectDiff {
    return {
        uniqueKey: overrides.uniqueKey ?? `${overrides.semanticSid ?? "s"}-key`,
        semanticSid: overrides.semanticSid ?? "sid",
        status: overrides.status ?? "modified",
        originalDisplayText: "",
        currentDisplayText: "",
        bookCode: overrides.bookCode ?? "GEN",
        chapterNum: overrides.chapterNum ?? 1,
        ...overrides,
    };
}

describe("hasDiffsByChapter", () => {
    it("is false for null / empty / all-empty-chapters", () => {
        expect(hasDiffsByChapter(null)).toBe(false);
        expect(hasDiffsByChapter({})).toBe(false);
        expect(hasDiffsByChapter({ GEN: { 1: [] } })).toBe(false);
    });

    it("is true when any chapter has a diff", () => {
        expect(
            hasDiffsByChapter({ GEN: { 1: [], 2: [diff({ chapterNum: 2 })] } }),
        ).toBe(true);
    });
});

describe("listChangedChapterRefs", () => {
    it("returns one ref per non-empty chapter, skipping empties", () => {
        const refs = listChangedChapterRefs({
            GEN: { 1: [diff({})], 2: [] },
            EXO: { 3: [diff({ bookCode: "EXO", chapterNum: 3 })] },
        });
        expect(refs).toEqual([
            { bookCode: "GEN", chapterNum: 1 },
            { bookCode: "EXO", chapterNum: 3 },
        ]);
    });
});

describe("splitRemoteDiffsByDirtySemanticSid", () => {
    it("routes dirty-overlapping diffs to blocked, the rest to auto-accept", () => {
        const diffsByChapter: DiffsByChapter = {
            GEN: {
                1: [
                    diff({ semanticSid: "a", uniqueKey: "a1" }),
                    diff({ semanticSid: "b", uniqueKey: "b1" }),
                ],
            },
        };
        const dirty = new Map([["GEN:1", new Set(["a"])]]);

        const { blockedDiffsByChapter, autoAcceptedDiffs } =
            splitRemoteDiffsByDirtySemanticSid({
                diffsByChapter,
                dirtySemanticSidsByChapter: dirty,
            });

        expect(blockedDiffsByChapter.GEN[1].map((d) => d.semanticSid)).toEqual([
            "a",
        ]);
        expect(autoAcceptedDiffs.map((d) => d.semanticSid)).toEqual(["b"]);
    });

    it("auto-accepts everything when no chapter is dirty", () => {
        const { blockedDiffsByChapter, autoAcceptedDiffs } =
            splitRemoteDiffsByDirtySemanticSid({
                diffsByChapter: { GEN: { 1: [diff({ semanticSid: "a" })] } },
                dirtySemanticSidsByChapter: new Map(),
            });
        expect(blockedDiffsByChapter).toEqual({});
        expect(autoAcceptedDiffs).toHaveLength(1);
    });
});

describe("buildAutoAcceptIncomingPlan", () => {
    it("applies whole chapters with no blocked keys, hunks otherwise", () => {
        const initialDiffsByChapter: DiffsByChapter = {
            GEN: {
                1: [
                    diff({ semanticSid: "a", uniqueKey: "a1" }),
                    diff({ semanticSid: "b", uniqueKey: "b1" }),
                ],
                2: [diff({ semanticSid: "c", uniqueKey: "c1", chapterNum: 2 })],
            },
        };
        // GEN:1 has a blocked key (a1) → hunk-apply only the unblocked (b1);
        // GEN:2 has no blocked keys → full-chapter apply.
        const blockedDiffsByChapter: DiffsByChapter = {
            GEN: { 1: [diff({ semanticSid: "a", uniqueKey: "a1" })] },
        };

        const { fullChapterApplies, hunkApplies } = buildAutoAcceptIncomingPlan({
            initialDiffsByChapter,
            blockedDiffsByChapter,
        });

        expect(fullChapterApplies).toEqual([{ bookCode: "GEN", chapterNum: 2 }]);
        expect(hunkApplies.map((d) => d.uniqueKey)).toEqual(["b1"]);
    });
});

describe("collectChangedBookCodes", () => {
    it("flags books whose text differs (including added/removed)", () => {
        const changed = collectChangedBookCodes({
            baseByBook: new Map([
                ["GEN", "x"],
                ["EXO", "same"],
                ["LEV", "old"],
            ]),
            targetByBook: new Map([
                ["GEN", "x"],
                ["EXO", "same"],
                ["LEV", "new"],
                ["NUM", "added"],
            ]),
        });
        expect(changed).toEqual(new Set(["LEV", "NUM"]));
    });
});

describe("extractBookCodeFromStorageKey", () => {
    it.each([
        ["ingredients/01-GEN.usfm", "GEN"],
        ["GEN.usfm", "GEN"],
        ["path/to/42-mat.usfm", "MAT"],
        ["notes.txt", null],
        ["weird.usfm", null],
    ])("%s -> %s", (key, expected) => {
        expect(extractBookCodeFromStorageKey(key)).toBe(expected);
    });
});

describe("buildBookTextByCodeFromSnapshot", () => {
    it("keys snapshot text by extracted book code, skipping non-usfm", () => {
        const byBook = buildBookTextByCodeFromSnapshot(
            new Map([
                ["ingredients/01-GEN.usfm", "gen-text"],
                ["metadata.json", "{}"],
            ]),
        );
        expect(byBook.get("GEN")).toBe("gen-text");
        expect(byBook.size).toBe(1);
    });
});
