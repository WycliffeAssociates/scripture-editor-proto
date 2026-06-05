import { describe, expect, it } from "vitest";
import { classifyEditorContentUpdate } from "@/app/domain/history/classifyEditorUpdate.ts";

const base = {
    hasBeforeSnapshot: true,
    snapshotsEqual: false,
    isHistoryMerge: false,
    isProgrammaticIgnore: false,
};

describe("classifyEditorContentUpdate", () => {
    it("first-snapshot when there is no baseline yet (regardless of tags)", () => {
        expect(
            classifyEditorContentUpdate({
                ...base,
                hasBeforeSnapshot: false,
                isHistoryMerge: true,
            }),
        ).toEqual({ kind: "first-snapshot" });
    });

    it("no-op when the snapshot equals the baseline", () => {
        expect(
            classifyEditorContentUpdate({ ...base, snapshotsEqual: true }),
        ).toEqual({ kind: "no-op" });
    });

    it("history-merge is single-dispatch — never records an entry of its own", () => {
        // Guardrail write-backs ride the latest typing entry when one
        // exists; with no entry to ride they stay out of undo entirely
        // (a fixup re-derives from content, so replay doesn't need it).
        expect(
            classifyEditorContentUpdate({ ...base, isHistoryMerge: true }),
        ).toEqual({ kind: "history-merge" });
        expect(
            classifyEditorContentUpdate({
                ...base,
                isHistoryMerge: true,
                isProgrammaticIgnore: true,
            }),
        ).toEqual({ kind: "history-merge" });
    });

    it("programmatic-ignore (no merge) advances baseline without an entry", () => {
        expect(
            classifyEditorContentUpdate({
                ...base,
                isProgrammaticIgnore: true,
            }),
        ).toEqual({ kind: "programmatic-ignore" });
    });

    it("record-typing for an ordinary content change", () => {
        expect(classifyEditorContentUpdate(base)).toEqual({
            kind: "record-typing",
        });
    });

    it("merge takes precedence over a plain programmatic-ignore branch", () => {
        // historyMerge is checked before the standalone programaticIgnore
        // branch — both tags set => history-merge (stops, no typing).
        expect(
            classifyEditorContentUpdate({
                ...base,
                isHistoryMerge: true,
                isProgrammaticIgnore: true,
            }).kind,
        ).toBe("history-merge");
    });
});
