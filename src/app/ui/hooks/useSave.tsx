// hooks/useProjectDiffs.ts

import type { LexicalEditor } from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { loadedProjectToParsedFiles } from "@/app/domain/api/loadedProjectToParsedFiles.ts";
import type { ProjectFingerprintService } from "@/app/domain/cache/ProjectFingerprintService.ts";
import type { ProjectWarmCacheProvider } from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import { refreshProjectWarmCache } from "@/app/domain/cache/refreshProjectWarmCache.ts";
import {
    diffTokensToRenderTokens,
    lexicalEditorStateToDiffTokens,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { GIT_COMMIT_AUTHOR } from "@/app/domain/git/gitConstants.ts";
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
import { applyVersionSnapshotToWorkingFiles } from "@/app/domain/project/versionNavigationService.ts";
import {
    findChapter,
    getAllChapterRefs,
    getDirtyFiles,
    hasUnsavedChanges,
    listDirtyChapterRefs,
} from "@/app/domain/project/workingFileMutations.ts";
import {
    ShowErrorNotification,
    ShowNotificationSuccess,
} from "@/app/ui/components/primitives/Notifications.tsx";
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
    GitProvider,
    VersionEntry,
} from "@/core/persistence/GitProvider.ts";
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
    gitProvider: GitProvider;
    projectWarmCacheProvider: ProjectWarmCacheProvider;
    projectFingerprintService: ProjectFingerprintService;
    editorMode: EditorModeSetting;
    allProjects: ListedProject[];
    currentProjectRoute: string;
};

export type UseProjectDiffsReturn = ReturnType<typeof useProjectDiffs>;
const DIFF_CHUNK_SIZE = 8;
const VERSIONS_PAGE_SIZE = 50;

type PendingVersionAction =
    | { type: "open" }
    | { type: "switch"; hash: string }
    | { type: "latest" };

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
    gitProvider,
    projectWarmCacheProvider,
    projectFingerprintService,
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
    const [compareSourceVersionHash, setCompareSourceVersionHash] =
        useState<string>("");
    const [compareResult, setCompareResult] = useState<{
        diffsByChapter: DiffsByChapter;
        warnings: CompareWarning[];
        metadata?: CompareMetadataSummary;
        cleanup?: () => Promise<void>;
        sourceFiles?: ParsedFile[];
    } | null>(null);
    const [openVersionModal, setOpenVersionModal] = useState(false);
    const [versions, setVersions] = useState<VersionEntry[]>([]);
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [versionOffset, setVersionOffset] = useState(0);
    const [latestVersionHash, setLatestVersionHash] = useState<string | null>(
        null,
    );
    const [selectedVersionHash, setSelectedVersionHash] = useState<
        string | null
    >(null);
    const [openVersionDirtyPrompt, setOpenVersionDirtyPrompt] = useState(false);
    const [pendingVersionAction, setPendingVersionAction] =
        useState<PendingVersionAction | null>(null);
    const [, setDirtyVersion] = useState(0);
    const calculationRunnerRef = useRef(
        createDiffCalculationRunner({
            setIsCalculatingDiffs,
            delayMs: 200,
        }),
    );
    const saveCurrentDirtyRef = useRef<(() => void) | null>(null);

    const bumpDirtyVersion = () => setDirtyVersion((v) => v + 1);

    const dirty = hasUnsavedChanges(mutWorkingFilesRef);
    const isViewingOlderVersion = Boolean(
        selectedVersionHash &&
            latestVersionHash &&
            selectedVersionHash !== latestVersionHash,
    );

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
        setOpenVersionModal(false);
        setOpenDiffModal(true);
        if (versions.length === 0) {
            void refreshVersionHistory();
        }
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

    function projectRelativePath(absolutePath: string): string {
        const root = loadedProject.projectDir.path.replace(/\/+$/u, "");
        return absolutePath.startsWith(`${root}/`)
            ? absolutePath.slice(root.length + 1)
            : absolutePath;
    }

    async function refreshVersionHistory() {
        setIsLoadingVersions(true);
        try {
            const next = await gitProvider.listHistory(
                loadedProject.projectDir.path,
                {
                    limit: VERSIONS_PAGE_SIZE,
                    offset: 0,
                },
            );
            setVersions(next);
            setVersionOffset(next.length);
            const latestHash = next[0]?.hash ?? null;
            setLatestVersionHash(latestHash);
            setSelectedVersionHash((prev) => {
                if (!latestHash) return null;
                if (!prev) return latestHash;
                return next.some((entry) => entry.hash === prev)
                    ? prev
                    : latestHash;
            });
        } finally {
            setIsLoadingVersions(false);
        }
    }

    async function loadMoreVersions() {
        if (isLoadingVersions) return;
        setIsLoadingVersions(true);
        try {
            const next = await gitProvider.listHistory(
                loadedProject.projectDir.path,
                {
                    limit: VERSIONS_PAGE_SIZE,
                    offset: versionOffset,
                },
            );
            setVersions((prev) => [...prev, ...next]);
            setVersionOffset((prev) => prev + next.length);
        } finally {
            setIsLoadingVersions(false);
        }
    }

    async function snapshotToParsedFiles(snapshot: Map<string, string>) {
        const virtualProject = {
            ...loadedProject,
            getBook: async (bookCode: string) => {
                const file = loadedProject.files.find(
                    (candidate) => candidate.bookCode === bookCode,
                );
                if (!file) return null;
                return snapshot.get(projectRelativePath(file.path)) ?? null;
            },
        } as Project;

        const parsed = await loadedProjectToParsedFiles({
            loadedProject: virtualProject,
            editorMode,
        });
        return parsed.parsedFiles;
    }

    async function applyVersionHash(hash: string) {
        const snapshot = await gitProvider.readProjectSnapshotAtCommit(
            loadedProject.projectDir.path,
            hash,
        );
        const sourceFiles = await snapshotToParsedFiles(snapshot);
        await history.runTransaction({
            label: "Load Previous Version",
            candidates: getAllChapterRefs(mutWorkingFilesRef),
            run: async () => {
                applyVersionSnapshotToWorkingFiles({
                    workingFiles: mutWorkingFilesRef,
                    sourceFiles,
                });
                if (pickedFile && pickedChapter && editorRef.current) {
                    const changedChapter = findChapter(
                        mutWorkingFilesRef,
                        pickedFile.bookCode,
                        pickedChapter.chapNumber,
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
                bumpDirtyVersion();
            },
        });
        history.clearHistory();
        setSelectedVersionHash(hash);
    }

    async function performPendingVersionAction(action: PendingVersionAction) {
        if (action.type === "open") {
            await refreshVersionHistory();
            setOpenVersionModal(true);
            return;
        }
        if (action.type === "switch") {
            await applyVersionHash(action.hash);
            return;
        }
        if (action.type === "latest" && latestVersionHash) {
            await applyVersionHash(latestVersionHash);
        }
    }

    async function openPreviousVersions(saveCurrentDirtyLexical: () => void) {
        saveCurrentDirtyRef.current = saveCurrentDirtyLexical;
        saveCurrentDirtyLexical();
        setOpenDiffModal(false);
        if (hasUnsavedChanges(mutWorkingFilesRef)) {
            setPendingVersionAction({ type: "open" });
            setOpenVersionDirtyPrompt(true);
            return;
        }
        await refreshVersionHistory();
        setOpenVersionModal(true);
    }

    async function selectVersion(
        hash: string,
        saveCurrentDirtyLexical: () => void,
    ) {
        if (!hash || hash === selectedVersionHash) return;
        saveCurrentDirtyRef.current = saveCurrentDirtyLexical;
        saveCurrentDirtyLexical();
        if (hasUnsavedChanges(mutWorkingFilesRef)) {
            setPendingVersionAction({ type: "switch", hash });
            setOpenVersionDirtyPrompt(true);
            return;
        }
        await applyVersionHash(hash);
    }

    async function backToLatest(saveCurrentDirtyLexical: () => void) {
        if (!latestVersionHash || selectedVersionHash === latestVersionHash) {
            return;
        }
        saveCurrentDirtyRef.current = saveCurrentDirtyLexical;
        saveCurrentDirtyLexical();
        if (hasUnsavedChanges(mutWorkingFilesRef)) {
            setPendingVersionAction({ type: "latest" });
            setOpenVersionDirtyPrompt(true);
            return;
        }
        await applyVersionHash(latestVersionHash);
    }

    async function closePreviousVersions(saveCurrentDirtyLexical: () => void) {
        setOpenVersionModal(false);
        await backToLatest(saveCurrentDirtyLexical);
    }

    function dismissVersionDirtyPrompt() {
        setOpenVersionDirtyPrompt(false);
        setPendingVersionAction(null);
    }

    async function continueVersionPromptDiscard() {
        revertAllChanges({
            mutWorkingFilesRef,
            setDiffsByChapter: setUnsavedDiffsByChapter,
            bumpDirtyVersion,
            pickedFile,
            pickedChapter,
            editorRef,
        });
        const action = pendingVersionAction;
        dismissVersionDirtyPrompt();
        if (action) {
            await performPendingVersionAction(action);
        }
    }

    function continueVersionPromptSave() {
        dismissVersionDirtyPrompt();
        setOpenVersionModal(false);
        const saveCurrentDirtyLexical = saveCurrentDirtyRef.current;
        if (saveCurrentDirtyLexical) {
            void toggleDiffModal(saveCurrentDirtyLexical);
            return;
        }
        setOpenDiffModal(true);
    }

    async function saveProjectToDisk() {
        const dirtyChapterRefs = listDirtyChapterRefs(mutWorkingFilesRef).map(
            ({ bookCode, chapterNum }) => `${bookCode} ${chapterNum}`,
        );
        const filesToSave = getDirtyFiles(mutWorkingFilesRef);
        const toSave = buildBooksSavePayload(filesToSave);

        if (isViewingOlderVersion && selectedVersionHash) {
            await gitProvider.restoreTrackedFilesFromCommit(
                loadedProject.projectDir.path,
                selectedVersionHash,
            );
        }

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
            try {
                await gitProvider.commitAll(
                    loadedProject.projectDir.path,
                    {
                        op: "save",
                        timestampIso: new Date().toISOString(),
                        changedChapters: dirtyChapterRefs,
                    },
                    GIT_COMMIT_AUTHOR,
                );
            } catch (commitErr) {
                console.error("Version checkpoint creation failed:", commitErr);
                ShowErrorNotification({
                    notification: {
                        title: "Version History Warning",
                        message:
                            "Your changes were saved, but a local version checkpoint could not be created.",
                    },
                });
            }
            await refreshVersionHistory();
        }

        markFilesAsSaved(filesToSave);

        if (Object.keys(toSave).length > 0) {
            try {
                await refreshProjectWarmCache({
                    loadedProject,
                    workingFiles: mutWorkingFilesRef,
                    savedBookContentsByCode: toSave,
                    projectWarmCacheProvider,
                    projectFingerprintService,
                });
            } catch (cacheErr) {
                console.warn("Warm reopen cache refresh failed:", cacheErr);
            }
        }

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
        projectWarmCacheProvider,
        projectFingerprintService,
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
                    : compareSourceKind === "previousVersion" &&
                        compareSourceVersionHash
                      ? {
                            kind: "previousVersion",
                            commitHash: compareSourceVersionHash,
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
            setCompareSourceVersionHash("");
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
            setCompareSourceVersionHash("");
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
            setCompareSourceVersionHash("");
            await computeExternalDiffs(
                loaded.parsedFiles,
                loaded.metadataSummary,
                loaded.cleanup,
            );
        });
    }

    async function loadExternalCompareSourceFromVersion(commitHash: string) {
        if (!commitHash) return;
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const snapshot = await gitProvider.readProjectSnapshotAtCommit(
                loadedProject.projectDir.path,
                commitHash,
            );
            const parsedFiles = await snapshotToParsedFiles(snapshot);
            setCompareSourceProjectId("");
            setCompareSourceVersionHash(commitHash);
            await computeExternalDiffs(parsedFiles, {
                projectId: `version:${commitHash.slice(0, 7)}`,
                languageId: loadedProject.metadata.language.id,
                languageDirection: loadedProject.metadata.language.direction,
            });
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
        setCompareSourceVersionHash("");
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
        openPreviousVersions,
        closePreviousVersions,
        openVersionModal,
        setOpenVersionModal,
        versions,
        isLoadingVersions,
        loadMoreVersions,
        selectVersion,
        selectedVersionHash,
        latestVersionHash,
        backToLatest,
        isViewingOlderVersion,
        openVersionDirtyPrompt,
        dismissVersionDirtyPrompt,
        continueVersionPromptDiscard,
        continueVersionPromptSave,
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
        compareSourceVersionHash,
        setCompareSourceVersionHash,
        loadExternalCompareSourceFromProject,
        loadExternalCompareSourceFromZip,
        loadExternalCompareSourceFromDirectory,
        loadExternalCompareSourceFromVersion,
        applyExternalIncomingHunk,
        applyExternalIncomingChapter,
        applyExternalIncomingAll,
        compareWarnings: compareResult?.warnings ?? [],
        availableCompareProjects,
        refreshExternalCompare: rerunExternalCompare,
        hasComputedCompare: compareResult !== null,
        resetExternalCompare,
        compareVersionOptions: versions.map((version) => ({
            value: version.hash,
            label: new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
            }).format(new Date(version.authoredAtIso)),
        })),
    };
}
