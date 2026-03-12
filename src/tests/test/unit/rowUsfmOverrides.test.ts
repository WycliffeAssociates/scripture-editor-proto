import { describe, expect, it } from "vitest";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import {
    getRowUsfmOverrideKey,
    resolveRowUsfmMode,
    toggleRowUsfmOverride,
} from "@/app/ui/components/blocks/DiffModal/rowUsfmOverrides.ts";

function makeDiff(partial: Partial<ProjectDiff>): ProjectDiff {
    return {
        uniqueKey: "GEN 1:1::1",
        semanticSid: "GEN 1:1",
        status: "modified",
        originalDisplayText: "a",
        currentDisplayText: "b",
        bookCode: "GEN",
        chapterNum: 1,
        isWhitespaceChange: false,
        ...partial,
    };
}

describe("rowUsfmOverrides", () => {
    it("uses unique key for row identity", () => {
        const diff = makeDiff({ uniqueKey: "GEN 1:2::22" });
        expect(getRowUsfmOverrideKey(diff)).toBe("GEN 1:2::22");
    });

    it("falls back to global showUsfm when no override exists", () => {
        expect(
            resolveRowUsfmMode({
                globalShowUsfmMarkers: false,
                overrides: {},
                rowKey: "k1",
            }),
        ).toBe(false);
        expect(
            resolveRowUsfmMode({
                globalShowUsfmMarkers: true,
                overrides: {},
                rowKey: "k1",
            }),
        ).toBe(true);
    });

    it("toggles local override based on effective current value", () => {
        const first = toggleRowUsfmOverride({
            globalShowUsfmMarkers: false,
            overrides: {},
            rowKey: "k1",
        });
        expect(first.k1).toBe(true);

        const second = toggleRowUsfmOverride({
            globalShowUsfmMarkers: false,
            overrides: first,
            rowKey: "k1",
        });
        expect(second.k1).toBe(false);
    });
});
