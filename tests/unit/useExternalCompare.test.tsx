// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExternalCompare } from "@/app/ui/hooks/save/useExternalCompare.ts";
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
        sourceTokens: [{ kind: "text", text: "source", id: `src-${chapterNumber}` }],
        currentTokens: [{ kind: "text", text, id: `cur-${chapterNumber}` }],
        loadedLexicalState: { root: { children: [], direction: "ltr" } },
        lexicalState: { root: { children: [], direction: "ltr" } },
    } as unknown as ScriptureChapterState;
}

function makeBook(text: string, chapterNumber = 1): ScriptureBookState {
    return {
        path: `/userData/projects/demo/01-GEN-${chapterNumber}.usfm`,
        title: "Genesis",
        bookCode: "GEN",
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
        readProjectSnapshotAtCommit: vi.fn(),
        restoreTrackedFilesFromCommit: vi.fn(),
        commitAll: vi.fn(),
        cloneRemoteRepo: vi.fn(),
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
        currentFiles[0]?.chapters[0]?.currentTokens[0]?.text ?? "";
    const sourceText =
        sourceFiles[0]?.chapters[0]?.currentTokens[0]?.text ?? "";
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

function HookHarness(props: {
    workingFiles: ScriptureBookState[];
    editorRef: React.RefObject<{
        parseEditorState: ReturnType<typeof vi.fn>;
        setEditorState: ReturnType<typeof vi.fn>;
    } | null>;
    refreshUnsavedChapters: (chapters: ChapterRef[]) => Promise<void>;
    bumpDirtyVersion: () => void;
    onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
    onState: (state: ReturnType<typeof useExternalCompare>) => void;
}) {
    const state = useExternalCompare({
        mutWorkingFilesRef: props.workingFiles,
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
            revertDiffBlock: vi.fn(async (sourceTokens) => sourceTokens),
        } as never,
        allProjects: [],
        currentProjectRoute: "demo",
        pickedFile: props.workingFiles[0] ?? null,
        pickedChapter: props.workingFiles[0]?.chapters[0] ?? null,
        editorRef: props.editorRef as never,
        history: createHistory(),
        gitProvider: createGitProvider(),
        versions: [],
        authSessionProvider: createAuthProvider(),
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
    onGitRemoteStatusChanged?: (status: GitRemoteProjectStatus | null) => void;
}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root?.render(
            <HookHarness
                workingFiles={args.workingFiles}
                editorRef={args.editorRef}
                refreshUnsavedChapters={args.refreshUnsavedChapters}
                bumpDirtyVersion={args.bumpDirtyVersion}
                onGitRemoteStatusChanged={args.onGitRemoteStatusChanged}
                onState={(state) => {
                    latestState = state;
                }}
            />,
        );
    });
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

        renderHarness({
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
        expect(workingFiles[0]?.chapters[0]?.currentTokens[0]?.text).toBe(
            "incoming",
        );
        expect(latestState?.state.diffsByChapter?.GEN?.[1]).toEqual([]);
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

        renderHarness({
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
        expect(workingFiles[0]?.chapters[0]?.currentTokens[0]?.text).toBe(
            "incoming",
        );
        expect(latestState?.state.diffsByChapter?.GEN?.[1]).toEqual([]);
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
                trackedBranch: "master",
                relationship: "behindOnly",
            },
        });
        const refreshUnsavedChapters = vi.fn(async () => {});
        const onGitRemoteStatusChanged = vi.fn();

        renderHarness({
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
    });
});
