import { useMemo, useRef, useState } from "react";
import { tokensToRenderTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import {
    findChapter,
    listDirtyChapterRefs,
} from "@/app/domain/project/workingFileMutations.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
    createDiffCalculationRunner,
    yieldToMainThread,
} from "@/app/ui/hooks/diffCalculationRunner.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import {
    flattenDiffMap,
    replaceChapterDiffsInMap,
    replaceManyChapterDiffsInMap,
} from "@/core/domain/usfm/usfmOnionDiffMap.ts";
import type { Diff as OnionDiff } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { ChapterRef } from "./shared.ts";

const DIFF_CHUNK_SIZE = 8;

/**
 * Translate low-level USFM diff blocks into the UI-facing diff shape shown in
 * save/review dialogs.
 */
function mapOnionDiffToProjectDiff(
    diff: OnionDiff,
    bookCode: string,
    chapterNum: number,
): ProjectDiff {
    return {
        uniqueKey: diff.blockId,
        semanticSid: diff.semanticSid,
        status: diff.status as ProjectDiff["status"],
        originalDisplayText: diff.originalText,
        currentDisplayText: diff.currentText,
        originalTextOnly: diff.originalTextOnly,
        currentTextOnly: diff.currentTextOnly,
        bookCode,
        chapterNum,
        isWhitespaceChange: diff.isWhitespaceChange,
        isUsfmStructureChange: diff.isUsfmStructureChange,
        originalRenderTokens: tokensToRenderTokens(diff.originalTokens),
        currentRenderTokens: tokensToRenderTokens(diff.currentTokens),
        originalAlignment: diff.originalAlignment,
        currentAlignment: diff.currentAlignment,
        undoSide: diff.undoSide,
    };
}

/**
 * Workspace hook that owns the unsaved-diff modal state.
 *
 * Save/review flows need a chapter-aware diff map that can be opened lazily,
 * refreshed incrementally, and chunked so the UI stays responsive. This hook
 * keeps that concern isolated from the rest of the save pipeline.
 */
export function useDiffModalState(args: {
    workingFilesStore: WorkingFilesStore;
    usfmOnionService: IUsfmOnionService;
    ensureVersionsLoaded: () => Promise<void>;
    closeVersions: () => void;
    closeCompare: () => void;
    bumpDirtyVersion: () => void;
}) {
    const [unsavedDiffsByChapter, setUnsavedDiffsByChapter] =
        useState<DiffsByChapter>({});
    const [isOpen, setIsOpen] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const calculationRunnerRef = useRef(
        createDiffCalculationRunner({
            setIsCalculatingDiffs: setIsCalculating,
            delayMs: 200,
        }),
    );

    async function calculateDiffsForChapter(
        bookCode: string,
        chapterNum: number,
    ): Promise<ProjectDiff[]> {
        const chapter = findChapter(
            args.workingFilesStore.read(),
            bookCode,
            chapterNum,
        );
        if (!chapter || !chapter.dirty) {
            return [];
        }

        const diffs = await args.usfmOnionService.diffTokens(
            chapter.sourceTokens,
            chapter.currentTokens,
        );

        return diffs.map((diff) =>
            mapOnionDiffToProjectDiff(diff, bookCode, chapterNum),
        );
    }

    async function buildUnsavedChapterDiffEntries(chapters: ChapterRef[]) {
        const out: Array<{
            bookCode: string;
            chapterNum: number;
            diffs: ProjectDiff[];
        }> = [];
        for (let i = 0; i < chapters.length; i += DIFF_CHUNK_SIZE) {
            const batch = chapters.slice(i, i + DIFF_CHUNK_SIZE);
            for (const { bookCode, chapterNum } of batch) {
                out.push({
                    bookCode,
                    chapterNum,
                    diffs: await calculateDiffsForChapter(bookCode, chapterNum),
                });
            }
            if (i + DIFF_CHUNK_SIZE < chapters.length) {
                await yieldToMainThread();
            }
        }
        return out;
    }

    async function open() {
        if (isOpen) {
            setIsOpen(false);
            return;
        }

        args.closeVersions();
        setIsOpen(true);
        await args.ensureVersionsLoaded();
        await calculationRunnerRef.current.run(async () => {
            const chaptersToDiff = listDirtyChapterRefs(
                args.workingFilesStore.read(),
            );
            const allDiffs =
                await buildUnsavedChapterDiffEntries(chaptersToDiff);

            setUnsavedDiffsByChapter(
                replaceManyChapterDiffsInMap({
                    previousMap: {},
                    chapterDiffs: allDiffs,
                }),
            );
        });
    }

    function close() {
        setIsOpen(false);
        args.closeCompare();
    }

    function resetUnsavedDiffs() {
        setUnsavedDiffsByChapter({});
    }

    function refreshChapter(bookCode: string, chapterNum: number) {
        args.bumpDirtyVersion();
        if (!isOpen) return;
        void calculationRunnerRef.current.run(async () => {
            const chapterDiffs = await calculateDiffsForChapter(
                bookCode,
                chapterNum,
            );
            setUnsavedDiffsByChapter((prev) =>
                replaceChapterDiffsInMap({
                    previousMap: prev,
                    bookCode,
                    chapterNum,
                    chapterDiffs,
                }),
            );
        });
    }

    async function refreshChapters(chapters: ChapterRef[]) {
        args.bumpDirtyVersion();
        if (!isOpen) return;
        await calculationRunnerRef.current.run(async () => {
            const chapterDiffs = await buildUnsavedChapterDiffEntries(chapters);
            setUnsavedDiffsByChapter((prev) =>
                replaceManyChapterDiffsInMap({
                    previousMap: prev,
                    chapterDiffs,
                }),
            );
        });
    }

    const diffs = useMemo(
        () =>
            flattenDiffMap({
                diffsByChapter: unsavedDiffsByChapter,
                include: (diff) => diff.status !== "unchanged",
            }),
        [unsavedDiffsByChapter],
    );

    return {
        state: {
            isOpen,
            isCalculating,
            diffs,
            diffsByChapter: unsavedDiffsByChapter,
        },
        actions: {
            open,
            close,
            refreshChapter,
            refreshChapters,
            resetUnsavedDiffs,
            setUnsavedDiffsByChapter,
        },
    };
}
