import { describe, expect, it } from "vitest";
import {
    HistoryManager,
    type HistorySnapshotChange,
} from "@/app/domain/history/HistoryManager.ts";

type Snapshot = {
    value: string;
};
type Selection = {
    anchorOffset: number;
};

function makeChange(
    before: string,
    after: string,
): HistorySnapshotChange<Snapshot> {
    return {
        chapter: { bookCode: "GEN", chapterNum: 1 },
        before: { value: before },
        after: { value: after },
    };
}

describe("HistoryManager", () => {
    it("coalesces typing updates within configured window", () => {
        let nowMs = 0;
        const manager = new HistoryManager<Snapshot>({
            maxEntries: 200,
            coalesceWindowMs: 2500,
            now: () => nowMs,
        });

        manager.recordTypingChange({
            label: "Edit",
            change: makeChange("a", "ab"),
        });

        nowMs = 1000;
        manager.recordTypingChange({
            label: "Edit",
            change: makeChange("ab", "abc"),
        });

        expect(manager.canUndo()).toBe(true);
        expect(manager.peekUndoLabel()).toBe("Edit");

        const undoEntry = manager.undo();
        expect(undoEntry).toBeTruthy();
        expect(undoEntry?.changes).toHaveLength(1);
        expect(undoEntry?.changes[0]?.before.value).toBe("a");
        expect(undoEntry?.changes[0]?.after.value).toBe("abc");

        expect(manager.canUndo()).toBe(false);
        expect(manager.canRedo()).toBe(true);
    });

    it("merges guardrail after-state into latest chapter change", () => {
        const manager = new HistoryManager<Snapshot>({
            maxEntries: 200,
            coalesceWindowMs: 2500,
        });

        manager.recordTypingChange({
            label: "Edit",
            change: makeChange("a", "ab"),
        });

        const merged = manager.mergeLatestChapterAfter(
            { bookCode: "GEN", chapterNum: 1 },
            { value: "ab+" },
            { anchorOffset: 3 },
        );

        expect(merged).toBe(true);

        const undoEntry = manager.undo();
        expect(undoEntry?.changes[0]?.after.value).toBe("ab+");
        expect(undoEntry?.changes[0]?.selectionAfter).toEqual({
            anchorOffset: 3,
        });
    });

    it("coalesces typing selection before and after", () => {
        let nowMs = 0;
        const manager = new HistoryManager<Snapshot>({
            maxEntries: 200,
            coalesceWindowMs: 2500,
            now: () => nowMs,
        });

        manager.recordTypingChange({
            label: "Edit",
            change: {
                ...makeChange("a", "ab"),
                selectionBefore: { anchorOffset: 1 } satisfies Selection,
                selectionAfter: { anchorOffset: 2 } satisfies Selection,
            },
        });

        nowMs = 1000;
        manager.recordTypingChange({
            label: "Edit",
            change: {
                ...makeChange("ab", "abc"),
                selectionBefore: { anchorOffset: 2 } satisfies Selection,
                selectionAfter: { anchorOffset: 3 } satisfies Selection,
            },
        });

        const undoEntry = manager.undo();
        expect(undoEntry?.changes[0]?.selectionBefore).toEqual({
            anchorOffset: 1,
        });
        expect(undoEntry?.changes[0]?.selectionAfter).toEqual({
            anchorOffset: 3,
        });
    });

    it("clears redo branch when a new edit is recorded after undo", () => {
        let nowMs = 0;
        const manager = new HistoryManager<Snapshot>({
            maxEntries: 200,
            coalesceWindowMs: 2500,
            now: () => nowMs,
        });

        manager.recordTypingChange({
            label: "Edit",
            change: makeChange("a", "ab"),
        });
        nowMs = 3000;
        manager.recordTypingChange({
            label: "Edit",
            change: makeChange("ab", "abc"),
        });

        expect(manager.canUndo()).toBe(true);
        manager.undo();
        expect(manager.canRedo()).toBe(true);

        nowMs = 6000;
        manager.recordTypingChange({
            label: "Edit",
            change: makeChange("ab", "ab!"),
        });

        expect(manager.canRedo()).toBe(false);
    });

    it("pushes transactions as a single labeled entry", () => {
        const manager = new HistoryManager<Snapshot>({
            maxEntries: 200,
            coalesceWindowMs: 2500,
        });

        manager.pushTransaction({
            label: "Prettify Book (GEN)",
            changes: [
                makeChange("a", "A"),
                {
                    chapter: { bookCode: "GEN", chapterNum: 2 },
                    before: { value: "b" },
                    after: { value: "B" },
                },
            ],
        });

        expect(manager.peekUndoLabel()).toBe("Prettify Book (GEN)");
        const undoEntry = manager.undo();
        expect(undoEntry?.changes).toHaveLength(2);
    });
});
