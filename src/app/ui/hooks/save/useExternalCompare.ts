import type { LexicalEditor } from "lexical";
import { useMemo, useRef, useState } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { acceptRemoteLatestReview } from "@/app/domain/project/acceptRemoteLatestReview.ts";
import {
    applyIncomingToStore,
    runIncomingMutation,
} from "@/app/domain/project/compare/applyIncomingToStore.ts";
import {
    applyIncomingChapter,
    applyIncomingChapterAll,
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
import { COMPARE_SOURCE_KIND } from "@/app/domain/project/compare/types.ts";
import type {
    DiffsByChapter,
    ProjectDiff,
} from "@/app/domain/project/diffTypes.ts";
import { applyVersionSnapshotToWorkingFiles } from "@/app/domain/project/versionNavigationService.ts";
import { snapshotToScriptureBookStates } from "@/app/domain/project/versionSnapshotAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import {
    requireGateOpen,
    type WorkspaceGateStore,
} from "@/app/state/WorkspaceInteractionGate.ts";
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
import type { GitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import {
    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY,
    GIT_REMOTE_RELATIONSHIP_DIVERGED,
    type GitRemoteRelationshipKind,
} from "@/core/persistence/gitRemoteRelationship.ts";
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
    invalidateWorkingScriptureChanges,
    selectScriptureBookStatesForChapterRefs,
} from "./shared.ts";

const DIFF_CHUNK_SIZE = 8;
type DirtySemanticSidMap = Map<string, Set<string>>;

// Hoisted so version-list mapping doesn't allocate a new formatter per row.
// Locale-undefined falls back to navigator.language.
const VERSION_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

function buildExternalCompareSource(args: {
    sourceProjectId: string;
    sourceKind: CompareSourceKind;
    sourceVersionHash: string;
}) {
    if (args.sourceProjectId) {
        return {
            kind: COMPARE_SOURCE_KIND.EXISTING_PROJECT,
            projectId: args.sourceProjectId,
        } as const;
    }

    switch (args.sourceKind) {
        case COMPARE_SOURCE_KIND.PREVIOUS_VERSION:
            return {
                kind: COMPARE_SOURCE_KIND.PREVIOUS_VERSION,
                commitHash: args.sourceVersionHash,
            } as const;
        case COMPARE_SOURCE_KIND.REMOTE_LATEST:
            return { kind: COMPARE_SOURCE_KIND.REMOTE_LATEST } as const;
        case COMPARE_SOURCE_KIND.ZIP_FILE:
            return { kind: COMPARE_SOURCE_KIND.ZIP_FILE } as const;
        case COMPARE_SOURCE_KIND.DIRECTORY:
        case COMPARE_SOURCE_KIND.EXISTING_PROJECT:
            return { kind: COMPARE_SOURCE_KIND.DIRECTORY } as const;
    }
}

function hasDiffsByChapter(diffsByChapter: DiffsByChapter | null | undefined) {
    if (!diffsByChapter) return false;
    return Object.values(diffsByChapter).some((book) =>
        Object.values(book).some((chapterDiffs) => chapterDiffs.length > 0),
    );
}

function listChangedChapterRefs(diffsByChapter: DiffsByChapter): ChapterRef[] {
    const refs: ChapterRef[] = [];
    for (const [bookCode, chapters] of Object.entries(diffsByChapter)) {
        for (const [chapterKey, chapterDiffs] of Object.entries(chapters)) {
            const chapterNum = Number(chapterKey);
            if (Number.isNaN(chapterNum) || chapterDiffs.length === 0) continue;
            refs.push({ bookCode, chapterNum });
        }
    }
    return refs;
}

function buildChapterKey(bookCode: string, chapterNum: number) {
    return `${bookCode}:${chapterNum}`;
}

function splitRemoteDiffsByDirtySemanticSid(args: {
    diffsByChapter: DiffsByChapter;
    dirtySemanticSidsByChapter: DirtySemanticSidMap;
}) {
    const blockedDiffsByChapter: DiffsByChapter = {};
    const autoAcceptedDiffs: ProjectDiff[] = [];

    for (const [bookCode, chapters] of Object.entries(args.diffsByChapter)) {
        const blockedBook: Record<number, ProjectDiff[]> = {};
        for (const [chapterKey, chapterDiffs] of Object.entries(chapters)) {
            const chapterNum = Number(chapterKey);
            if (Number.isNaN(chapterNum)) continue;
            const dirtySemanticSids =
                args.dirtySemanticSidsByChapter.get(
                    buildChapterKey(bookCode, chapterNum),
                ) ?? new Set<string>();
            const blockedDiffs = chapterDiffs.filter((diff) =>
                dirtySemanticSids.has(diff.semanticSid),
            );
            const safeDiffs = chapterDiffs.filter(
                (diff) => !dirtySemanticSids.has(diff.semanticSid),
            );
            if (blockedDiffs.length) {
                blockedBook[chapterNum] = blockedDiffs;
            }
            autoAcceptedDiffs.push(...safeDiffs);
        }

        if (Object.keys(blockedBook).length) {
            blockedDiffsByChapter[bookCode] = blockedBook;
        }
    }

    return {
        blockedDiffsByChapter,
        autoAcceptedDiffs,
    };
}

function buildAutoAcceptIncomingPlan(args: {
    initialDiffsByChapter: DiffsByChapter;
    blockedDiffsByChapter: DiffsByChapter;
}) {
    const blockedByChapter = new Map<string, Set<string>>();
    for (const [bookCode, chapters] of Object.entries(
        args.blockedDiffsByChapter,
    )) {
        for (const [chapterKey, chapterDiffs] of Object.entries(chapters)) {
            const chapterNum = Number(chapterKey);
            if (Number.isNaN(chapterNum)) continue;
            blockedByChapter.set(
                buildChapterKey(bookCode, chapterNum),
                new Set(chapterDiffs.map((diff) => diff.uniqueKey)),
            );
        }
    }

    const fullChapterApplies: ChapterRef[] = [];
    const hunkApplies: ProjectDiff[] = [];

    for (const [bookCode, chapters] of Object.entries(
        args.initialDiffsByChapter,
    )) {
        for (const [chapterKey, chapterDiffs] of Object.entries(chapters)) {
            const chapterNum = Number(chapterKey);
            if (Number.isNaN(chapterNum) || chapterDiffs.length === 0) continue;
            const blockedUniqueKeys = blockedByChapter.get(
                buildChapterKey(bookCode, chapterNum),
            );
            if (!blockedUniqueKeys || blockedUniqueKeys.size === 0) {
                fullChapterApplies.push({ bookCode, chapterNum });
                continue;
            }
            for (const diff of chapterDiffs) {
                if (!blockedUniqueKeys.has(diff.uniqueKey)) {
                    hunkApplies.push(diff);
                }
            }
        }
    }

    return {
        fullChapterApplies,
        hunkApplies,
    };
}

function extractBookCodeFromStorageKey(storageKey: string): string | null {
    if (!storageKey.endsWith(".usfm")) return null;
    const fileName = storageKey.split("/").pop() ?? storageKey;
    const withDashMatch = fileName.match(/-([A-Za-z0-9]{3})\.usfm$/);
    if (withDashMatch?.[1]) {
        return withDashMatch[1].toUpperCase();
    }
    const plainMatch = fileName.match(/^([A-Za-z0-9]{3})\.usfm$/);
    if (plainMatch?.[1]) {
        return plainMatch[1].toUpperCase();
    }
    return null;
}

function buildBookTextByCodeFromSnapshot(snapshot: Map<string, string>) {
    const byBook = new Map<string, string>();
    for (const [storageKey, text] of snapshot.entries()) {
        const bookCode = extractBookCodeFromStorageKey(storageKey);
        if (!bookCode) continue;
        byBook.set(bookCode, text);
    }
    return byBook;
}

function buildBookTextByCodeFromScriptureFiles(files: ScriptureBookState[]) {
    const byBook = new Map<string, string>();
    for (const file of files) {
        let usfmText = "";
        for (const chapter of file.chapters) {
            for (const token of chapter.currentTokens) {
                usfmText += "source" in token ? String(token.source ?? "") : "";
            }
        }
        byBook.set(file.bookCode.toUpperCase(), usfmText);
    }
    return byBook;
}

function collectChangedBookCodes(args: {
    baseByBook: Map<string, string>;
    targetByBook: Map<string, string>;
}) {
    const keys = new Set([
        ...Array.from(args.baseByBook.keys()),
        ...Array.from(args.targetByBook.keys()),
    ]);
    const changed = new Set<string>();
    for (const bookCode of keys) {
        const baseText = args.baseByBook.get(bookCode) ?? null;
        const targetText = args.targetByBook.get(bookCode) ?? null;
        if (baseText !== targetText) {
            changed.add(bookCode);
        }
    }
    return changed;
}

/**
 * External-compare hook for the scripture workspace.
 *
 * This hook loads an external baseline (other project, prior version, zip, or
 * directory), runs chapter-aware diffs against the current in-memory workspace,
 * and exposes apply/refresh helpers for the compare UI.
 */
// todo: also quite large file? decompose or encapsulate or what to do for best arch here? Pretty beefy list of args.
export function useExternalCompare(args: {
    workingFilesStore: WorkingFilesStore;
    recoveredConflictTracker: RecoveredConflictTracker;
    interactionGate: WorkspaceGateStore;
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
    autoAcceptIncomingWork: boolean;
    bumpDirtyVersion: () => void;
    refreshUnsavedChapters?: (chapters: ChapterRef[]) => Promise<void>;
    onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
}) {
    const [mode, setMode] = useState<CompareMode>("unsaved");
    const [sourceKind, setSourceKind] = useState<CompareSourceKind>(
        COMPARE_SOURCE_KIND.EXISTING_PROJECT,
    );
    const [sourceProjectId, setSourceProjectId] = useState("");
    const [sourceVersionHash, setSourceVersionHash] = useState("");
    const [compareResult, setCompareResult] = useState<{
        diffsByChapter: DiffsByChapter;
        warnings: CompareWarning[];
        metadata?: CompareMetadataSummary;
        cleanup?: () => Promise<void>;
        sourceFiles?: ScriptureBookState[];
        remoteSync?: {
            remoteHead: string;
            localHead: string | null;
            mergeBase: string | null;
            trackedBranch: string;
            relationship: GitRemoteRelationshipKind;
        };
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
            source: buildExternalCompareSource({
                sourceProjectId,
                sourceKind,
                sourceVersionHash,
            }),
        };
    }

    async function computeExternalDiffs(
        sourceFiles: ScriptureBookState[],
        metadata: CompareMetadataSummary,
        cleanup?: () => Promise<void>,
    ) {
        const result = await buildCompareResultAsync({
            currentFiles: args.workingFilesStore.read(),
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
            remoteSync: undefined,
        });
    }

    async function buildDirtySemanticSidsByChapter(
        chapterRefs: ChapterRef[],
    ): Promise<DirtySemanticSidMap> {
        const dirtyScope: {
            bookCode: string;
            chapterNum: number;
            baselineTokens: ScriptureChapterState["sourceTokens"];
            currentTokens: ScriptureChapterState["currentTokens"];
        }[] = [];
        for (const { bookCode, chapterNum } of chapterRefs) {
            const currentChapter = args.workingFilesStore
                .read()
                .find((file) => file.bookCode === bookCode)
                ?.chapters.find(
                    (chapter) => chapter.chapterNumber === chapterNum,
                );
            if (!currentChapter?.dirty) continue;
            dirtyScope.push({
                bookCode,
                chapterNum,
                baselineTokens: currentChapter.sourceTokens,
                currentTokens: currentChapter.currentTokens,
            });
        }

        if (!dirtyScope.length) {
            return new Map();
        }

        const diffsByScope = await args.usfmOnionService.diffScope(
            dirtyScope.map((entry) => ({
                baselineTokens: entry.baselineTokens,
                currentTokens: entry.currentTokens,
            })),
        );

        const dirtySemanticSidsByChapter = new Map<string, Set<string>>();
        for (const [index, scopeEntry] of dirtyScope.entries()) {
            const dirtySemanticSids = new Set<string>();
            for (const diff of diffsByScope[index] ?? []) {
                if (diff.status !== "unchanged") {
                    dirtySemanticSids.add(diff.semanticSid);
                }
            }
            if (!dirtySemanticSids.size) continue;
            dirtySemanticSidsByChapter.set(
                buildChapterKey(scopeEntry.bookCode, scopeEntry.chapterNum),
                dirtySemanticSids,
            );
        }

        return dirtySemanticSidsByChapter;
    }
    // todo: this function is like 500+ lines with a nested fucntion. Maybe worth extracting even if all the logic stays so it can read a little more narratively.
    async function maybeAutoAcceptRemoteLatest(argsForAuto: {
        sourceFiles: ScriptureBookState[];
        metadata: CompareMetadataSummary;
        cleanup?: () => Promise<void>;
        initialWarnings: CompareWarning[];
        remoteSync: {
            remoteHead: string;
            localHead: string | null;
            mergeBase: string | null;
            trackedBranch: string;
            relationship: GitRemoteRelationshipKind;
        };
        initialDiffsByChapter: DiffsByChapter;
    }): Promise<
        | {
              requiresReview: boolean;
              requiresReconciliationSave?: {
                  trackedBranch: string;
                  remoteHead: string;
                  relationship: GitRemoteRelationshipKind;
              };
          }
        | undefined
    > {
        // Mutation-boundary recheck: the source load that precedes this call
        // awaits the network, and a save can flip the gate to `saving` in that
        // window. The entry checks on the public actions only guard at action
        // start, so recheck here before the auto-accept mutation phase begins.
        // (`commitIncoming` below is the deeper net for the internal awaits.)
        if (incomingFlowsBlocked()) {
            return { requiresReview: false };
        }

        async function maybeAutoAcceptDivergedDisjoint() {
            if (
                argsForAuto.remoteSync.relationship !==
                GIT_REMOTE_RELATIONSHIP_DIVERGED
            ) {
                return null;
            }
            if (
                !argsForAuto.remoteSync.localHead ||
                !argsForAuto.remoteSync.mergeBase
            ) {
                return null;
            }

            let baseSnapshot: Map<string, string>;
            let localSnapshot: Map<string, string>;
            let remoteSnapshot: Map<string, string>;
            try {
                [baseSnapshot, localSnapshot, remoteSnapshot] =
                    await Promise.all([
                        args.gitProvider.readProjectSnapshotAtCommit(
                            args.loadedProject.projectPath,
                            argsForAuto.remoteSync.mergeBase,
                        ),
                        args.gitProvider.readProjectSnapshotAtCommit(
                            args.loadedProject.projectPath,
                            argsForAuto.remoteSync.localHead,
                        ),
                        args.gitProvider.readProjectSnapshotAtCommit(
                            args.loadedProject.projectPath,
                            argsForAuto.remoteSync.remoteHead,
                        ),
                    ]);
            } catch {
                return null;
            }

            const baseByBook = buildBookTextByCodeFromSnapshot(baseSnapshot);
            const localByBook = buildBookTextByCodeFromSnapshot(localSnapshot);
            const remoteByBook =
                buildBookTextByCodeFromSnapshot(remoteSnapshot);
            const workingByBook = buildBookTextByCodeFromScriptureFiles(
                args.workingFilesStore.read(),
            );

            const localChangedBooks = collectChangedBookCodes({
                baseByBook,
                targetByBook: localByBook,
            });
            const remoteChangedBooks = collectChangedBookCodes({
                baseByBook,
                targetByBook: remoteByBook,
            });
            const dirtyWorkspaceBooks = collectChangedBookCodes({
                baseByBook: localByBook,
                targetByBook: workingByBook,
            });
            const locallyProtectedBooks = new Set([
                ...Array.from(localChangedBooks),
                ...Array.from(dirtyWorkspaceBooks),
            ]);

            if (remoteChangedBooks.size === 0) {
                return null;
            }

            const hasOverlap = Array.from(locallyProtectedBooks).some(
                (bookCode) => remoteChangedBooks.has(bookCode),
            );
            if (hasOverlap) {
                return null;
            }

            // Capture pre-mutation snapshots of locally-protected books
            // BEFORE building the draft — we'll splice these back over the
            // touched draft entries below, and we need writable chapters
            // because the loop further down sets dirty = true on them.
            const original = args.workingFilesStore.read();
            const preservedByBook = new Map<
                string,
                (typeof original)[number]
            >();
            for (const file of original) {
                if (locallyProtectedBooks.has(file.bookCode)) {
                    preservedByBook.set(file.bookCode, {
                        ...file,
                        chapters: file.chapters.map((c) => ({ ...c })),
                    });
                }
            }
            const allRefs = original.flatMap((file) =>
                file.chapters.map((chapter) => ({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapterNumber,
                })),
            );
            const workingDraft =
                args.workingFilesStore.draftWithChapters(allRefs);
            applyVersionSnapshotToWorkingFiles({
                workingFiles: workingDraft,
                sourceFiles: argsForAuto.sourceFiles,
            });
            // workingDraft is mutated below (book entries replaced in place),
            // so any future bookCode→book index must be rebuilt AFTER this loop.
            for (const bookCode of locallyProtectedBooks) {
                const preserved = preservedByBook.get(bookCode);
                if (!preserved) continue;
                const existingIndex = workingDraft.findIndex(
                    (file) => file.bookCode === bookCode,
                );
                if (existingIndex >= 0) {
                    workingDraft[existingIndex] = preserved;
                } else {
                    workingDraft.push(preserved);
                }
            }
            const locallyProtectedChapters = workingDraft.flatMap((file) =>
                locallyProtectedBooks.has(file.bookCode)
                    ? file.chapters.map((chapter) => ({
                          bookCode: file.bookCode,
                          chapterNum: chapter.chapterNumber,
                      }))
                    : [],
            );
            for (const chapterRef of locallyProtectedChapters) {
                const chapter = workingDraft
                    .find((file) => file.bookCode === chapterRef.bookCode)
                    ?.chapters.find(
                        (entry) =>
                            entry.chapterNumber === chapterRef.chapterNum,
                    );
                if (!chapter) continue;
                chapter.dirty = true;
            }
            // Gate closed mid-flight → don't apply; fall through to manual review.
            if (
                !commitIncoming(
                    { kind: "bulk", files: workingDraft },
                    {
                        kind: "import",
                        scope: { project: true },
                        dirtyTextContent: true,
                    },
                )
            ) {
                return null;
            }

            const refreshed = await buildCompareResultAsync({
                currentFiles: args.workingFilesStore.read(),
                usfmOnionService: args.usfmOnionService,
                config: buildExternalCompareConfig(),
                sourceFiles: argsForAuto.sourceFiles,
                currentMetadata: buildCurrentProjectCompareMetadata(
                    args.loadedProject,
                ),
                sourceMetadata: argsForAuto.metadata,
                batchSize: DIFF_CHUNK_SIZE,
                onBatchComplete: yieldToMainThread,
            });
            const changedChapters = listChangedChapterRefs(
                refreshed.diffsByChapter,
            );

            const touchedChapterMap = new Map<string, ChapterRef>();
            for (const chapterRef of [
                ...changedChapters,
                ...locallyProtectedChapters,
            ]) {
                touchedChapterMap.set(
                    buildChapterKey(chapterRef.bookCode, chapterRef.chapterNum),
                    chapterRef,
                );
            }
            await invalidateWorkingScriptureChanges({
                chapters: Array.from(touchedChapterMap.values()),
                bumpDirtyVersion: args.bumpDirtyVersion,
                refreshUnsavedChapters: args.refreshUnsavedChapters,
                editorRef: args.editorRef,
                workingFiles: args.workingFilesStore.read(),
                pickedFile: args.pickedFile,
                pickedChapter: args.pickedChapter,
            });

            setCompareResult({
                diffsByChapter: refreshed.diffsByChapter,
                warnings: refreshed.warnings,
                metadata: argsForAuto.metadata,
                cleanup: argsForAuto.cleanup,
                sourceFiles: argsForAuto.sourceFiles,
                remoteSync: argsForAuto.remoteSync,
            });
            return {
                requiresReview: false,
                requiresReconciliationSave: {
                    trackedBranch: argsForAuto.remoteSync.trackedBranch,
                    remoteHead: argsForAuto.remoteSync.remoteHead,
                    relationship: argsForAuto.remoteSync.relationship,
                },
            };
        }

        const divergedDisjointAutoAccept =
            await maybeAutoAcceptDivergedDisjoint();
        if (divergedDisjointAutoAccept) {
            return divergedDisjointAutoAccept;
        }

        if (
            argsForAuto.remoteSync.relationship ===
            GIT_REMOTE_RELATIONSHIP_DIVERGED
        ) {
            setCompareResult({
                diffsByChapter: argsForAuto.initialDiffsByChapter,
                warnings: argsForAuto.initialWarnings,
                metadata: argsForAuto.metadata,
                cleanup: argsForAuto.cleanup,
                sourceFiles: argsForAuto.sourceFiles,
                remoteSync: argsForAuto.remoteSync,
            });
            return {
                requiresReview: hasDiffsByChapter(
                    argsForAuto.initialDiffsByChapter,
                ),
            };
        }

        // Capture WORKSPACE state identity BEFORE the dirty-sid await: the
        // behind-only branch below applies a whole-workspace version snapshot
        // (touches every chapter, incl. any created during the await), so its
        // validation scope must be the workspace, not a fixed ref set. The
        // store's structural sharing replaces the read() array on any
        // state-changing commit; selectionOnly preserves it. Same contract as
        // runIncomingMutation's `workspace` scope, but the governing await is
        // here, upstream of the branch.
        const preReconcileState = args.workingFilesStore.read();
        const dirtySemanticSidsByChapter =
            await buildDirtySemanticSidsByChapter(listCompareChapterRefs());
        const { blockedDiffsByChapter, autoAcceptedDiffs } =
            splitRemoteDiffsByDirtySemanticSid({
                diffsByChapter: argsForAuto.initialDiffsByChapter,
                dirtySemanticSidsByChapter,
            });
        const { fullChapterApplies, hunkApplies } = buildAutoAcceptIncomingPlan(
            {
                initialDiffsByChapter: argsForAuto.initialDiffsByChapter,
                blockedDiffsByChapter,
            },
        );

        if (
            argsForAuto.remoteSync.relationship ===
                GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
            !hasDiffsByChapter(blockedDiffsByChapter)
        ) {
            const touchedChapters = listCompareChapterRefs();
            // Any state-changing commit during the dirty-sid await (a content
            // edit OR a newly added chapter/book) or a closed gate → abort
            // before the workspace snapshot apply + accept; don't clobber that
            // work or mark synced. Validation + draft + apply + commit are
            // synchronous from here, so no further await can sneak in.
            if (
                args.workingFilesStore.read() !== preReconcileState ||
                !requireGateOpen(args.interactionGate.get())
            ) {
                return { requiresReview: false };
            }
            // Discovery flow: applyVersionSnapshotToWorkingFiles walks every
            // chapter of every book. Draft every existing chapter writable.
            const behindRefs = args.workingFilesStore.read().flatMap((file) =>
                file.chapters.map((chapter) => ({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapterNumber,
                })),
            );
            const behindDraft =
                args.workingFilesStore.draftWithChapters(behindRefs);
            applyVersionSnapshotToWorkingFiles({
                workingFiles: behindDraft,
                sourceFiles: argsForAuto.sourceFiles,
            });
            args.workingFilesStore.commit(
                { kind: "bulk", files: behindDraft },
                {
                    kind: "import",
                    scope: { project: true },
                    dirtyTextContent: true,
                },
            );
            await invalidateWorkingScriptureChanges({
                chapters: touchedChapters,
                bumpDirtyVersion: args.bumpDirtyVersion,
                refreshUnsavedChapters: args.refreshUnsavedChapters,
                editorRef: args.editorRef,
                workingFiles: args.workingFilesStore.read(),
                pickedFile: args.pickedFile,
                pickedChapter: args.pickedChapter,
            });
            const nextStatus = await acceptRemoteLatestReview({
                projectPath: args.loadedProject.projectPath,
                trackedBranch: argsForAuto.remoteSync.trackedBranch,
                remoteHead: argsForAuto.remoteSync.remoteHead,
                fileSystem: args.fileSystem,
                storageRoots: args.storageRoots,
                gitProvider: args.gitProvider,
            });
            args.onGitRemoteStatusChanged?.(nextStatus);
            setCompareResult({
                diffsByChapter: {},
                warnings: [],
                metadata: argsForAuto.metadata,
                cleanup: argsForAuto.cleanup,
                sourceFiles: argsForAuto.sourceFiles,
                remoteSync: argsForAuto.remoteSync,
            });
            return {
                requiresReview: false,
            };
        }

        if (!autoAcceptedDiffs.length) {
            if (
                argsForAuto.remoteSync.relationship ===
                GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
            ) {
                const nextStatus = await acceptRemoteLatestReview({
                    projectPath: args.loadedProject.projectPath,
                    trackedBranch: argsForAuto.remoteSync.trackedBranch,
                    remoteHead: argsForAuto.remoteSync.remoteHead,
                    fileSystem: args.fileSystem,
                    storageRoots: args.storageRoots,
                    gitProvider: args.gitProvider,
                });
                args.onGitRemoteStatusChanged?.(nextStatus);
            }
            setCompareResult({
                diffsByChapter: blockedDiffsByChapter,
                warnings: argsForAuto.initialWarnings,
                metadata: argsForAuto.metadata,
                cleanup: argsForAuto.cleanup,
                sourceFiles: argsForAuto.sourceFiles,
                remoteSync:
                    argsForAuto.remoteSync.relationship ===
                    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
                        ? undefined
                        : argsForAuto.remoteSync,
            });
            return {
                requiresReview: hasDiffsByChapter(blockedDiffsByChapter),
            };
        }

        const touchedChapterKeys = new Set([
            ...fullChapterApplies.map((chapter) =>
                buildChapterKey(chapter.bookCode, chapter.chapterNum),
            ),
            ...hunkApplies.map((diff) =>
                buildChapterKey(diff.bookCode, diff.chapterNum),
            ),
        ]);
        const touchedChapters: ChapterRef[] = [];
        for (const key of touchedChapterKeys) {
            const [bookCode, chapterPart] = key.split(":");
            const chapterNum = Number(chapterPart);
            if (bookCode && !Number.isNaN(chapterNum)) {
                touchedChapters.push({ bookCode, chapterNum });
            }
        }

        let autoAcceptApplied = false;
        await args.history.runTransaction({
            label: "Auto Accept Incoming Changes",
            candidates: touchedChapters,
            run: async () => {
                // Scratch-apply then synchronous overlay-from-latest commit:
                // no commit landing during the hunk awaits can be clobbered, and
                // the gate is rechecked at the synchronous commit boundary.
                autoAcceptApplied = await applyIncomingToStore({
                    workingFilesStore: args.workingFilesStore,
                    interactionGate: args.interactionGate,
                    usfmOnionService: args.usfmOnionService,
                    fullChapterApplies,
                    hunkApplies,
                    sourceFiles: argsForAuto.sourceFiles,
                });
            },
        });

        // Gate closed during the apply awaits → nothing committed; bail before
        // the remote-accept side effect so we don't mark synced without applying.
        if (!autoAcceptApplied) {
            return { requiresReview: false };
        }

        await invalidateWorkingScriptureChanges({
            chapters: touchedChapters,
            bumpDirtyVersion: args.bumpDirtyVersion,
            refreshUnsavedChapters: args.refreshUnsavedChapters,
            editorRef: args.editorRef,
            workingFiles: args.workingFilesStore.read(),
            pickedFile: args.pickedFile,
            pickedChapter: args.pickedChapter,
        });

        // Post-apply refreshed diff + behind-only clean normalization, through
        // the validated boundary: a user edit during the refreshed-diff await
        // must not be reverted by the snapshot apply, and remote-accept must not
        // proceed on a stale decision. The snapshot write happens only inside
        // `commit` (after identity validation); accept runs only if it committed.
        const { committed: normalized, computed: refreshed } =
            await runIncomingMutation({
                workingFilesStore: args.workingFilesStore,
                interactionGate: args.interactionGate,
                // Whole-workspace snapshot replacement → workspace scope (catches
                // chapters created during the refreshed-diff await, not just a
                // fixed ref set).
                scope: { kind: "workspace" },
                compute: () =>
                    buildCompareResultAsync({
                        currentFiles: args.workingFilesStore.read(),
                        usfmOnionService: args.usfmOnionService,
                        config: buildExternalCompareConfig(),
                        sourceFiles: argsForAuto.sourceFiles,
                        currentMetadata: buildCurrentProjectCompareMetadata(
                            args.loadedProject,
                        ),
                        sourceMetadata: argsForAuto.metadata,
                        batchSize: DIFF_CHUNK_SIZE,
                        onBatchComplete: yieldToMainThread,
                    }),
                commit: (refreshedResult, latest) => {
                    if (
                        argsForAuto.remoteSync.relationship ===
                            GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
                        !hasDiffsByChapter(refreshedResult.diffsByChapter)
                    ) {
                        const cleanRefs = latest.flatMap((file) =>
                            file.chapters.map((chapter) => ({
                                bookCode: file.bookCode,
                                chapterNum: chapter.chapterNumber,
                            })),
                        );
                        const cleanDraft =
                            args.workingFilesStore.draftWithChapters(cleanRefs);
                        applyVersionSnapshotToWorkingFiles({
                            workingFiles: cleanDraft,
                            sourceFiles: argsForAuto.sourceFiles,
                        });
                        args.workingFilesStore.commit(
                            { kind: "bulk", files: cleanDraft },
                            {
                                kind: "import",
                                scope: { project: true },
                                dirtyTextContent: true,
                            },
                        );
                    }
                },
            });

        if (
            argsForAuto.remoteSync.relationship ===
                GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY &&
            normalized
        ) {
            const nextStatus = await acceptRemoteLatestReview({
                projectPath: args.loadedProject.projectPath,
                trackedBranch: argsForAuto.remoteSync.trackedBranch,
                remoteHead: argsForAuto.remoteSync.remoteHead,
                fileSystem: args.fileSystem,
                storageRoots: args.storageRoots,
                gitProvider: args.gitProvider,
            });
            args.onGitRemoteStatusChanged?.(nextStatus);
        }

        setCompareResult({
            diffsByChapter: refreshed.diffsByChapter,
            warnings: refreshed.warnings,
            metadata: argsForAuto.metadata,
            cleanup: argsForAuto.cleanup,
            sourceFiles: argsForAuto.sourceFiles,
            remoteSync:
                argsForAuto.remoteSync.relationship ===
                GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
                    ? undefined
                    : argsForAuto.remoteSync,
        });

        return {
            requiresReview: hasDiffsByChapter(refreshed.diffsByChapter),
        };
    }

    async function rerunForChapters(chapters: ChapterRef[]) {
        if (!compareResult?.sourceFiles || !compareResult.metadata) return;

        const result = await buildCompareResultAsync({
            currentFiles: selectScriptureBookStatesForChapterRefs(
                args.workingFilesStore.read(),
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

    function listCompareChapterRefs(): ChapterRef[] {
        const keys = new Set<string>();
        for (const file of args.workingFilesStore.read()) {
            for (const chapter of file.chapters) {
                keys.add(`${file.bookCode}:${chapter.chapterNumber}`);
            }
        }
        for (const file of compareResult?.sourceFiles ?? []) {
            for (const chapter of file.chapters) {
                keys.add(`${file.bookCode}:${chapter.chapterNumber}`);
            }
        }

        const out: ChapterRef[] = [];
        for (const key of keys) {
            const [bookCode, chapterPart] = key.split(":");
            const chapterNum = Number(chapterPart);
            if (bookCode && !Number.isNaN(chapterNum)) {
                out.push({ bookCode, chapterNum });
            }
        }
        return out;
    }

    const reset = () => {
        if (compareResult?.cleanup) {
            void compareResult.cleanup();
        }
        setCompareResult(null);
        setSourceProjectId("");
        setSourceVersionHash("");
        setSourceKind(COMPARE_SOURCE_KIND.EXISTING_PROJECT);
    };

    // Incoming-source flows are deferred while EITHER:
    //  - the workspace is gated (a recovery Keep/Discard decision is pending, or
    //    a save is in flight), or
    //  - recovered conflicts remain unresolved.
    // Both matter: a baseline-matched restore leaves the tracker EMPTY while the
    // gate is still recovery-decision-pending, and importing then would clobber
    // correctly-recovered work before the user has acknowledged the banner. Gate
    // every public source-loading action at entry; the toolbar mode-entry
    // control is the visible boundary above this net.
    function incomingFlowsBlocked(): boolean {
        return (
            !requireGateOpen(args.interactionGate.get()) ||
            !args.recoveredConflictTracker.isEmpty()
        );
    }

    // Commit imported working state only if the gate is still open at the
    // mutation boundary. Incoming auto-accept awaits network/diff work between
    // its entry check and these commits; a save can flip the gate to `saving`
    // in that window, and committing then would violate the "blocked during
    // save" contract. Returns whether the commit was applied so callers can
    // abort the rest of the reconciliation (and skip remote-accept side effects)
    // rather than mark a remote synced without applying it.
    function commitIncoming(
        patch: Parameters<WorkingFilesStore["commit"]>[0],
        meta: Parameters<WorkingFilesStore["commit"]>[1],
    ): boolean {
        if (!requireGateOpen(args.interactionGate.get())) return false;
        args.workingFilesStore.commit(patch, meta);
        return true;
    }

    async function loadFromProject(projectId: string) {
        if (incomingFlowsBlocked()) return;
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
        if (incomingFlowsBlocked()) return;
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
        if (incomingFlowsBlocked()) return;
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
        if (incomingFlowsBlocked()) return;
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
        if (incomingFlowsBlocked()) return undefined;
        return await calculationRunnerRef.current.run(async () => {
            if (compareResult?.cleanup) {
                await compareResult.cleanup();
            }
            const loaded = await compareSourceLoader.loadRemoteLatest(
                args.loadedProject,
            );
            setSourceProjectId("");
            setSourceVersionHash("");
            const result = await buildCompareResultAsync({
                currentFiles: args.workingFilesStore.read(),
                usfmOnionService: args.usfmOnionService,
                config: buildExternalCompareConfig(),
                sourceFiles: loaded.parsedFiles,
                currentMetadata: buildCurrentProjectCompareMetadata(
                    args.loadedProject,
                ),
                sourceMetadata: loaded.metadataSummary,
                batchSize: DIFF_CHUNK_SIZE,
                onBatchComplete: yieldToMainThread,
            });
            if (args.autoAcceptIncomingWork) {
                if (!loaded.remoteSync) {
                    setCompareResult({
                        diffsByChapter: result.diffsByChapter,
                        warnings: result.warnings,
                        metadata: loaded.metadataSummary,
                        cleanup: loaded.cleanup,
                        sourceFiles: loaded.parsedFiles,
                        remoteSync: undefined,
                    });
                    return {
                        requiresReview: hasDiffsByChapter(
                            result.diffsByChapter,
                        ),
                    };
                }
                return await maybeAutoAcceptRemoteLatest({
                    sourceFiles: loaded.parsedFiles,
                    metadata: loaded.metadataSummary,
                    cleanup: loaded.cleanup,
                    initialWarnings: result.warnings,
                    remoteSync: loaded.remoteSync,
                    initialDiffsByChapter: result.diffsByChapter,
                });
            }
            setCompareResult({
                diffsByChapter: result.diffsByChapter,
                warnings: result.warnings,
                metadata: loaded.metadataSummary,
                cleanup: loaded.cleanup,
                sourceFiles: loaded.parsedFiles,
                remoteSync: loaded.remoteSync,
            });
            return {
                requiresReview: hasDiffsByChapter(result.diffsByChapter),
            };
        });
    }

    async function openRemoteLatestReview(
        openDiffModal: () => Promise<void>,
        isDiffModalOpen: boolean,
        options?: {
            openModalOnRequiresReview?: boolean;
        },
    ) {
        // Guard before entering external mode: recovered conflicts must be
        // resolved before any incoming-source review can mutate working state.
        if (incomingFlowsBlocked()) return undefined;
        setMode("external");
        setSourceKind(COMPARE_SOURCE_KIND.REMOTE_LATEST);
        const result = await loadFromRemoteLatest();
        if (
            result?.requiresReview &&
            (options?.openModalOnRequiresReview ?? true) &&
            !isDiffModalOpen
        ) {
            await openDiffModal();
        }
        return result;
    }

    function applyIncomingHunkToCurrent(diff: ProjectDiff) {
        if (!requireGateOpen(args.interactionGate.get())) return;
        if (!compareResult?.sourceFiles) return;
        void args.history.runTransaction({
            label: `Take Incoming (${diff.semanticSid})`,
            candidates: [
                { bookCode: diff.bookCode, chapterNum: diff.chapterNum },
            ],
            run: async () => {
                // Scratch-apply then synchronous overlay-from-latest commit
                // (lost-update-safe) through the gate. Bail if the gate closed.
                const applied = await applyIncomingToStore({
                    workingFilesStore: args.workingFilesStore,
                    interactionGate: args.interactionGate,
                    usfmOnionService: args.usfmOnionService,
                    fullChapterApplies: [],
                    hunkApplies: [diff],
                    sourceFiles: compareResult.sourceFiles ?? [],
                });
                if (!applied) return;
                await invalidateWorkingScriptureChanges({
                    chapters: [
                        {
                            bookCode: diff.bookCode,
                            chapterNum: diff.chapterNum,
                        },
                    ],
                    bumpDirtyVersion: args.bumpDirtyVersion,
                    refreshUnsavedChapters: args.refreshUnsavedChapters,
                    editorRef: args.editorRef,
                    workingFiles: args.workingFilesStore.read(),
                    pickedFile: args.pickedFile,
                    pickedChapter: args.pickedChapter,
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
        if (!requireGateOpen(args.interactionGate.get())) return;
        if (!compareResult?.sourceFiles) return;
        void args.history.runTransaction({
            label: `Take Incoming Chapter (${bookCode} ${chapterNum})`,
            candidates: [{ bookCode, chapterNum }],
            run: async () => {
                const allRefs = args.workingFilesStore.read().flatMap((file) =>
                    file.chapters.map((chapter) => ({
                        bookCode: file.bookCode,
                        chapterNum: chapter.chapterNumber,
                    })),
                );
                const draft = args.workingFilesStore.draftWithChapters(allRefs);
                applyIncomingChapter({
                    workingFiles: draft,
                    sourceFiles: compareResult.sourceFiles ?? [],
                    bookCode,
                    chapterNum,
                });
                // Sync applier (no await between draft and commit), so only the
                // gate recheck is needed at the commit boundary.
                if (
                    !commitIncoming(
                        { kind: "bulk", files: draft },
                        {
                            kind: "import",
                            scope: { project: true },
                            dirtyTextContent: true,
                        },
                    )
                ) {
                    return;
                }
                await invalidateWorkingScriptureChanges({
                    chapters: [{ bookCode, chapterNum }],
                    bumpDirtyVersion: args.bumpDirtyVersion,
                    refreshUnsavedChapters: args.refreshUnsavedChapters,
                    editorRef: args.editorRef,
                    workingFiles: args.workingFilesStore.read(),
                    pickedFile: args.pickedFile,
                    pickedChapter: args.pickedChapter,
                });
                await rerunForChapters([{ bookCode, chapterNum }]);
            },
        });
    }

    function applyIncomingAllToCurrent() {
        if (!requireGateOpen(args.interactionGate.get())) return;
        if (!compareResult?.sourceFiles) return;
        void args.history.runTransaction({
            label: "Take All Incoming Chapters",
            candidates: args.workingFilesStore.read().flatMap((file) =>
                file.chapters.map((chapter) => ({
                    bookCode: file.bookCode,
                    chapterNum: chapter.chapterNumber,
                })),
            ),
            run: async () => {
                const allRefs = args.workingFilesStore.read().flatMap((file) =>
                    file.chapters.map((chapter) => ({
                        bookCode: file.bookCode,
                        chapterNum: chapter.chapterNumber,
                    })),
                );
                const draft = args.workingFilesStore.draftWithChapters(allRefs);
                applyIncomingChapterAll({
                    workingFiles: draft,
                    sourceFiles: compareResult.sourceFiles ?? [],
                });
                if (
                    compareResult.remoteSync?.relationship ===
                    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
                ) {
                    applyVersionSnapshotToWorkingFiles({
                        workingFiles: draft,
                        sourceFiles: compareResult.sourceFiles ?? [],
                    });
                }
                // Sync appliers (no await between draft and commit); gate-recheck
                // at the commit boundary and bail before the remote-accept below.
                if (
                    !commitIncoming(
                        { kind: "bulk", files: draft },
                        {
                            kind: "import",
                            scope: { project: true },
                            dirtyTextContent: true,
                        },
                    )
                ) {
                    return;
                }
                await invalidateWorkingScriptureChanges({
                    chapters: listCompareChapterRefs(),
                    bumpDirtyVersion: args.bumpDirtyVersion,
                    refreshUnsavedChapters: args.refreshUnsavedChapters,
                    editorRef: args.editorRef,
                    workingFiles: args.workingFilesStore.read(),
                    pickedFile: args.pickedFile,
                    pickedChapter: args.pickedChapter,
                });
                if (
                    compareResult.remoteSync?.relationship ===
                    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY
                ) {
                    const nextStatus = await acceptRemoteLatestReview({
                        projectPath: args.loadedProject.projectPath,
                        trackedBranch: compareResult.remoteSync.trackedBranch,
                        remoteHead: compareResult.remoteSync.remoteHead,
                        fileSystem: args.fileSystem,
                        storageRoots: args.storageRoots,
                        gitProvider: args.gitProvider,
                    });
                    args.onGitRemoteStatusChanged?.(nextStatus);
                    setCompareResult((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  diffsByChapter: {},
                                  warnings: [],
                              }
                            : prev,
                    );
                    return;
                }
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
                label: VERSION_LABEL_FORMATTER.format(
                    new Date(version.authoredAtIso),
                ),
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
            pendingRemotePartialReconciliation:
                (compareResult?.remoteSync?.relationship ===
                    GIT_REMOTE_RELATIONSHIP_BEHIND_ONLY ||
                    compareResult?.remoteSync?.relationship ===
                        GIT_REMOTE_RELATIONSHIP_DIVERGED) &&
                hasDiffsByChapter(compareResult.diffsByChapter)
                    ? {
                          remoteHead: compareResult.remoteSync.remoteHead,
                          trackedBranch: compareResult.remoteSync.trackedBranch,
                          relationship: compareResult.remoteSync.relationship,
                      }
                    : null,
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
            openRemoteLatestReview,
            applyIncomingHunk: applyIncomingHunkToCurrent,
            applyIncomingChapter: applyIncomingChapterToCurrent,
            applyIncomingAll: applyIncomingAllToCurrent,
            refresh,
            reset,
            rerunForChapters,
        },
    };
}
