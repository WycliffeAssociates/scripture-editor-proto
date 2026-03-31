import { describe, expect, it, vi, beforeEach } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
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

vi.mock("@/app/ui/components/primitives/Notifications.tsx", () => ({
    ShowErrorNotification: notificationMocks.showErrorNotification,
    ShowNotificationSuccess: notificationMocks.showSuccessNotification,
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
            text,
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
            tokenName: "dovetail-web",
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
        readProjectSnapshotAtCommit: vi.fn(),
        restoreTrackedFilesFromCommit: vi.fn(),
        commitAll: spies.commitAll,
        cloneRemoteRepo: vi.fn(),
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

        const save = useSaveAndRevert({
            mutWorkingFilesRef: workingFiles,
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

        await save.actions.saveProjectToDisk();

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
        expect(workingFiles[0].chapters[0].dirty).toBe(false);
        expect(notificationMocks.showSuccessNotification).toHaveBeenCalled();
        expect(notificationMocks.showErrorNotification).toHaveBeenCalledWith({
            notification: {
                title: "Cloud Publish Warning",
                message:
                    "Your changes were saved locally, but publishing to the cloud could not be completed.",
            },
        });
    });
});
