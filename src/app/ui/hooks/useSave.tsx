// hooks/useProjectDiffs.ts

import type { LexicalEditor } from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import {
    diffTokensToRenderTokens,
    lexicalEditorStateToDiffTokens,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import {
    applyIncomingChapter,
    applyIncomingChapterAll,
    applyIncomingHunk,
    buildCompareResultAsync,
    type CompareMetadataSummary,
} from "@/app/domain/project/compare/compareService.ts";
import { CompareSourceLoader } from "@/app/domain/project/compare/compareSourceLoader.ts";
import type {
    CompareBaseline,
    CompareMode,
    CompareSourceKind,
    CompareWarning,
} from "@/app/domain/project/compare/types.ts";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
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
import {
    createDiffCalculationRunner,
    yieldToMainThread,
} from "@/app/ui/hooks/diffCalculationRunner.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import {
    diffChapterTokenStreams,
    flattenDiffMap,
    replaceChapterDiffsInMap,
    replaceManyChapterDiffsInMap,
} from "@/core/domain/usfm/chapterDiffOperation.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type {
    IProjectRepository,
    ListedProject,
    Project,
} from "@/core/persistence/ProjectRepository.ts";

type UseProjectDiffsProps = {
    mutWorkingFilesRef: ParsedFile[];
    editorRef: React.RefObject<LexicalEditor | null>;
    pickedFile: ParsedFile | null;
    pickedChapter: ParsedChapter | null;
    loadedProject: Project;
    history: CustomHistoryHook;
    projectRepository: IProjectRepository;
    directoryProvider: IDirectoryProvider;
    md5Service: IMd5Service;
    editorMode: EditorModeSetting;
    allProjects: ListedProject[];
    currentProjectRoute: string;
};

export type UseProjectDiffsReturn = ReturnType<typeof useProjectDiffs>;
const DIFF_CHUNK_SIZE = 8;

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
    projectRepository,
    directoryProvider,
    md5Service,
    editorMode,
    allProjects,
    currentProjectRoute,
}: UseProjectDiffsProps) {
    const [unsavedDiffsByChapter, setUnsavedDiffsByChapter] =
        useState<DiffsByChapter>({});
    const [openDiffModal, setOpenDiffModal] = useState(false);
    const [isCalculatingDiffs, setIsCalculatingDiffs] = useState(false);
    const [compareMode, setCompareMode] = useState<CompareMode>("unsaved");
    const [compareBaseline, setCompareBaseline] =
        useState<CompareBaseline>("currentSaved");
    const [compareSourceKind, setCompareSourceKind] =
        useState<CompareSourceKind>("existingProject");
    const [compareSourceProjectId, setCompareSourceProjectId] =
        useState<string>("");
    const [compareResult, setCompareResult] = useState<{
        diffsByChapter: DiffsByChapter;
        warnings: CompareWarning[];
        metadata?: CompareMetadataSummary;
        cleanup?: () => Promise<void>;
        sourceFiles?: ParsedFile[];
    } | null>(null);
    const [, setDirtyVersion] = useState(0);
    const calculationRunnerRef = useRef(
        createDiffCalculationRunner({
            setIsCalculatingDiffs,
            delayMs: 200,
        }),
    );

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

        setUnsavedDiffsByChapter((prev) =>
            replaceChapterDiffsInMap({
                previousMap: prev,
                bookCode,
                chapterNum,
                chapterDiffs: calculateDiffsForChapter(bookCode, chapterNum),
            }),
        );
    }

    async function buildUnsavedChapterDiffEntries(
        chapters: Array<{ bookCode: string; chapterNum: number }>,
    ) {
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
                    diffs: calculateDiffsForChapter(bookCode, chapterNum),
                });
            }
            if (i + DIFF_CHUNK_SIZE < chapters.length) {
                await yieldToMainThread();
            }
        }
        return out;
    }

    async function updateDiffMapForChapters(
        chapters: Array<{ bookCode: string; chapterNum: number }>,
    ) {
        bumpDirtyVersion();
        if (!openDiffModal) return;
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
        const activeDiffsByChapter =
            compareMode === "external" && compareResult
                ? compareResult.diffsByChapter
                : unsavedDiffsByChapter;
        return flattenDiffMap({
            diffsByChapter: activeDiffsByChapter,
            include: (diff) => diff.status !== "unchanged",
        });
    }, [unsavedDiffsByChapter, compareMode, compareResult]);

    const activeDiffsByChapter = useMemo(() => {
        if (compareMode === "external" && compareResult) {
            return compareResult.diffsByChapter;
        }
        return unsavedDiffsByChapter;
    }, [compareMode, compareResult, unsavedDiffsByChapter]);

    async function toggleDiffModal(saveCurrentDirtyLexical: () => void) {
        if (openDiffModal) {
            setOpenDiffModal(false);
            return;
        }

        saveCurrentDirtyLexical();
        setOpenDiffModal(true);
        await calculationRunnerRef.current.run(async () => {
            const chaptersToDiff = listDirtyChapterRefs(mutWorkingFilesRef);
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

    const closeModal = useCallback(() => {
        setOpenDiffModal(false);
        if (compareResult?.cleanup) {
            void compareResult.cleanup();
        }
        setCompareResult(null);
    }, [compareResult]);

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

        setUnsavedDiffsByChapter({});
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
                    setDiffsByChapter: setUnsavedDiffsByChapter,
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

    const compareSourceLoader = new CompareSourceLoader({
        projectRepository,
        directoryProvider,
        md5Service,
        editorMode,
    });

    async function computeExternalDiffs(
        sourceFiles: ParsedFile[],
        metadata: CompareMetadataSummary,
        cleanup?: () => Promise<void>,
    ) {
        const result = await buildCompareResultAsync({
            currentFiles: mutWorkingFilesRef,
            config: {
                mode: "external",
                baseline: compareBaseline,
                source: compareSourceProjectId
                    ? {
                          kind: "existingProject",
                          projectId: compareSourceProjectId,
                      }
                    : compareSourceKind === "zipFile"
                      ? { kind: "zipFile" }
                      : { kind: "directory" },
            },
            sourceFiles,
            currentMetadata: {
                projectId: loadedProject.metadata.id,
                languageId: loadedProject.metadata.language.id,
                languageDirection: loadedProject.metadata.language.direction,
            },
            sourceMetadata: metadata,
            batchSize: DIFF_CHUNK_SIZE,
            onBatchComplete: yieldToMainThread,
        });
        setCompareResult({
            diffsByChapter: result.diffsByChapter,
            warnings: result.warnings,
            metadata,
            cleanup,
            sourceFiles,
        });
    }

    async function loadExternalCompareSourceFromProject(projectId: string) {
        if (!projectId) return;
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const loaded =
                await compareSourceLoader.loadExistingProject(projectId);
            setCompareSourceProjectId(projectId);
            await computeExternalDiffs(
                loaded.parsedFiles,
                loaded.metadataSummary,
                loaded.cleanup,
            );
        });
    }

    async function loadExternalCompareSourceFromZip(file: File) {
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const loaded = await compareSourceLoader.loadFromZipFile(file);
            setCompareSourceProjectId("");
            await computeExternalDiffs(
                loaded.parsedFiles,
                loaded.metadataSummary,
                loaded.cleanup,
            );
        });
    }

    async function loadExternalCompareSourceFromDirectory(files: FileList) {
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const loaded =
                await compareSourceLoader.loadFromDirectoryFiles(files);
            setCompareSourceProjectId("");
            await computeExternalDiffs(
                loaded.parsedFiles,
                loaded.metadataSummary,
                loaded.cleanup,
            );
        });
    }

    function rerunExternalCompare() {
        if (!compareResult?.sourceFiles || !compareResult.metadata) return;
        const sourceFiles = compareResult.sourceFiles;
        const metadata = compareResult.metadata;
        const cleanup = compareResult.cleanup;
        void calculationRunnerRef.current.run(async () => {
            await computeExternalDiffs(sourceFiles, metadata, cleanup);
        });
    }

    const resetExternalCompare = useCallback(() => {
        if (compareResult?.cleanup) {
            void compareResult.cleanup();
        }
        setCompareResult(null);
        setCompareSourceProjectId("");
        setCompareSourceKind("existingProject");
    }, [compareResult]);

    function applyExternalIncomingHunk(diff: ProjectDiff) {
        if (!compareResult?.sourceFiles) return;
        void history.runTransaction({
            label: `Take Incoming (${diff.semanticSid})`,
            candidates: [
                { bookCode: diff.bookCode, chapterNum: diff.chapterNum },
            ],
            run: async () => {
                applyIncomingHunk({
                    workingFiles: mutWorkingFilesRef,
                    sourceFiles: compareResult.sourceFiles ?? [],
                    diff,
                    baseline: compareBaseline,
                });
                if (
                    diff.bookCode === pickedFile?.bookCode &&
                    diff.chapterNum === pickedChapter?.chapNumber &&
                    editorRef.current
                ) {
                    const changedChapter = findChapter(
                        mutWorkingFilesRef,
                        diff.bookCode,
                        diff.chapterNum,
                    );
                    if (changedChapter) {
                        editorRef.current.setEditorState(
                            editorRef.current.parseEditorState(
                                changedChapter.lexicalState,
                            ),
                            {
                                tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
                            },
                        );
                    }
                }
                rerunExternalCompare();
            },
        });
    }

    function applyExternalIncomingChapter(
        bookCode: string,
        chapterNum: number,
    ) {
        if (!compareResult?.sourceFiles) return;
        void history.runTransaction({
            label: `Take Incoming Chapter (${bookCode} ${chapterNum})`,
            candidates: [{ bookCode, chapterNum }],
            run: async () => {
                applyIncomingChapter({
                    workingFiles: mutWorkingFilesRef,
                    sourceFiles: compareResult.sourceFiles ?? [],
                    bookCode,
                    chapterNum,
                });
                if (
                    bookCode === pickedFile?.bookCode &&
                    chapterNum === pickedChapter?.chapNumber &&
                    editorRef.current
                ) {
                    const changedChapter = findChapter(
                        mutWorkingFilesRef,
                        bookCode,
                        chapterNum,
                    );
                    if (changedChapter) {
                        editorRef.current.setEditorState(
                            editorRef.current.parseEditorState(
                                changedChapter.lexicalState,
                            ),
                            {
                                tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
                            },
                        );
                    }
                }
                rerunExternalCompare();
            },
        });
    }

    function applyExternalIncomingAll() {
        if (!compareResult?.sourceFiles) return;
        void history.runTransaction({
            label: "Take Incoming All Chapters",
            candidates: getAllChapterRefs(mutWorkingFilesRef),
            run: async () => {
                applyIncomingChapterAll({
                    workingFiles: mutWorkingFilesRef,
                    sourceFiles: compareResult.sourceFiles ?? [],
                });
                rerunExternalCompare();
            },
        });
    }

    const availableCompareProjects = allProjects.filter((project) => {
        const routeProjectId =
            project.projectDirectoryPath.split("/").pop() ??
            project.projectDirectoryPath;
        return routeProjectId !== currentProjectRoute;
    });

    return {
        diffs: diffListForUI,
        diffsByChapter: activeDiffsByChapter,
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
        compareMode,
        setCompareMode,
        compareBaseline,
        setCompareBaseline,
        compareSourceKind,
        setCompareSourceKind,
        compareSourceProjectId,
        setCompareSourceProjectId,
        loadExternalCompareSourceFromProject,
        loadExternalCompareSourceFromZip,
        loadExternalCompareSourceFromDirectory,
        applyExternalIncomingHunk,
        applyExternalIncomingChapter,
        applyExternalIncomingAll,
        compareWarnings: compareResult?.warnings ?? [],
        availableCompareProjects,
        refreshExternalCompare: rerunExternalCompare,
        hasComputedCompare: compareResult !== null,
        resetExternalCompare,
    };
}
