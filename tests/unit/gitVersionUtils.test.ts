import { describe, expect, it } from "vitest";
import {
    buildCommitMessage,
    formatChapterSummary,
    parseAppCommitMetadata,
    resolvePreferredBranch,
} from "@/core/persistence/gitVersionUtils.ts";

describe("parseAppCommitMetadata", () => {
    it("parses v1 dovetail commit trailers", () => {
        const parsed = parseAppCommitMetadata({
            subject: "save:2026-02-27T20:30:00.000Z",
            body: [
                "x-dovetail-op: save",
                "x-dovetail-chapters: GEN 1|GEN 2|EXO 3",
                "x-dovetail-version: 1",
            ].join("\n"),
        });

        expect(parsed.isAppCommit).toBe(true);
        expect(parsed.op).toBe("save");
        expect(parsed.chapterSummary).toEqual(["GEN 1", "GEN 2", "EXO 3"]);
    });

    it("marks non-conforming commits as external", () => {
        const parsed = parseAppCommitMetadata({
            subject: "fix punctuation in chapter headings",
            body: "",
        });

        expect(parsed.isAppCommit).toBe(false);
        expect(parsed.chapterSummary).toBeUndefined();
        expect(parsed.isExternal).toBe(true);
    });
});

describe("formatChapterSummary", () => {
    it("truncates chapter refs after three entries", () => {
        const summary = formatChapterSummary([
            "GEN 1",
            "GEN 2",
            "EXO 1",
            "MAT 5",
            "MRK 3",
        ]);

        expect(summary).toBe("GEN 1, GEN 2, EXO 1 +2 more");
    });
});

describe("resolvePreferredBranch", () => {
    it("uses master when available", () => {
        const branch = resolvePreferredBranch({
            current: "main",
            hasMaster: true,
            defaultBranch: "main",
            detached: false,
            prefer: "master",
        });

        expect(branch).toBe("master");
    });

    it("falls back to default branch when master is missing", () => {
        const branch = resolvePreferredBranch({
            current: "feature/a",
            hasMaster: false,
            defaultBranch: "main",
            detached: false,
            prefer: "master",
        });

        expect(branch).toBe("main");
    });
});

describe("buildCommitMessage", () => {
    it("builds subject and trailers for save commits", () => {
        const msg = buildCommitMessage({
            op: "save",
            timestampIso: "2026-02-27T20:30:00.000Z",
            changedChapters: ["GEN 1", "GEN 2"],
        });

        expect(msg).toContain("save:2026-02-27T20:30:00.000Z");
        expect(msg).toContain("x-dovetail-op: save");
        expect(msg).toContain("x-dovetail-chapters: GEN 1|GEN 2");
        expect(msg).toContain("x-dovetail-version: 1");
    });
});
