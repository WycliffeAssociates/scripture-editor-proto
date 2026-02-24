// hooks/useProjectDiffs.ts

import type { Change } from "diff";
import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import {
    diffTokensToRenderTokens,
    lexicalEditorStateToDiffTokens,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import {
    buildBooksSavePayload,
    markFilesAsSaved,
    revertAllChaptersToLoadedState,
    revertChapterDiffByBlockId,
    revertChapterToLoadedState,
} from "@/app/domain/project/saveAndRevertService.ts";
import {
    findChapter,
    getAllChapterRefs,
    getDirtyFiles,
    hasUnsavedChanges,
    listDirtyChapterRefs,
} from "@/app/domain/project/workingFileMutations.ts";
import { ShowNotificationSuccess } from "@/app/ui/components/primitives/Notifications.tsx";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import {
    type DiffsByChapterMap,
    diffChapterTokenStreams,
    flattenDiffMap,
    replaceChapterDiffsInMap,
    replaceManyChapterDiffsInMap,
} from "@/core/domain/usfm/chapterDiffOperation.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

type UseProjectDiffsProps = {
    mutWorkingFilesRef: ParsedFile[];
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile | null;
    pickedChapter: ParsedChapter | null;
    loadedProject: Project;
    history: CustomHistoryHook;
};

export type UseProjectDiffsReturn = ReturnType<typeof useProjectDiffs>;

export type ChapterRenderToken = {
    node: SerializedLexicalNode;
    sid: string;
    tokenType?: string;
    marker?: string;
};

export type ProjectDiff = {
    /** Stable per-block id (sid + first-token-id fallback). */
    uniqueKey: string;
    /** Semantic sid string (e.g. "GEN 1:1"). */
    semanticSid: string;
    status: "added" | "deleted" | "modified" | "unchanged";
    originalDisplayText: string;
    currentDisplayText: string;
    originalTextOnly?: string;
    currentTextOnly?: string;
    wordDiff?: Change[];
    bookCode: string;
    chapterNum: number;
    isWhitespaceChange?: boolean;
    isUsfmStructureChange?: boolean;
    originalRenderTokens?: ChapterRenderToken[];
    currentRenderTokens?: ChapterRenderToken[];
};

export type ChapterDiffMap = Record<string, ProjectDiff>;
export type DiffsByChapter = DiffsByChapterMap<ProjectDiff>;

function revertAllChanges({
    mutWorkingFilesRef,
    setDiffsByChapter,
    bumpDirtyVersion,
    pickedFile,
    pickedChapter,
    editorRef,
}: {
    mutWorkingFilesRef: ParsedFile[];
    setDiffsByChapter: (next: DiffsByChapter) => void;
    bumpDirtyVersion: () => void;
    pickedFile: ParsedFile | null;
    pickedChapter: ParsedChapter | null;
    editorRef: React.RefObject<LexicalEditor | null>;
}) {
    revertAllChaptersToLoadedState(mutWorkingFilesRef);

    setDiffsByChapter({});
    bumpDirtyVersion();

    if (pickedFile && pickedChapter && editorRef.current) {
        const currentChap = mutWorkingFilesRef
            .find((file) => file.bookCode === pickedFile.bookCode)
            ?.chapters.find(
                (chap) => chap.chapNumber === pickedChapter.chapNumber,
            );
        if (currentChap) {
            editorRef.current.setEditorState(
                editorRef.current.parseEditorState(currentChap.lexicalState),
                {
                    tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
                },
            );
        }
    }
}

export function useProjectDiffs({
    mutWorkingFilesRef,
    editorRef,
    pickedFile,
    pickedChapter,
    loadedProject,
    history,
}: UseProjectDiffsProps) {
    const [diffsByChapter, setDiffsByChapter] = useState<DiffsByChapter>({});
    const [openDiffModal, setOpenDiffModal] = useState(false);
    const [isCalculatingDiffs, setIsCalculatingDiffs] = useState(false);
    const [, setDirtyVersion] = useState(0);

    const bumpDirtyVersion = () => setDirtyVersion((v) => v + 1);

    const dirty = hasUnsavedChanges(mutWorkingFilesRef);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!dirty) return;

        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);

    function calculateDiffsForChapter(
        bookCode: string,
        chapterNum: number,
    ): ProjectDiff[] {
        const chapToUpdate = findChapter(
            mutWorkingFilesRef,
            bookCode,
            chapterNum,
        );
        if (!chapToUpdate) return [];

        if (!chapToUpdate.dirty) return [];

        const baselineTokens = lexicalEditorStateToDiffTokens(
            chapToUpdate.loadedLexicalState,
        );
        const currentTokens = lexicalEditorStateToDiffTokens(
            chapToUpdate.lexicalState,
        );
        const diffs = diffChapterTokenStreams({
            baselineTokens,
            currentTokens,
        });

        return diffs.map((diff) => {
            return {
                uniqueKey: diff.blockId,
                semanticSid: diff.semanticSid,
                status: diff.status,
                originalDisplayText: diff.originalText,
                currentDisplayText: diff.currentText,
                originalTextOnly: diff.originalTextOnly,
                currentTextOnly: diff.currentTextOnly,
                bookCode,
                chapterNum,
                isWhitespaceChange: diff.isWhitespaceChange,
                isUsfmStructureChange: diff.isUsfmStructureChange,
                originalRenderTokens: diffTokensToRenderTokens(
                    diff.originalTokens,
                ),
                currentRenderTokens: diffTokensToRenderTokens(
                    diff.currentTokens,
                ),
            };
        });
    }

    function updateDiffMapForChapter(bookCode: string, chapterNum: number) {
        bumpDirtyVersion();
        if (!openDiffModal) return;

        setDiffsByChapter((prev) =>
            replaceChapterDiffsInMap({
                previousMap: prev,
                bookCode,
                chapterNum,
                chapterDiffs: calculateDiffsForChapter(bookCode, chapterNum),
            }),
        );
    }

    async function updateDiffMapForChapters(
        chapters: Array<{ bookCode: string; chapterNum: number }>,
    ) {
        bumpDirtyVersion();
        if (!openDiffModal) return;

        setIsCalculatingDiffs(true);
        await new Promise((resolve) => setTimeout(resolve, 0));

        setDiffsByChapter((prev) =>
            replaceManyChapterDiffsInMap({
                previousMap: prev,
                chapterDiffs: chapters.map(({ bookCode, chapterNum }) => ({
                    bookCode,
                    chapterNum,
                    diffs: calculateDiffsForChapter(bookCode, chapterNum),
                })),
            }),
        );

        setIsCalculatingDiffs(false);
    }

    const handleRevert = (diffToRevert: ProjectDiff) => {
        void history.runTransaction({
            label: `Revert Change (${diffToRevert.semanticSid})`,
            candidates: [
                {
                    bookCode: diffToRevert.bookCode,
                    chapterNum: diffToRevert.chapterNum,
                },
            ],
            run: async () => {
                const { bookCode, chapterNum } = diffToRevert;
                const changedChapter = findChapter(
                    mutWorkingFilesRef,
                    bookCode,
                    chapterNum,
                );
                if (!changedChapter) return;

                revertChapterDiffByBlockId({
                    chapter: changedChapter,
                    diffBlockId: diffToRevert.uniqueKey,
                });
                updateDiffMapForChapter(bookCode, chapterNum);

                if (
                    bookCode === pickedFile?.bookCode &&
                    chapterNum === pickedChapter?.chapNumber &&
                    editorRef.current
                ) {
                    editorRef.current.setEditorState(
                        editorRef.current.parseEditorState(
                            changedChapter.lexicalState,
                        ),
                        {
                            tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
                        },
                    );
                }
            },
        });
    };

    const diffListForUI = useMemo(() => {
        return flattenDiffMap({
            diffsByChapter,
            include: (diff) => diff.status !== "unchanged",
        });
    }, [diffsByChapter]);

    async function toggleDiffModal(saveCurrentDirtyLexical: () => void) {
        if (openDiffModal) {
            setOpenDiffModal(false);
            return;
        }

        saveCurrentDirtyLexical();
        setOpenDiffModal(true);
        setIsCalculatingDiffs(true);

        await new Promise((resolve) => setTimeout(resolve, 0));

        const chaptersToDiff = listDirtyChapterRefs(mutWorkingFilesRef);
        const allDiffs = chaptersToDiff.map(({ bookCode, chapterNum }) => ({
            bookCode,
            chapterNum,
            diffs: calculateDiffsForChapter(bookCode, chapterNum),
        }));

        setDiffsByChapter(
            replaceManyChapterDiffsInMap({
                previousMap: {},
                chapterDiffs: allDiffs,
            }),
        );
        setIsCalculatingDiffs(false);
    }

    const closeModal = useCallback(() => {
        setOpenDiffModal(false);
    }, []);

    async function saveProjectToDisk() {
        const filesToSave = getDirtyFiles(mutWorkingFilesRef);
        const toSave = buildBooksSavePayload(filesToSave);

        const savePromise = await Promise.allSettled(
            Object.entries(toSave).map(async ([bookCode, content]) => {
                await loadedProject.addBook({ bookCode, contents: content });
            }),
        );
        await Promise.all(savePromise);

        const error = savePromise.find((p) => p.status === "rejected");
        if (error) {
            console.error(error);
        } else if (Object.keys(toSave).length > 0) {
            ShowNotificationSuccess({
                notification: {
                    message: `Saved ${Object.keys(toSave).length} book(s) successfully`,
                    title: "Project Saved",
                },
            });
        }

        markFilesAsSaved(filesToSave);

        setDiffsByChapter({});
        bumpDirtyVersion();
    }

    const handleRevertAll = () => {
        const candidates = getAllChapterRefs(mutWorkingFilesRef);
        void history.runTransaction({
            label: "Revert All Changes",
            candidates,
            run: async () => {
                revertAllChanges({
                    mutWorkingFilesRef,
                    setDiffsByChapter,
                    bumpDirtyVersion,
                    pickedFile,
                    pickedChapter,
                    editorRef,
                });
            },
        });
    };

    const handleRevertChapter = (bookCode: string, chapterNum: number) => {
        void history.runTransaction({
            label: `Revert Chapter Changes (${bookCode} ${chapterNum})`,
            candidates: [{ bookCode, chapterNum }],
            run: async () => {
                const changedChapter = findChapter(
                    mutWorkingFilesRef,
                    bookCode,
                    chapterNum,
                );
                if (!changedChapter) return;
                revertChapterToLoadedState(changedChapter);
                updateDiffMapForChapter(bookCode, chapterNum);

                if (
                    bookCode === pickedFile?.bookCode &&
                    chapterNum === pickedChapter?.chapNumber &&
                    editorRef.current
                ) {
                    editorRef.current.setEditorState(
                        editorRef.current.parseEditorState(
                            changedChapter.lexicalState,
                        ),
                        {
                            tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
                        },
                    );
                }
            },
        });
    };

    return {
        diffs: diffListForUI,
        diffsByChapter,
        toggleDiffModal,
        openDiffModal,
        closeModal,
        updateDiffMapForChapter,
        updateDiffMapForChapters,
        handleRevert,
        handleRevertChapter,
        handleRevertAll,
        saveProjectToDisk,
        isCalculatingDiffs,
        hasUnsavedChanges: dirty,
    };
}
