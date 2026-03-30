import type { LexicalEditor } from "lexical";
import { useMemo, useRef, useState } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import {
    applyIncomingChapter,
    applyIncomingChapterAll,
    applyIncomingHunk,
} from "@/app/domain/project/compare/compareMutations.ts";
import {
    buildCompareResultAsync,
    type CompareMetadataSummary,
} from "@/app/domain/project/compare/compareService.ts";
import { CompareSourceLoader } from "@/app/domain/project/compare/compareSourceLoader.ts";
import type {
    CompareMode,
    CompareSourceKind,
    CompareWarning,
} from "@/app/domain/project/compare/types.ts";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { snapshotToScriptureBookStates } from "@/app/domain/project/versionSnapshotAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
    createDiffCalculationRunner,
    yieldToMainThread,
} from "@/app/ui/hooks/diffCalculationRunner.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type {
    GitProvider,
    VersionEntry,
} from "@/core/persistence/GitProvider.ts";
import type {
    Project,
    ProjectListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type {
    OpenProjectService,
    ReadOnlyOpenProjectService,
} from "@/core/persistence/WorkspaceService.ts";
import {
    buildCurrentProjectCompareMetadata,
    type ChapterRef,
    selectScriptureBookStatesForChapterRefs,
    syncEditorToChapter,
} from "./shared.ts";

const DIFF_CHUNK_SIZE = 8;

/**
 * External-compare hook for the scripture workspace.
 *
 * This hook loads an external baseline (other project, prior version, zip, or
 * directory), runs chapter-aware diffs against the current in-memory workspace,
 * and exposes apply/refresh helpers for the compare UI.
 */
export function useExternalCompare(args: {
    mutWorkingFilesRef: ScriptureBookState[];
    loadedProject: Project;
    projectsService: OpenProjectService & ReadOnlyOpenProjectService;
    fileSystem: FileSystem;
    storageRoots: StorageRoots;
    editorMode: EditorModeSetting;
    usfmOnionService: IUsfmOnionService;
    allProjects: ProjectListItem[];
    currentProjectRoute: string;
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
    editorRef: React.RefObject<LexicalEditor | null>;
    history: CustomHistoryHook;
    gitProvider: GitProvider;
    versions: VersionEntry[];
    authSessionProvider: AuthSessionProvider;
}) {
    const [mode, setMode] = useState<CompareMode>("unsaved");
    const [sourceKind, setSourceKind] =
        useState<CompareSourceKind>("existingProject");
    const [sourceProjectId, setSourceProjectId] = useState("");
    const [sourceVersionHash, setSourceVersionHash] = useState("");
    const [compareResult, setCompareResult] = useState<{
        diffsByChapter: DiffsByChapter;
        warnings: CompareWarning[];
        metadata?: CompareMetadataSummary;
        cleanup?: () => Promise<void>;
        sourceFiles?: ScriptureBookState[];
    } | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const calculationRunnerRef = useRef(
        createDiffCalculationRunner({
            setIsCalculatingDiffs: setIsCalculating,
            delayMs: 200,
        }),
    );
    const compareSourceLoader = new CompareSourceLoader({
        projectsService: args.projectsService,
        fileSystem: args.fileSystem,
        storageRoots: args.storageRoots,
        editorMode: args.editorMode,
        usfmOnionService: args.usfmOnionService,
        authSessionProvider: args.authSessionProvider,
        gitProvider: args.gitProvider,
    });

    function buildExternalCompareConfig() {
        return {
            mode: "external" as const,
            source: sourceProjectId
                ? {
                      kind: "existingProject" as const,
                      projectId: sourceProjectId,
                  }
                : sourceKind === "previousVersion" && sourceVersionHash
                  ? {
                        kind: "previousVersion" as const,
                        commitHash: sourceVersionHash,
                    }
                  : sourceKind === "remoteLatest"
                    ? { kind: "remoteLatest" as const }
                    : sourceKind === "zipFile"
                      ? { kind: "zipFile" as const }
                      : { kind: "directory" as const },
        };
    }

    async function computeExternalDiffs(
        sourceFiles: ScriptureBookState[],
        metadata: CompareMetadataSummary,
        cleanup?: () => Promise<void>,
    ) {
        const result = await buildCompareResultAsync({
            currentFiles: args.mutWorkingFilesRef,
            usfmOnionService: args.usfmOnionService,
            config: buildExternalCompareConfig(),
            sourceFiles,
            currentMetadata: buildCurrentProjectCompareMetadata(
                args.loadedProject,
            ),
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

    async function rerunForChapters(chapters: ChapterRef[]) {
        if (!compareResult?.sourceFiles || !compareResult.metadata) return;

        const result = await buildCompareResultAsync({
            currentFiles: selectScriptureBookStatesForChapterRefs(
                args.mutWorkingFilesRef,
                chapters,
            ),
            sourceFiles: selectScriptureBookStatesForChapterRefs(
                compareResult.sourceFiles,
                chapters,
            ),
            currentMetadata: buildCurrentProjectCompareMetadata(
                args.loadedProject,
            ),
            sourceMetadata: compareResult.metadata,
            usfmOnionService: args.usfmOnionService,
            config: buildExternalCompareConfig(),
            batchSize: DIFF_CHUNK_SIZE,
            onBatchComplete: yieldToMainThread,
        });

        setCompareResult((prev) => {
            if (!prev) return prev;
            const merged: DiffsByChapter = structuredClone(prev.diffsByChapter);
            for (const { bookCode, chapterNum } of chapters) {
                let book = merged[bookCode];
                if (!book) {
                    book = {};
                    merged[bookCode] = book;
                }
                book[chapterNum] =
                    result.diffsByChapter[bookCode]?.[chapterNum] ?? [];
            }
            return {
                ...prev,
                diffsByChapter: merged,
            };
        });
    }

    function refresh() {
        if (!compareResult?.sourceFiles || !compareResult.metadata) return;
        const { sourceFiles, metadata, cleanup } = compareResult;
        void calculationRunnerRef.current.run(async () => {
            await computeExternalDiffs(sourceFiles, metadata, cleanup);
        });
    }

    const reset = () => {
        if (compareResult?.cleanup) {
            void compareResult.cleanup();
        }
        setCompareResult(null);
        setSourceProjectId("");
        setSourceVersionHash("");
        setSourceKind("existingProject");
    };

    async function loadFromProject(projectId: string) {
        if (!projectId) return;
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const loaded =
                await compareSourceLoader.loadExistingProject(projectId);
            setSourceProjectId(projectId);
            setSourceVersionHash("");
            await computeExternalDiffs(
                loaded.parsedFiles,
                loaded.metadataSummary,
                loaded.cleanup,
            );
        });
    }

    async function loadFromZip(file: File) {
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const loaded = await compareSourceLoader.loadFromZipFile(file);
            setSourceProjectId("");
            setSourceVersionHash("");
            await computeExternalDiffs(
                loaded.parsedFiles,
                loaded.metadataSummary,
                loaded.cleanup,
            );
        });
    }

    async function loadFromDirectory(files: FileList) {
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const loaded =
                await compareSourceLoader.loadFromDirectoryFiles(files);
            setSourceProjectId("");
            setSourceVersionHash("");
            await computeExternalDiffs(
                loaded.parsedFiles,
                loaded.metadataSummary,
                loaded.cleanup,
            );
        });
    }

    async function loadFromVersion(commitHash: string) {
        if (!commitHash) return;
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const snapshot = await args.gitProvider.readProjectSnapshotAtCommit(
                args.loadedProject.projectPath,
                commitHash,
            );
            const parsedFiles = await snapshotToScriptureBookStates({
                loadedProject: args.loadedProject,
                snapshot,
                editorMode: args.editorMode,
                usfmOnionService: args.usfmOnionService,
            });
            setSourceProjectId("");
            setSourceVersionHash(commitHash);
            await computeExternalDiffs(
                parsedFiles,
                buildCurrentProjectCompareMetadata(args.loadedProject),
            );
        });
    }

    async function loadFromRemoteLatest() {
        await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const loaded = await compareSourceLoader.loadRemoteLatest(
                args.loadedProject,
            );
            setSourceProjectId("");
            setSourceVersionHash("");
            await computeExternalDiffs(
                loaded.parsedFiles,
                loaded.metadataSummary,
                loaded.cleanup,
            );
        });
    }

    function applyIncomingHunkToCurrent(diff: ProjectDiff) {
        if (!compareResult?.sourceFiles) return;
        void args.history.runTransaction({
            label: `Take Incoming (${diff.semanticSid})`,
            candidates: [
                { bookCode: diff.bookCode, chapterNum: diff.chapterNum },
            ],
            run: async () => {
                await applyIncomingHunk({
                    workingFiles: args.mutWorkingFilesRef,
                    sourceFiles: compareResult.sourceFiles ?? [],
                    diff,
                    usfmOnionService: args.usfmOnionService,
                });
                syncEditorToChapter({
                    editorRef: args.editorRef,
                    workingFiles: args.mutWorkingFilesRef,
                    pickedFile: args.pickedFile,
                    pickedChapter: args.pickedChapter,
                    bookCode: diff.bookCode,
                    chapterNum: diff.chapterNum,
                });
                await rerunForChapters([
                    {
                        bookCode: diff.bookCode,
                        chapterNum: diff.chapterNum,
                    },
                ]);
            },
        });
    }

    function applyIncomingChapterToCurrent(
        bookCode: string,
        chapterNum: number,
    ) {
        if (!compareResult?.sourceFiles) return;
        void args.history.runTransaction({
            label: `Take Incoming Chapter (${bookCode} ${chapterNum})`,
            candidates: [{ bookCode, chapterNum }],
            run: async () => {
                applyIncomingChapter({
                    workingFiles: args.mutWorkingFilesRef,
                    sourceFiles: compareResult.sourceFiles ?? [],
                    bookCode,
                    chapterNum,
                });
                syncEditorToChapter({
                    editorRef: args.editorRef,
                    workingFiles: args.mutWorkingFilesRef,
                    pickedFile: args.pickedFile,
                    pickedChapter: args.pickedChapter,
                    bookCode,
                    chapterNum,
                });
                await rerunForChapters([{ bookCode, chapterNum }]);
            },
        });
    }

    function applyIncomingAllToCurrent() {
        if (!compareResult?.sourceFiles) return;
        void args.history.runTransaction({
            label: "Take All Incoming Chapters",
            candidates: args.mutWorkingFilesRef.flatMap((file) =>
                file.chapters.map((chapter) => ({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapterNumber,
                })),
            ),
            run: async () => {
                applyIncomingChapterAll({
                    workingFiles: args.mutWorkingFilesRef,
                    sourceFiles: compareResult.sourceFiles ?? [],
                });
                refresh();
            },
        });
    }

    const availableProjects = useMemo(
        () =>
            args.allProjects.filter(
                (project) => project.folderName !== args.currentProjectRoute,
            ),
        [args.allProjects, args.currentProjectRoute],
    );

    const versionOptions = useMemo(
        () =>
            args.versions.map((version) => ({
                value: version.hash,
                label: new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                }).format(new Date(version.authoredAtIso)),
            })),
        [args.versions],
    );

    return {
        state: {
            mode,
            sourceKind,
            sourceProjectId,
            sourceVersionHash,
            warnings: compareResult?.warnings ?? [],
            hasComputed: compareResult !== null,
            availableProjects,
            versionOptions,
            diffsByChapter: compareResult?.diffsByChapter ?? null,
            isCalculating,
        },
        actions: {
            setMode,
            setSourceKind,
            setSourceProjectId,
            setSourceVersionHash,
            loadFromProject,
            loadFromZip,
            loadFromDirectory,
            loadFromVersion,
            loadFromRemoteLatest,
            applyIncomingHunk: applyIncomingHunkToCurrent,
            applyIncomingChapter: applyIncomingChapterToCurrent,
            applyIncomingAll: applyIncomingAllToCurrent,
            refresh,
            reset,
            rerunForChapters,
        },
    };
}
