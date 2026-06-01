// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { RecoveredConflictTracker } from "@/app/state/RecoveredConflictTracker.ts";
import { SaveStatusStore } from "@/app/state/SaveStatusStore.ts";
import { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";
import { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import { useSaveAndRevert } from "@/app/ui/hooks/save/useSaveAndRevert.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { writeGitRemoteProjectInfo } from "@/core/persistence/gitRemoteStore.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const notificationMocks = vi.hoisted(() => ({
    showErrorNotification: vi.fn(),
    showSuccessNotification: vi.fn(),
}));

vi.mock("@/app/ui/components/primitives/notifications.ts", () => ({
    showErrorNotification: notificationMocks.showErrorNotification,
    showNotificationSuccess: notificationMocks.showSuccessNotification,
}));

const storageRoots: StorageRoots = {
    appDataRoot: "/appData",
    projectsRoot: "/userData/projects",
    tempRoot: "/appData/temp",
    cacheRoot: "/appData/cache",
    logsRoot: "/appData/logs",
    databaseRoot: "/appData/database",
};

function makeTokens(text: string, sid: string, id: string): Token[] {
    return [
        {
            id,
            kind: "text",
            span: { start: 0, end: text.length },
            sid,
            source: text,
        },
    ];
}

function makeEditorState(text: string, sid: string, id: string) {
    return {
        root: {
            type: "root" as const,
            version: 1,
            direction: "ltr" as const,
            format: "start" as const,
            indent: 0,
            children: [
                {
                    type: "paragraph",
                    version: 1,
                    direction: "ltr" as const,
                    format: "" as const,
                    indent: 0,
                    textFormat: 0,
                    textStyle: "",
                    children: [
                        createSerializedUSFMTextNode({
                            text,
                            sid,
                            id,
                            tokenType: UsfmTokenTypes.text,
                        }),
                    ],
                },
            ],
        },
    };
}

function makeDirtyChapter(): ScriptureChapterState {
    return {
        chapterNumber: 1,
        dirty: true,
        sourceTokens: makeTokens("\\c 1\n\\p\nOld text.\n", "MAT 1:1", "loaded"),
        currentTokens: makeTokens(
            "\\c 1\n\\p\nNew text.\n",
            "MAT 1:1",
            "current",
        ),
        loadedLexicalState: makeEditorState(
            "\\c 1\n\\p\nOld text.\n",
            "MAT 1:1",
            "loaded",
        ),
        lexicalState: makeEditorState(
            "\\c 1\n\\p\nNew text.\n",
            "MAT 1:1",
            "current",
        ),
    };
}

function makeWorkingFile(): ScriptureBookState {
    return {
        path: "/userData/projects/foo/41-MAT.usfm",
        title: "Matthew",
        bookCode: "MAT",
        nextBookId: null,
        prevBookId: null,
        chapters: [makeDirtyChapter()],
    };
}

function createProject(spies: {
    saveBook: Project["saveBook"];
    addBook: Project["addBook"];
}): Project {
    return {
        folderName: "foo",
        displayName: "Foo Project",
        projectPath: "/userData/projects/foo",
        projectId: "foo",
        projectType: "scripture-burrito",
        language: {
            code: "en",
            name: "English",
            direction: "ltr",
        },
        books: [
            {
                bookCode: "MAT",
                title: "Matthew",
                fileName: "41-MAT.usfm",
                storageKey: "41-MAT.usfm",
                path: "/userData/projects/foo/41-MAT.usfm",
            },
        ],
        listBooks: async () => [],
        getBook: async () => {
            throw new Error("not needed");
        },
        saveBook: spies.saveBook,
        addBook: spies.addBook,
        listVersions: async () => [],
        restoreVersion: async () => {},
        stageAndCommit: async () => ({ hash: "not-used" }),
    };
}

function createAuthSessionProvider(): AuthSessionProvider {
    return {
        getCurrentSession: vi.fn().mockResolvedValue({
            hostBaseUrl: "https://gitea.example.org",
            username: "alice",
            token: "token",
            tokenId: "1",
            tokenName: "zephyr-web",
        }),
        loginWithPassword: vi.fn(),
        replaceSession: vi.fn(),
        logoutCurrentSession: vi.fn().mockResolvedValue(undefined),
        clearSession: vi.fn(),
    };
}

function createGitProvider(spies: {
    commitAll: GitProvider["commitAll"];
    pushCurrentBranch: GitProvider["pushCurrentBranch"];
}): GitProvider {
    return {
        ensureRepo: vi.fn(),
        getBranchInfo: vi.fn(),
        checkoutPreferredBranch: vi.fn(),
        listHistory: vi.fn(),
        readCommitDetails: vi.fn(),
        readProjectSnapshotAtCommit: vi.fn(),
        restoreTrackedFilesFromCommit: vi.fn(),
        commitAll: spies.commitAll,
        cloneRemoteRepo: vi.fn(),
        ensureRemote: vi.fn(),
        inspectRemoteHeads: vi.fn(),
        fetchRemoteHeads: vi.fn(),
        pushCurrentBranch: spies.pushCurrentBranch,
        planReplayOntoRemote: vi.fn(),
        applyReplayPlanOntoRemote: vi.fn(),
        isRepoHealthy: vi.fn(),
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
        runTransaction: async ({ run }) => {
            return await run();
        },
        setNextTypingLabel: vi.fn(),
        registerPostUndoRedoAction: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        clearHistory: vi.fn(),
    };
}

type SaveApi = ReturnType<typeof useSaveAndRevert>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let api: SaveApi | null = null;

function Harness(props: { args: Parameters<typeof useSaveAndRevert>[0] }) {
    api = useSaveAndRevert(props.args);
    return null;
}

function renderSaveHook(args: Parameters<typeof useSaveAndRevert>[0]): SaveApi {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root?.render(<Harness args={args} />);
    });
    if (!api) throw new Error("Harness failed to mount useSaveAndRevert");
    return api;
}

beforeAll(() => {
    const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    if (!g.IS_REACT_ACT_ENVIRONMENT) g.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
    if (root) {
        act(() => {
            root?.unmount();
        });
    }
    if (container) container.remove();
    root = null;
    container = null;
    api = null;
});

describe("useSaveAndRevert", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("preserves the local save and shows a warning when cloud publish throws", async () => {
        const fileSystem = new InMemoryFileSystem();
        await writeGitRemoteProjectInfo({
            fileSystem,
            storageRoots,
            info: {
                schemaVersion: 1,
                projectPath: "/userData/projects/foo",
                hostBaseUrl: "https://gitea.example.org",
                repoId: "1",
                repoOwner: "alice",
                repoName: "foo",
                repoUrl: "https://gitea.example.org/alice/foo",
                trackedBranch: "master",
            },
        });

        const workingFiles = [makeWorkingFile()];
        const store = new WorkingFilesStore(workingFiles);
        const saveBook: Project["saveBook"] = vi
            .fn<Project["saveBook"]>()
            .mockResolvedValue(undefined);
        const addBook: Project["addBook"] = vi
            .fn<Project["addBook"]>()
            .mockResolvedValue({
                bookCode: "MAT",
                title: "Matthew",
                fileName: "41-MAT.usfm",
                storageKey: "41-MAT.usfm",
                path: "/userData/projects/foo/41-MAT.usfm",
            });
        const commitAll: GitProvider["commitAll"] = vi
            .fn<GitProvider["commitAll"]>()
            .mockResolvedValue({ hash: "local-save-hash" });
        const pushCurrentBranch: GitProvider["pushCurrentBranch"] = vi
            .fn<GitProvider["pushCurrentBranch"]>()
            .mockRejectedValue(new Error("offline"));

        const save = renderSaveHook({
            workingFilesStore: store,
            workspaceBaselineStore: new WorkspaceBaselineStore({
                calculateMd5: async (text: string) => text,
            }),
            recoveredConflictTracker: new RecoveredConflictTracker(),
            interactionGate: new WorkspaceGateStore(),
            saveStatusStore: new SaveStatusStore(),
            editorRef: { current: null },
            pickedFile: null,
            pickedChapter: null,
            loadedProject: createProject({ saveBook, addBook }),
            history: createHistory(),
            gitProvider: createGitProvider({ commitAll, pushCurrentBranch }),
            settingsManager: {
                getSettings: vi.fn() as never,
                get: vi.fn().mockImplementation((key: string) =>
                    key === "autoPushOnSave" ? true : undefined,
                ),
                set: vi.fn(),
                update: vi.fn(),
                applySettings: vi.fn(),
            },
            authSessionProvider: createAuthSessionProvider(),
            fileSystem,
            storageRoots,
            usfmOnionService: {} as never,
            isViewingOlderVersion: false,
            selectedVersionHash: null,
            refreshVersions: vi.fn().mockResolvedValue(undefined),
            onSavedVersion: vi.fn(),
            clearUnsavedDiffs: vi.fn(),
            setUnsavedDiffsByChapter: vi.fn(),
            bumpDirtyVersion: vi.fn(),
            refreshUnsavedChapter: vi.fn(),
            rerunCompareForChapters: vi.fn().mockResolvedValue(undefined),
        });

        await act(async () => {
            await save.actions.saveProjectToDisk();
        });

        expect(saveBook).toHaveBeenCalledWith(
            "41-MAT.usfm",
            "\\c 1\n\\p\nNew text.\n",
        );
        expect(addBook).not.toHaveBeenCalled();
        expect(commitAll).toHaveBeenCalledWith(
            "/userData/projects/foo",
            expect.objectContaining({
                op: "save",
                changedChapters: ["MAT 1"],
            }),
            {
                name: "alice",
                email: "alice@users.noreply.gitea.example.org",
            },
        );
        expect(pushCurrentBranch).toHaveBeenCalled();
        expect(store.read()[0].chapters[0].dirty).toBe(false);
        expect(notificationMocks.showSuccessNotification).toHaveBeenCalled();
        expect(notificationMocks.showErrorNotification).toHaveBeenCalledWith({
            notification: {
                title: "Cloud Publish Warning",
                message:
                    "Your changes were saved locally, but publishing to the cloud could not be completed.",
            },
        });
    });

    it("reports non-published cloud outcomes instead of flattening them to published", async () => {
        const fileSystem = new InMemoryFileSystem();
        await writeGitRemoteProjectInfo({
            fileSystem,
            storageRoots,
            info: {
                schemaVersion: 1,
                projectPath: "/userData/projects/foo",
                hostBaseUrl: "https://gitea.example.org",
                repoId: "1",
                repoOwner: "alice",
                repoName: "foo",
                repoUrl: "https://gitea.example.org/alice/foo",
                trackedBranch: "master",
            },
        });

        const store = new WorkingFilesStore([makeWorkingFile()]);
        const saveBook = vi
            .fn<Project["saveBook"]>()
            .mockResolvedValue(undefined);
        const commitAll = vi
            .fn<GitProvider["commitAll"]>()
            .mockResolvedValue({ hash: "local-save-hash" });
        const pushCurrentBranch = vi
            .fn<GitProvider["pushCurrentBranch"]>()
            .mockResolvedValue({
                outcome: "offline",
                localHead: "local-save-hash",
                remoteHead: null,
            });

        const save = renderSaveHook({
            workingFilesStore: store,
            workspaceBaselineStore: new WorkspaceBaselineStore({
                calculateMd5: async (text: string) => text,
            }),
            recoveredConflictTracker: new RecoveredConflictTracker(),
            interactionGate: new WorkspaceGateStore(),
            saveStatusStore: new SaveStatusStore(),
            editorRef: { current: null },
            pickedFile: null,
            pickedChapter: null,
            loadedProject: createProject({ saveBook, addBook: vi.fn() }),
            history: createHistory(),
            gitProvider: createGitProvider({ commitAll, pushCurrentBranch }),
            settingsManager: {
                getSettings: vi.fn() as never,
                get: vi.fn().mockImplementation((key: string) =>
                    key === "autoPushOnSave" ? true : undefined,
                ),
                set: vi.fn(),
                update: vi.fn(),
                applySettings: vi.fn(),
            },
            authSessionProvider: createAuthSessionProvider(),
            fileSystem,
            storageRoots,
            usfmOnionService: {} as never,
            isViewingOlderVersion: false,
            selectedVersionHash: null,
            refreshVersions: vi.fn().mockResolvedValue(undefined),
            onSavedVersion: vi.fn(),
            clearUnsavedDiffs: vi.fn(),
            setUnsavedDiffsByChapter: vi.fn(),
            bumpDirtyVersion: vi.fn(),
            refreshUnsavedChapter: vi.fn(),
            rerunCompareForChapters: vi.fn().mockResolvedValue(undefined),
        });

        let result: Awaited<ReturnType<typeof save.actions.saveProjectToDisk>>;
        await act(async () => {
            result = await save.actions.saveProjectToDisk();
        });

        // biome-ignore lint/style/noNonNullAssertion: assigned synchronously inside act above
        expect(result!.kind).toBe("saved");
        // biome-ignore lint/style/noNonNullAssertion: narrowed by kind assertion above
        expect(result!.kind === "saved" ? result!.publish : null).toEqual({
            kind: "pendingPublish",
            reason: "offline",
        });
    });

    it("checkpoint failure: bytes are saved + marked clean, version warning shown, NOT failed status", async () => {
        // Cross-cutting invariant (decision #3): "saved to disk" != "versioned".
        // A git commit failure must NOT retain dirty or strand the save — the
        // bytes are on disk. The savePipeline extraction must preserve this.
        const fileSystem = new InMemoryFileSystem();
        const store = new WorkingFilesStore([makeWorkingFile()]);
        const saveStatusStore = new SaveStatusStore();
        const saveBook = vi
            .fn<Project["saveBook"]>()
            .mockResolvedValue(undefined);
        const commitAll = vi
            .fn<GitProvider["commitAll"]>()
            .mockRejectedValue(new Error("git index locked"));
        const pushCurrentBranch = vi.fn<GitProvider["pushCurrentBranch"]>();

        const save = renderSaveHook({
            workingFilesStore: store,
            workspaceBaselineStore: new WorkspaceBaselineStore({
                calculateMd5: async (text: string) => text,
            }),
            recoveredConflictTracker: new RecoveredConflictTracker(),
            interactionGate: new WorkspaceGateStore(),
            saveStatusStore,
            editorRef: { current: null },
            pickedFile: null,
            pickedChapter: null,
            loadedProject: createProject({ saveBook, addBook: vi.fn() }),
            history: createHistory(),
            gitProvider: createGitProvider({ commitAll, pushCurrentBranch }),
            settingsManager: {
                getSettings: vi.fn() as never,
                get: vi.fn().mockReturnValue(undefined),
                set: vi.fn(),
                update: vi.fn(),
                applySettings: vi.fn(),
            },
            authSessionProvider: createAuthSessionProvider(),
            fileSystem,
            storageRoots,
            usfmOnionService: {} as never,
            isViewingOlderVersion: false,
            selectedVersionHash: null,
            refreshVersions: vi.fn().mockResolvedValue(undefined),
            onSavedVersion: vi.fn(),
            clearUnsavedDiffs: vi.fn(),
            setUnsavedDiffsByChapter: vi.fn(),
            bumpDirtyVersion: vi.fn(),
            refreshUnsavedChapter: vi.fn(),
            rerunCompareForChapters: vi.fn().mockResolvedValue(undefined),
        });

        let result: Awaited<
            ReturnType<typeof save.actions.saveProjectToDisk>
        >;
        await act(async () => {
            result = await save.actions.saveProjectToDisk();
        });

        // Bytes landed on disk.
        expect(saveBook).toHaveBeenCalled();
        // Checkpoint attempt failed → publish never attempted.
        expect(commitAll).toHaveBeenCalled();
        expect(pushCurrentBranch).not.toHaveBeenCalled();
        // The book is still marked CLEAN — the disk write succeeded.
        expect(store.read()[0].chapters[0].dirty).toBe(false);
        // Result reports a successful disk save (NOT failed/partial).
        // biome-ignore lint/style/noNonNullAssertion: assigned synchronously inside act above
        expect(result!.kind).toBe("saved");
        // Status is NOT stranded/failed — the save succeeded to disk.
        expect(saveStatusStore.getSnapshot().kind).not.toBe("failed");
        expect(saveStatusStore.getSnapshot().kind).not.toBe("saving");
        // The user is warned that the version checkpoint could not be created.
        expect(notificationMocks.showErrorNotification).toHaveBeenCalledWith({
            notification: {
                title: "Version History Warning",
                message:
                    "Your changes were saved, but a local version checkpoint could not be created.",
            },
        });
    });

    it("prepares the remote base before saving when reconciliation is pending", async () => {
        const fileSystem = new InMemoryFileSystem();
        const workingFiles = [makeWorkingFile()];
        const store = new WorkingFilesStore(workingFiles);
        const callOrder: string[] = [];
        const saveBook: Project["saveBook"] = vi
            .fn<Project["saveBook"]>(async () => {
                callOrder.push("saveBook");
                return Promise.resolve(undefined);
            });
        const addBook: Project["addBook"] = vi
            .fn<Project["addBook"]>()
            .mockResolvedValue({
                bookCode: "MAT",
                title: "Matthew",
                fileName: "41-MAT.usfm",
                storageKey: "41-MAT.usfm",
                path: "/userData/projects/foo/41-MAT.usfm",
            });
        const commitAll: GitProvider["commitAll"] = vi
            .fn<GitProvider["commitAll"]>(async () => {
                callOrder.push("commitAll");
                return { hash: "local-save-hash" };
            });
        const pushCurrentBranch: GitProvider["pushCurrentBranch"] = vi
            .fn<GitProvider["pushCurrentBranch"]>()
            .mockResolvedValue({
                outcome: "published",
                localHead: "local-save-hash",
                remoteHead: "local-save-hash",
            });
        const prepareRemoteBaseForSave = vi.fn(async () => {
            callOrder.push("prepare");
        });

        const save = renderSaveHook({
            workingFilesStore: store,
            workspaceBaselineStore: new WorkspaceBaselineStore({
                calculateMd5: async (text: string) => text,
            }),
            recoveredConflictTracker: new RecoveredConflictTracker(),
            interactionGate: new WorkspaceGateStore(),
            saveStatusStore: new SaveStatusStore(),
            editorRef: { current: null },
            pickedFile: null,
            pickedChapter: null,
            loadedProject: createProject({ saveBook, addBook }),
            history: createHistory(),
            gitProvider: createGitProvider({ commitAll, pushCurrentBranch }),
            settingsManager: {
                getSettings: vi.fn() as never,
                get: vi.fn().mockImplementation((key: string) =>
                    key === "autoPushOnSave" ? true : undefined,
                ),
                set: vi.fn(),
                update: vi.fn(),
                applySettings: vi.fn(),
            },
            authSessionProvider: createAuthSessionProvider(),
            fileSystem,
            storageRoots,
            usfmOnionService: {} as never,
            isViewingOlderVersion: false,
            selectedVersionHash: null,
            refreshVersions: vi.fn().mockResolvedValue(undefined),
            onSavedVersion: vi.fn(),
            clearUnsavedDiffs: vi.fn(),
            setUnsavedDiffsByChapter: vi.fn(),
            bumpDirtyVersion: vi.fn(),
            refreshUnsavedChapter: vi.fn(),
            rerunCompareForChapters: vi.fn().mockResolvedValue(undefined),
            prepareRemoteBaseForSave,
        });

        await act(async () => {
            await save.actions.saveProjectToDisk();
        });

        expect(prepareRemoteBaseForSave).toHaveBeenCalledTimes(1);
        expect(callOrder).toEqual(["prepare", "saveBook", "commitAll"]);
    });

    it("partial save honesty (0a): a mid-loop write failure leaves only persisted books clean", async () => {
        const fileSystem = new InMemoryFileSystem();
        const makeDirtyBookFor = (
            code: string,
            fileName: string,
        ): ScriptureBookState => ({
            path: `/userData/projects/foo/${fileName}`,
            title: code,
            bookCode: code,
            nextBookId: null,
            prevBookId: null,
            chapters: [
                {
                    chapterNumber: 1,
                    dirty: true,
                    sourceTokens: makeTokens(`old ${code}`, `${code} 1:1`, "loaded"),
                    currentTokens: makeTokens(`new ${code}`, `${code} 1:1`, "current"),
                    loadedLexicalState: makeEditorState(`old ${code}`, `${code} 1:1`, "loaded"),
                    lexicalState: makeEditorState(`new ${code}`, `${code} 1:1`, "current"),
                },
            ],
        });
        const store = new WorkingFilesStore([
            makeDirtyBookFor("GEN", "01-GEN.usfm"),
            makeDirtyBookFor("EXO", "02-EXO.usfm"),
            makeDirtyBookFor("LEV", "03-LEV.usfm"),
        ]);

        // Stop-on-first-failure: the 2nd book's write throws.
        let writeCount = 0;
        const saveBook: Project["saveBook"] = vi.fn<Project["saveBook"]>(
            async () => {
                writeCount += 1;
                if (writeCount === 2) throw new Error("disk full");
            },
        );
        const addBook: Project["addBook"] = vi.fn();
        const baseProject = createProject({ saveBook, addBook });
        const loadedProject: Project = {
            ...baseProject,
            books: ["GEN", "EXO", "LEV"].map((code, i) => ({
                bookCode: code,
                title: code,
                fileName: `0${i + 1}-${code}.usfm`,
                storageKey: `0${i + 1}-${code}.usfm`,
                path: `/userData/projects/foo/0${i + 1}-${code}.usfm`,
            })),
        };

        const save = renderSaveHook({
            workingFilesStore: store,
            workspaceBaselineStore: new WorkspaceBaselineStore({
                calculateMd5: async (text: string) => text,
            }),
            recoveredConflictTracker: new RecoveredConflictTracker(),
            interactionGate: new WorkspaceGateStore(),
            saveStatusStore: new SaveStatusStore(),
            editorRef: { current: null },
            pickedFile: null,
            pickedChapter: null,
            loadedProject,
            history: createHistory(),
            gitProvider: createGitProvider({
                commitAll: vi.fn<GitProvider["commitAll"]>(),
                pushCurrentBranch: vi.fn<GitProvider["pushCurrentBranch"]>(),
            }),
            settingsManager: {
                getSettings: vi.fn() as never,
                get: vi.fn().mockReturnValue(undefined),
                set: vi.fn(),
                update: vi.fn(),
                applySettings: vi.fn(),
            },
            authSessionProvider: createAuthSessionProvider(),
            fileSystem,
            storageRoots,
            usfmOnionService: {} as never,
            isViewingOlderVersion: false,
            selectedVersionHash: null,
            refreshVersions: vi.fn().mockResolvedValue(undefined),
            onSavedVersion: vi.fn(),
            clearUnsavedDiffs: vi.fn(),
            setUnsavedDiffsByChapter: vi.fn(),
            bumpDirtyVersion: vi.fn(),
            refreshUnsavedChapter: vi.fn(),
            rerunCompareForChapters: vi.fn().mockResolvedValue(undefined),
        });

        let result: Awaited<
            ReturnType<typeof save.actions.saveProjectToDisk>
        >;
        await act(async () => {
            result = await save.actions.saveProjectToDisk();
        });

        // biome-ignore lint/style/noNonNullAssertion: assigned synchronously inside act above
        expect(result!.kind).toBe("partial");
        const dirtyByBook = Object.fromEntries(
            store.read().map((book) => [book.bookCode, book.chapters[0].dirty]),
        );
        // GEN persisted before the failure → clean. EXO failed, LEV never
        // attempted → both stay dirty (honest per-book state).
        expect(dirtyByBook).toEqual({ GEN: false, EXO: true, LEV: true });
    });

    it("fails loud (does not strand `saving`) when the save base prep throws before any write", async () => {
        const fileSystem = new InMemoryFileSystem();
        const store = new WorkingFilesStore([makeWorkingFile()]);
        const saveStatusStore = new SaveStatusStore();
        const interactionGate = new WorkspaceGateStore();
        const saveBook = vi.fn<Project["saveBook"]>();
        const prepareError = new Error("remote base unreachable");
        const prepareRemoteBaseForSave = vi.fn(async () => {
            throw prepareError;
        });

        const save = renderSaveHook({
            workingFilesStore: store,
            workspaceBaselineStore: new WorkspaceBaselineStore({
                calculateMd5: async (text: string) => text,
            }),
            recoveredConflictTracker: new RecoveredConflictTracker(),
            interactionGate,
            saveStatusStore,
            editorRef: { current: null },
            pickedFile: null,
            pickedChapter: null,
            loadedProject: createProject({ saveBook, addBook: vi.fn() }),
            history: createHistory(),
            gitProvider: createGitProvider({
                commitAll: vi.fn(),
                pushCurrentBranch: vi.fn(),
            }),
            settingsManager: {
                getSettings: vi.fn() as never,
                get: vi.fn().mockReturnValue(undefined),
                set: vi.fn(),
                update: vi.fn(),
                applySettings: vi.fn(),
            },
            authSessionProvider: createAuthSessionProvider(),
            fileSystem,
            storageRoots,
            usfmOnionService: {} as never,
            isViewingOlderVersion: false,
            selectedVersionHash: null,
            refreshVersions: vi.fn().mockResolvedValue(undefined),
            onSavedVersion: vi.fn(),
            clearUnsavedDiffs: vi.fn(),
            setUnsavedDiffsByChapter: vi.fn(),
            bumpDirtyVersion: vi.fn(),
            refreshUnsavedChapter: vi.fn(),
            rerunCompareForChapters: vi.fn().mockResolvedValue(undefined),
            prepareRemoteBaseForSave,
        });

        let result: Awaited<
            ReturnType<typeof save.actions.saveProjectToDisk>
        >;
        await act(async () => {
            // Must RESOLVE to a typed result, not reject to the caller.
            result = await save.actions.saveProjectToDisk();
        });

        expect(prepareRemoteBaseForSave).toHaveBeenCalledTimes(1);
        // biome-ignore lint/style/noNonNullAssertion: assigned synchronously inside act above
        expect(result!).toEqual({ kind: "failed", error: prepareError });
        // Nothing written, status is failed (not stranded in `saving`), and the
        // gate is reopened so the workspace is not permanently locked.
        expect(saveBook).not.toHaveBeenCalled();
        expect(saveStatusStore.getSnapshot()).toEqual({
            kind: "failed",
            error: prepareError,
        });
        expect(interactionGate.get()).toEqual({ kind: "open" });
    });

    it("returns a typed blocked reason when the gate is closed", async () => {
        const store = new WorkingFilesStore([makeWorkingFile()]);
        const save = renderSaveHook({
            workingFilesStore: store,
            workspaceBaselineStore: new WorkspaceBaselineStore({
                calculateMd5: async (text: string) => text,
            }),
            recoveredConflictTracker: new RecoveredConflictTracker(),
            interactionGate: new WorkspaceGateStore({ kind: "saving" }),
            saveStatusStore: new SaveStatusStore(),
            editorRef: { current: null },
            pickedFile: null,
            pickedChapter: null,
            loadedProject: createProject({
                saveBook: vi.fn(),
                addBook: vi.fn(),
            }),
            history: createHistory(),
            gitProvider: createGitProvider({
                commitAll: vi.fn(),
                pushCurrentBranch: vi.fn(),
            }),
            settingsManager: {
                getSettings: vi.fn() as never,
                get: vi.fn().mockReturnValue(undefined),
                set: vi.fn(),
                update: vi.fn(),
                applySettings: vi.fn(),
            },
            authSessionProvider: createAuthSessionProvider(),
            fileSystem: new InMemoryFileSystem(),
            storageRoots,
            usfmOnionService: {} as never,
            isViewingOlderVersion: false,
            selectedVersionHash: null,
            refreshVersions: vi.fn().mockResolvedValue(undefined),
            onSavedVersion: vi.fn(),
            clearUnsavedDiffs: vi.fn(),
            setUnsavedDiffsByChapter: vi.fn(),
            bumpDirtyVersion: vi.fn(),
            refreshUnsavedChapter: vi.fn(),
            rerunCompareForChapters: vi.fn().mockResolvedValue(undefined),
        });

        let result: Awaited<
            ReturnType<typeof save.actions.saveProjectToDisk>
        >;
        await act(async () => {
            result = await save.actions.saveProjectToDisk();
        });

        // biome-ignore lint/style/noNonNullAssertion: assigned synchronously inside act above
        expect(result!).toEqual({ kind: "blocked", reason: "gate-closed" });
    });
});
