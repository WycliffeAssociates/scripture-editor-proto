// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExternalCompare } from "@/app/ui/hooks/save/useExternalCompare.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type { ChapterRef } from "@/app/ui/hooks/save/shared.ts";
import {
    GIT_REMOTE_PROJECT_STATUS_CONNECTED,
    type GitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteModels.ts";

const compareServiceMock = vi.hoisted(() => ({
    buildCompareResultAsync: vi.fn(),
}));

const compareSourceLoaderMock = vi.hoisted(() => ({
    loadRemoteLatest: vi.fn(),
}));

const acceptRemoteLatestReviewMock = vi.hoisted(() => ({
    acceptRemoteLatestReview: vi.fn(),
}));

vi.mock("@/app/domain/project/compare/compareService.ts", () => ({
    buildCompareResultAsync: compareServiceMock.buildCompareResultAsync,
}));

vi.mock("@/app/domain/project/compare/compareSourceLoader.ts", () => ({
    CompareSourceLoader: class CompareSourceLoader {
        loadExistingProject = vi.fn();
        loadFromZipFile = vi.fn();
        loadFromDirectoryFiles = vi.fn();
        loadRemoteLatest = compareSourceLoaderMock.loadRemoteLatest;
    },
}));

vi.mock("@/app/domain/project/acceptRemoteLatestReview.ts", () => ({
    acceptRemoteLatestReview: acceptRemoteLatestReviewMock.acceptRemoteLatestReview,
}));

type HookState = ReturnType<typeof useExternalCompare> | null;

function makeChapter(text: string, chapterNumber = 1): ScriptureChapterState {
    return {
        chapterNumber,
        dirty: text !== "source",
        sourceTokens: [{ kind: "text", source: "source", id: `src-${chapterNumber}` }],
        currentTokens: [{ kind: "text", source: text, id: `cur-${chapterNumber}` }],
        loadedLexicalState: { root: { children: [], direction: "ltr" } },
        lexicalState: { root: { children: [], direction: "ltr" } },
    } as unknown as ScriptureChapterState;
}

function makeBook(text: string, chapterNumber = 1): ScriptureBookState {
    return makeBookForCode("GEN", text, chapterNumber);
}

function makeBookForCode(
    bookCode: string,
    text: string,
    chapterNumber = 1,
): ScriptureBookState {
    return {
        path: `/userData/projects/demo/${String(chapterNumber).padStart(2, "0")}-${bookCode}.usfm`,
        title: bookCode,
        bookCode,
        nextBookId: null,
        prevBookId: null,
        chapters: [makeChapter(text, chapterNumber)],
    };
}

function makeProject(): Project {
    return {
        folderName: "demo",
        displayName: "Demo",
        projectPath: "/userData/projects/demo",
        projectId: "demo",
        projectType: "scripture-burrito",
        language: { code: "en", name: "English", direction: "ltr" },
        books: [],
        listBooks: async () => [],
        getBook: async () => {
            throw new Error("not used");
        },
        saveBook: async () => {},
        addBook: async () => {
            throw new Error("not used");
        },
        listVersions: async () => [],
        restoreVersion: async () => {},
        stageAndCommit: async () => ({ hash: "hash" }),
    };
}

function createHistory(): CustomHistoryHook {
    return {
        version: 1,
        canUndo: false,
        canRedo: false,
        peekUndoLabel: () => null,
        peekRedoLabel: () => null,
        captureEditorUpdate: vi.fn(),
        captureEditorSelection: vi.fn(),
        runTransaction: async ({ run }) => await run(),
        setNextTypingLabel: vi.fn(),
        registerPostUndoRedoAction: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        clearHistory: vi.fn(),
    };
}

function createGitProvider(): GitProvider {
    return {
        ensureRepo: vi.fn(),
        getBranchInfo: vi.fn(),
        checkoutPreferredBranch: vi.fn(),
        listHistory: vi.fn(),
        readCommitDetails: vi.fn(),
        readProjectSnapshotAtCommit: vi.fn(),
        restoreTrackedFilesFromCommit: vi.fn(),
        commitAll: vi.fn(),
        cloneRemoteRepo: vi.fn(),
        ensureRemote: vi.fn(),
        inspectRemoteHeads: vi.fn(),
        fetchRemoteHeads: vi.fn(),
        pushCurrentBranch: vi.fn(),
        planReplayOntoRemote: vi.fn(),
        applyReplayPlanOntoRemote: vi.fn(),
        isRepoHealthy: vi.fn(),
    };
}

function createAuthProvider(): AuthSessionProvider {
    return {
        getCurrentSession: vi.fn(),
        loginWithPassword: vi.fn(),
        replaceSession: vi.fn(),
        logoutCurrentSession: vi.fn(),
        clearSession: vi.fn(),
    };
}

function buildDiffMap(currentFiles: ScriptureBookState[], sourceFiles: ScriptureBookState[]) {
    const currentText =
        currentFiles[0]?.chapters[0]?.currentTokens[0]?.source ?? "";
    const sourceText =
        sourceFiles[0]?.chapters[0]?.currentTokens[0]?.source ?? "";
    return {
        GEN: {
            1:
                currentText === sourceText
                    ? []
                    : [
                          {
                              uniqueKey: "diff-1",
                              semanticSid: "GEN 1:1",
                              status: "modified",
                              originalDisplayText: currentText,
                              currentDisplayText: sourceText,
                              originalTextOnly: currentText,
                              currentTextOnly: sourceText,
                              bookCode: "GEN",
                              chapterNum: 1,
                              originalRenderTokens: [],
                              currentRenderTokens: [],
                              originalAlignment: [],
                              currentAlignment: [],
                              undoSide: "current",
                          },
                      ],
        },
    };
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function hasDiffs(
    diffsByChapter:
        | ReturnType<typeof useExternalCompare>["state"]["diffsByChapter"]
        | null
        | undefined,
) {
    if (!diffsByChapter) return false;
    return Object.values(diffsByChapter).some((book) =>
        Object.values(book).some((chapterDiffs) => chapterDiffs.length > 0),
    );
}

function HookHarness(props: {
    store: WorkingFilesStore;
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
    editorRef: React.RefObject<{
        parseEditorState: ReturnType<typeof vi.fn>;
        setEditorState: ReturnType<typeof vi.fn>;
    } | null>;
    refreshUnsavedChapters: (chapters: ChapterRef[]) => Promise<void>;
    bumpDirtyVersion: () => void;
    autoAcceptIncomingWork?: boolean;
    onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
    gitProvider?: GitProvider;
    onState: (state: ReturnType<typeof useExternalCompare>) => void;
}) {
    const state = useExternalCompare({
        workingFilesStore: props.store,
        loadedProject: makeProject(),
        projectsService: {
            openProject: vi.fn(),
            openProjectReadOnly: vi.fn(),
        } as never,
        fileSystem: {} as never,
        storageRoots: {
            appDataRoot: "/appData",
            projectsRoot: "/userData/projects",
            tempRoot: "/appData/temp",
            cacheRoot: "/appData/cache",
            logsRoot: "/appData/logs",
            databaseRoot: "/appData/database",
        } satisfies StorageRoots,
        editorMode: "regular",
        usfmOnionService: {
            diffTokens: vi.fn(),
            diffScope: vi.fn(async (scope) =>
                scope.map((entry: { baselineTokens: { source: string }[]; currentTokens: { source: string }[] }) =>
                    entry.baselineTokens[0]?.source === entry.currentTokens[0]?.source
                        ? []
                        : [
                              {
                                  semanticSid: "GEN 1:1",
                                  status: "modified",
                              },
                          ],
                ),
            ),
            revertDiffBlock: vi.fn(async (sourceTokens) => sourceTokens),
        } as never,
        allProjects: [],
        currentProjectRoute: "demo",
        pickedFile: props.pickedFile,
        pickedChapter: props.pickedChapter,
        editorRef: props.editorRef as never,
        history: createHistory(),
        gitProvider: props.gitProvider ?? createGitProvider(),
        versions: [],
        authSessionProvider: createAuthProvider(),
        autoAcceptIncomingWork: props.autoAcceptIncomingWork ?? false,
        bumpDirtyVersion: props.bumpDirtyVersion,
        refreshUnsavedChapters: props.refreshUnsavedChapters,
        onGitRemoteStatusChanged: props.onGitRemoteStatusChanged,
    });

    props.onState(state);
    return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: HookState = null;

beforeEach(() => {
    vi.clearAllMocks();
    (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    compareServiceMock.buildCompareResultAsync.mockImplementation(
        async ({ currentFiles, sourceFiles }) => ({
            diffsByChapter: buildDiffMap(currentFiles, sourceFiles),
            warnings: [],
        }),
    );
    compareSourceLoaderMock.loadRemoteLatest.mockResolvedValue({
        parsedFiles: [makeBook("incoming")],
        metadataSummary: {
            projectId: "demo",
            languageId: "en",
            languageDirection: "ltr",
        },
        remoteSync: {
            remoteHead: "remote-head",
            localHead: "local-head",
            mergeBase: "merge-base",
            trackedBranch: "master",
            relationship: "behindOnly",
        },
    });
    acceptRemoteLatestReviewMock.acceptRemoteLatestReview.mockResolvedValue({
        projectPath: "/userData/projects/demo",
        kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
        lastCheckedAt: "2026-03-31T15:00:00.000Z",
        lastPublishedAt: null,
        lastKnownLocalHead: "remote-head",
        lastKnownRemoteHead: "remote-head",
    });
});

afterEach(() => {
    if (root) {
        act(() => {
            root?.unmount();
        });
    }
    container?.remove();
    root = null;
    container = null;
    latestState = null;
});

function renderHarness(args: {
    workingFiles: ScriptureBookState[];
    editorRef: React.RefObject<{
        parseEditorState: ReturnType<typeof vi.fn>;
        setEditorState: ReturnType<typeof vi.fn>;
    } | null>;
    refreshUnsavedChapters: (chapters: ChapterRef[]) => Promise<void>;
    bumpDirtyVersion: () => void;
    autoAcceptIncomingWork?: boolean;
    onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
    gitProvider?: GitProvider;
}): WorkingFilesStore {
    const store = new WorkingFilesStore(args.workingFiles);
    const pickedFile = args.workingFiles[0] ?? null;
    const pickedChapter = args.workingFiles[0]?.chapters[0] ?? null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root?.render(
            <HookHarness
                store={store}
                pickedFile={pickedFile}
                pickedChapter={pickedChapter}
                editorRef={args.editorRef}
                refreshUnsavedChapters={args.refreshUnsavedChapters}
                bumpDirtyVersion={args.bumpDirtyVersion}
                autoAcceptIncomingWork={args.autoAcceptIncomingWork}
                onGitRemoteStatusChanged={args.onGitRemoteStatusChanged}
                gitProvider={args.gitProvider}
                onState={(state) => {
                    latestState = state;
                }}
            />,
        );
    });
    return store;
}

describe("useExternalCompare", () => {
    it("invalidates workspace state and clears chapter diffs after taking an incoming chapter", async () => {
        const workingFiles = [makeBook("local")];
        const editorRef = {
            current: {
                parseEditorState: vi.fn((state) => state),
                setEditorState: vi.fn(),
            },
        };
        const refreshUnsavedChapters = vi.fn(async () => {});
        const bumpDirtyVersion = vi.fn();

        const store = renderHarness({
            workingFiles,
            editorRef,
            refreshUnsavedChapters,
            bumpDirtyVersion,
        });

        await act(async () => {
            await latestState?.actions.loadFromRemoteLatest();
            await flush();
        });

        expect(latestState?.state.diffsByChapter?.GEN?.[1]).toHaveLength(1);

        await act(async () => {
            latestState?.actions.applyIncomingChapter("GEN", 1);
            await flush();
            await flush();
        });

        expect(refreshUnsavedChapters).toHaveBeenCalledWith([
            { bookCode: "GEN", chapterNum: 1 },
        ]);
        expect(bumpDirtyVersion).not.toHaveBeenCalled();
        expect(store.read()[0]?.chapters[0]?.currentTokens[0]?.source).toBe(
            "incoming",
        );
        expect(hasDiffs(latestState?.state.diffsByChapter)).toBe(false);
        expect(editorRef.current?.setEditorState).toHaveBeenCalledTimes(1);
    });

    it("invalidates workspace state and clears hunk diffs after taking one incoming hunk", async () => {
        const workingFiles = [makeBook("local")];
        const editorRef = {
            current: {
                parseEditorState: vi.fn((state) => state),
                setEditorState: vi.fn(),
            },
        };
        const refreshUnsavedChapters = vi.fn(async () => {});

        const store = renderHarness({
            workingFiles,
            editorRef,
            refreshUnsavedChapters,
            bumpDirtyVersion: vi.fn(),
        });

        await act(async () => {
            await latestState?.actions.loadFromRemoteLatest();
            await flush();
        });

        const diff = latestState?.state.diffsByChapter?.GEN?.[1]?.[0];
        expect(diff).toBeTruthy();

        await act(async () => {
            if (diff) {
                latestState?.actions.applyIncomingHunk(diff);
            }
            await flush();
            await flush();
        });

        expect(refreshUnsavedChapters).toHaveBeenCalledWith([
            { bookCode: "GEN", chapterNum: 1 },
        ]);
        expect(store.read()[0]?.chapters[0]?.currentTokens[0]?.source).toBe(
            "incoming",
        );
        expect(hasDiffs(latestState?.state.diffsByChapter)).toBe(false);
    });

    it("invalidates all touched chapters before refreshing after take-all", async () => {
        const workingFiles = [makeBook("local", 1), makeBook("local-2", 2)];
        compareSourceLoaderMock.loadRemoteLatest.mockResolvedValue({
            parsedFiles: [makeBook("incoming", 1), makeBook("incoming-2", 2)],
            metadataSummary: {
                projectId: "demo",
                languageId: "en",
                languageDirection: "ltr",
            },
            remoteSync: {
                remoteHead: "remote-head",
                localHead: "local-head",
                mergeBase: "merge-base",
                trackedBranch: "master",
                relationship: "behindOnly",
            },
        });
        const refreshUnsavedChapters = vi.fn(async () => {});
        const onGitRemoteStatusChanged = vi.fn();

        const store = renderHarness({
            workingFiles,
            editorRef: {
                current: {
                    parseEditorState: vi.fn((state) => state),
                    setEditorState: vi.fn(),
                },
            },
            refreshUnsavedChapters,
            bumpDirtyVersion: vi.fn(),
            onGitRemoteStatusChanged,
        });

        await act(async () => {
            await latestState?.actions.loadFromRemoteLatest();
            await flush();
        });

        await act(async () => {
            latestState?.actions.applyIncomingAll();
            await flush();
            await flush();
        });

        expect(refreshUnsavedChapters).toHaveBeenCalledWith(
            expect.arrayContaining([
                { bookCode: "GEN", chapterNum: 1 },
                { bookCode: "GEN", chapterNum: 2 },
            ]),
        );
        expect(acceptRemoteLatestReviewMock.acceptRemoteLatestReview).toHaveBeenCalledWith(
            expect.objectContaining({
                projectPath: "/userData/projects/demo",
                trackedBranch: "master",
                remoteHead: "remote-head",
            }),
        );
        expect(onGitRemoteStatusChanged).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
            }),
        );
        expect(hasDiffs(latestState?.state.diffsByChapter)).toBe(false);
        expect(compareServiceMock.buildCompareResultAsync).toHaveBeenCalledTimes(
            1,
        );
        expect(store.read()[0]?.chapters[0]?.dirty).toBe(false);
    });

    it("auto-accepts safe incoming cloud changes when configured", async () => {
        const workingFiles = [makeBook("source")];
        const refreshUnsavedChapters = vi.fn(async () => {});
        const onGitRemoteStatusChanged = vi.fn();
        const editorRef = {
            current: {
                parseEditorState: vi.fn((state) => state),
                setEditorState: vi.fn(),
            },
        };

        const store = renderHarness({
            workingFiles,
            editorRef,
            refreshUnsavedChapters,
            bumpDirtyVersion: vi.fn(),
            autoAcceptIncomingWork: true,
            onGitRemoteStatusChanged,
        });

        await act(async () => {
            await latestState?.actions.openRemoteLatestReview(
                vi.fn(async () => {}),
                false,
            );
            await flush();
            await flush();
        });

        expect(store.read()[0]?.chapters[0]?.currentTokens[0]?.source).toBe(
            "incoming",
        );
        expect(store.read()[0]?.chapters[0]?.dirty).toBe(false);
        expect(acceptRemoteLatestReviewMock.acceptRemoteLatestReview).toHaveBeenCalled();
        expect(onGitRemoteStatusChanged).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
            }),
        );
        expect(refreshUnsavedChapters).toHaveBeenCalledWith(
            expect.arrayContaining([{ bookCode: "GEN", chapterNum: 1 }]),
        );
        expect(editorRef.current?.setEditorState).toHaveBeenCalled();
        expect(hasDiffs(latestState?.state.diffsByChapter)).toBe(false);
    });

    it("keeps incoming review open when the same verse already has dirty local work", async () => {
        const workingFiles = [makeBook("local")];
        const onGitRemoteStatusChanged = vi.fn();

        renderHarness({
            workingFiles,
            editorRef: {
                current: {
                    parseEditorState: vi.fn((state) => state),
                    setEditorState: vi.fn(),
                },
            },
            refreshUnsavedChapters: vi.fn(async () => {}),
            bumpDirtyVersion: vi.fn(),
            autoAcceptIncomingWork: true,
            onGitRemoteStatusChanged,
        });

        const openDiffModal = vi.fn(async () => {});

        await act(async () => {
            await latestState?.actions.openRemoteLatestReview(
                openDiffModal,
                false,
            );
            await flush();
        });

        expect(openDiffModal).toHaveBeenCalled();
        expect(
            latestState?.state.diffsByChapter?.GEN?.[1]?.[0]?.semanticSid,
        ).toBe("GEN 1:1");
        expect(acceptRemoteLatestReviewMock.acceptRemoteLatestReview).toHaveBeenCalled();
        expect(onGitRemoteStatusChanged).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: GIT_REMOTE_PROJECT_STATUS_CONNECTED,
            }),
        );
    });

    it("does not auto-open diff modal when configured to suppress review modal", async () => {
        const workingFiles = [makeBook("local")];

        renderHarness({
            workingFiles,
            editorRef: {
                current: {
                    parseEditorState: vi.fn((state) => state),
                    setEditorState: vi.fn(),
                },
            },
            refreshUnsavedChapters: vi.fn(async () => {}),
            bumpDirtyVersion: vi.fn(),
            autoAcceptIncomingWork: true,
        });

        const openDiffModal = vi.fn(async () => {});

        await act(async () => {
            await latestState?.actions.openRemoteLatestReview(
                openDiffModal,
                false,
                { openModalOnRequiresReview: false },
            );
            await flush();
        });

        expect(openDiffModal).not.toHaveBeenCalled();
        expect(hasDiffs(latestState?.state.diffsByChapter)).toBe(true);
    });

    it("auto-accepts diverged incoming when 3-way changed books are disjoint", async () => {
        const workingFiles = [
            makeBookForCode("GEN", "source"),
            makeBookForCode("EXO", "local-exo"),
        ];
        const gitProvider = createGitProvider();
        (gitProvider.readProjectSnapshotAtCommit as ReturnType<typeof vi.fn>)
            .mockImplementation(async (_projectPath: string, commitHash: string) => {
                if (commitHash === "merge-base") {
                    return new Map([
                        ["01-GEN.usfm", "source"],
                        ["01-EXO.usfm", "source"],
                    ]);
                }
                if (commitHash === "local-head") {
                    return new Map([
                        ["01-GEN.usfm", "source"],
                        ["01-EXO.usfm", "local-exo"],
                    ]);
                }
                if (commitHash === "remote-head") {
                    return new Map([
                        ["01-GEN.usfm", "incoming-gen"],
                        ["01-EXO.usfm", "source"],
                    ]);
                }
                return new Map();
            });
        compareSourceLoaderMock.loadRemoteLatest.mockResolvedValue({
            parsedFiles: [
                makeBookForCode("GEN", "incoming-gen"),
                makeBookForCode("EXO", "source"),
            ],
            metadataSummary: {
                projectId: "demo",
                languageId: "en",
                languageDirection: "ltr",
            },
            remoteSync: {
                remoteHead: "remote-head",
                localHead: "local-head",
                mergeBase: "merge-base",
                trackedBranch: "master",
                relationship: "diverged",
            },
        });
        const openDiffModal = vi.fn(async () => {});

        const store = renderHarness({
            workingFiles,
            editorRef: {
                current: {
                    parseEditorState: vi.fn((state) => state),
                    setEditorState: vi.fn(),
                },
            },
            refreshUnsavedChapters: vi.fn(async () => {}),
            bumpDirtyVersion: vi.fn(),
            autoAcceptIncomingWork: true,
            gitProvider,
        });

        let result:
            | Awaited<
                  ReturnType<ReturnType<typeof useExternalCompare>["actions"]["openRemoteLatestReview"]>
              >
            | undefined;
        await act(async () => {
            result = await latestState?.actions.openRemoteLatestReview(
                openDiffModal,
                false,
            );
            await flush();
        });

        expect(openDiffModal).not.toHaveBeenCalled();
        expect(store.read()[0]?.chapters[0]?.currentTokens[0]?.source).toBe("incoming-gen");
        expect(store.read()[1]?.chapters[0]?.currentTokens[0]?.source).toBe("local-exo");
        expect(store.read()[1]?.chapters[0]?.dirty).toBe(true);
        expect(acceptRemoteLatestReviewMock.acceptRemoteLatestReview).not.toHaveBeenCalled();
        expect(result?.requiresReconciliationSave).toEqual(
            expect.objectContaining({
                trackedBranch: "master",
                remoteHead: "remote-head",
                relationship: "diverged",
            }),
        );
    });

    it("keeps diverged incoming review open when 3-way changed books overlap", async () => {
        const workingFiles = [makeBookForCode("GEN", "local-gen")];
        const gitProvider = createGitProvider();
        (gitProvider.readProjectSnapshotAtCommit as ReturnType<typeof vi.fn>)
            .mockImplementation(async (_projectPath: string, commitHash: string) => {
                if (commitHash === "merge-base") {
                    return new Map([["01-GEN.usfm", "source"]]);
                }
                if (commitHash === "local-head") {
                    return new Map([["01-GEN.usfm", "local-gen"]]);
                }
                if (commitHash === "remote-head") {
                    return new Map([["01-GEN.usfm", "incoming-gen"]]);
                }
                return new Map();
            });
        compareSourceLoaderMock.loadRemoteLatest.mockResolvedValue({
            parsedFiles: [makeBookForCode("GEN", "incoming-gen")],
            metadataSummary: {
                projectId: "demo",
                languageId: "en",
                languageDirection: "ltr",
            },
            remoteSync: {
                remoteHead: "remote-head",
                localHead: "local-head",
                mergeBase: "merge-base",
                trackedBranch: "master",
                relationship: "diverged",
            },
        });

        const openDiffModal = vi.fn(async () => {});

        const store = renderHarness({
            workingFiles,
            editorRef: {
                current: {
                    parseEditorState: vi.fn((state) => state),
                    setEditorState: vi.fn(),
                },
            },
            refreshUnsavedChapters: vi.fn(async () => {}),
            bumpDirtyVersion: vi.fn(),
            autoAcceptIncomingWork: true,
            gitProvider,
        });

        await act(async () => {
            await latestState?.actions.openRemoteLatestReview(
                openDiffModal,
                false,
            );
            await flush();
        });

        expect(openDiffModal).toHaveBeenCalled();
        expect(store.read()[0]?.chapters[0]?.currentTokens[0]?.source).toBe(
            "local-gen",
        );
        expect(
            acceptRemoteLatestReviewMock.acceptRemoteLatestReview,
        ).not.toHaveBeenCalled();
        expect(hasDiffs(latestState?.state.diffsByChapter)).toBe(true);
    });
});
