import { describe, expect, it } from "vitest";
import { getUndoRedoNotificationTarget } from "@/app/domain/history/historyUndoRedoNotifications.ts";

describe("getUndoRedoNotificationTarget", () => {
    it("returns none when only current chapter was touched", () => {
        expect(
            getUndoRedoNotificationTarget({
                currentChapter: { bookCode: "GEN", chapterNum: 5 },
                touchedChapters: [{ bookCode: "GEN", chapterNum: 5 }],
            }),
        ).toEqual({ kind: "none" });
    });

    it("returns remote chapter when one non-current chapter was touched", () => {
        expect(
            getUndoRedoNotificationTarget({
                currentChapter: { bookCode: "GEN", chapterNum: 6 },
                touchedChapters: [{ bookCode: "GEN", chapterNum: 5 }],
            }),
        ).toEqual({
            kind: "single-remote",
            chapter: { bookCode: "GEN", chapterNum: 5 },
        });
    });

    it("returns count when multiple chapters were touched", () => {
        expect(
            getUndoRedoNotificationTarget({
                currentChapter: { bookCode: "GEN", chapterNum: 6 },
                touchedChapters: [
                    { bookCode: "GEN", chapterNum: 6 },
                    { bookCode: "GEN", chapterNum: 5 },
                ],
            }),
        ).toEqual({
            kind: "multiple",
            count: 2,
        });
    });
});
