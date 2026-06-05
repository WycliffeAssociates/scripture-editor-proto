// The doorway-independence contract (findings plan §6.4): the chapter-label
// standardize feature is a domain function invocable with NO finding and NO
// decoration in the call path — a future command surface is one registration
// calling exactly this. Also pins its guards: the crash-recovery gate and the
// nothing-to-do pre-scan both bail before opening a history transaction.
//
// The positive rewrite path is covered at its own seams
// (chapterLabelRewrite.test.ts, chapterLabelTally.test.ts) and through the
// decorator contract (decorateFinding.test.ts).

import { describe, expect, it, vi } from "vitest";
import {
    standardizeChapterLabels,
    type StandardizeChapterLabelsDeps,
} from "@/app/domain/editor/annotations/decorators/chapterLabelStandardize.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";

function makeDeps(
    gate: WorkspaceGateStore,
): StandardizeChapterLabelsDeps & { runTransaction: ReturnType<typeof vi.fn> } {
    const runTransaction = vi.fn();
    return {
        workingFilesStore: new WorkingFilesStore([]),
        interactionGate: gate,
        history: { runTransaction } as unknown as
            StandardizeChapterLabelsDeps["history"],
        usfmOnionService: {} as StandardizeChapterLabelsDeps["usfmOnionService"],
        editorMode: "regular",
        runTransaction,
    };
}

describe("standardizeChapterLabels (domain doorway)", () => {
    it("is a no-op while the interaction gate is closed", async () => {
        const deps = makeDeps(new WorkspaceGateStore({ kind: "saving" }));
        await standardizeChapterLabels("Wase", deps);
        expect(deps.runTransaction).not.toHaveBeenCalled();
    });

    it("bails before the history transaction when no book carries an off-target label", async () => {
        const deps = makeDeps(new WorkspaceGateStore({ kind: "open" }));
        await standardizeChapterLabels("Wase", deps);
        expect(deps.runTransaction).not.toHaveBeenCalled();
    });
});
