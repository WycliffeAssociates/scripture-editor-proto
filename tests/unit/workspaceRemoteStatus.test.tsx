// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

const hydrateGitRemoteStatusOnOpenMock = vi.fn();
const publishLinkedProjectNowMock = vi.fn();
const readGitRemoteProjectStatusMock = vi.fn();
const useLoaderDataMock = vi.fn();
const useRouterMock = vi.fn();
const openRemoteLatestReviewMock = vi.fn();

vi.mock("@tanstack/react-router", async () => {
    const actual =
        await vi.importActual<typeof import("@tanstack/react-router")>(
            "@tanstack/react-router",
        );
    return {
        ...actual,
        useLoaderData: () => useLoaderDataMock(),
        useRouter: () => useRouterMock(),
    };
});

vi.mock("@/app/domain/project/gitRemoteOpenStatus.ts", async () => {
    const actual =
        await vi.importActual<
            typeof import("@/app/domain/project/gitRemoteOpenStatus.ts")
        >("@/app/domain/project/gitRemoteOpenStatus.ts");
    return {
        ...actual,
        hydrateGitRemoteStatusOnOpen: (...args: unknown[]) =>
            hydrateGitRemoteStatusOnOpenMock(...args),
    };
});

vi.mock("@/app/domain/project/gitRemotePublishCoordinator.ts", async () => {
    const actual =
        await vi.importActual<
            typeof import("@/app/domain/project/gitRemotePublishCoordinator.ts")
        >("@/app/domain/project/gitRemotePublishCoordinator.ts");
    return {
        ...actual,
        publishLinkedProjectNow: (...args: unknown[]) =>
            publishLinkedProjectNowMock(...args),
    };
});

vi.mock("@/core/persistence/gitRemoteStore.ts", async () => {
    const actual =
        await vi.importActual<typeof import("@/core/persistence/gitRemoteStore.ts")>(
            "@/core/persistence/gitRemoteStore.ts",
        );
    return {
        ...actual,
        readGitRemoteProjectStatus: (...args: unknown[]) =>
            readGitRemoteProjectStatusMock(...args),
    };
});

vi.mock("@/app/ui/hooks/useDynamicStyles.tsx", () => ({
    useDynamicStylesheet: () => ({}),
}));

vi.mock("@/app/ui/hooks/useWorkspaceState.tsx", () => ({
    useWorkspaceState: () => ({
        appSettings: {},
        updateAppSettings: vi.fn(),
        currentFileBibleIdentifier: "MAT",
        setCurrentFileBibleIdentifier: vi.fn(),
        currentChapter: 1,
        setCurrentChapter: vi.fn(),
        referenceProjectPath: null,
        setReferenceProjectPath: vi.fn(),
        pickedFile: {
            bookCode: "MAT",
            chapters: [{ chapterNumber: 1 }],
        },
        pickedChapter: { chapterNumber: 1 },
        isProcessing: false,
        setIsProcessing: vi.fn(),
        formatMatchReport: null,
        setFormatMatchReport: vi.fn(),
        isFormatMatchSuggestionsOpen: false,
        setIsFormatMatchSuggestionsOpen: vi.fn(),
        autoOpenFormatMatchSuggestions: true,
        setAutoOpenFormatMatchSuggestions: vi.fn(),
        targetMarkerPreservationMode: "recommended",
        setTargetMarkerPreservationMode: vi.fn(),
    }),
}));

vi.mock("@/app/ui/hooks/useCustomHistory.ts", () => ({
    useCustomHistory: () => ({
        version: 1,
        canUndo: false,
        canRedo: false,
        peekUndoLabel: () => null,
        peekRedoLabel: () => null,
        captureEditorUpdate: vi.fn(),
        captureEditorSelection: vi.fn(),
        runTransaction: vi.fn(),
        setNextTypingLabel: vi.fn(),
        registerPostUndoRedoAction: () => () => {},
        undo: vi.fn(),
        redo: vi.fn(),
        clearHistory: vi.fn(),
    }),
}));

vi.mock("@/app/ui/hooks/useSave.tsx", () => ({
    useSave: () => ({
        diff: { open: vi.fn(), refreshChapter: vi.fn() },
        save: { saveProjectToDisk: vi.fn(), hasUnsavedChanges: false },
        revert: {},
        versions: {},
        compare: {
            openRemoteLatestReview: (...args: unknown[]) =>
                openRemoteLatestReviewMock(...args),
        },
    }),
}));

vi.mock("@/app/ui/hooks/useLint.tsx", () => ({
    useLint: () => ({
        replaceErrorsForBook: vi.fn(),
    }),
}));

vi.mock("@/app/ui/hooks/useReferenceItem.tsx", () => ({
    useReferenceItem: () => ({
        referenceScriptureQuery: { data: null },
    }),
}));

vi.mock("@/app/ui/hooks/useActions.tsx", () => ({
    useWorkspaceActions: () => ({
        saveCurrentDirtyLexical: vi.fn(),
        switchBookOrChapter: vi.fn(),
    }),
}));

vi.mock("@/app/ui/hooks/useSearch.tsx", () => ({
    useProjectSearch: () => ({}),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
    (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    hydrateGitRemoteStatusOnOpenMock.mockReset();
    publishLinkedProjectNowMock.mockReset();
    readGitRemoteProjectStatusMock.mockReset();
    openRemoteLatestReviewMock.mockReset();
    hydrateGitRemoteStatusOnOpenMock.mockResolvedValue({
        kind: "connected",
        status: {
            projectPath: "/userData/projects/foo",
            kind: "connected",
            lastCheckedAt: null,
            lastPublishedAt: null,
            lastKnownLocalHead: null,
            lastKnownRemoteHead: null,
        },
    });
    publishLinkedProjectNowMock.mockResolvedValue({ kind: "published" });
    readGitRemoteProjectStatusMock.mockResolvedValue({
        projectPath: "/userData/projects/foo",
        kind: "connected",
        lastCheckedAt: "2026-03-31T10:00:00.000Z",
        lastPublishedAt: "2026-03-31T10:00:00.000Z",
        lastKnownLocalHead: "local-head",
        lastKnownRemoteHead: "local-head",
    });
    useLoaderDataMock.mockReturnValue({ projects: [] });
    useRouterMock.mockReturnValue({
        options: {
            context: {
                settingsManager: {
                    get: vi.fn().mockReturnValue("regular"),
                    getSettings: vi.fn().mockReturnValue({}),
                    update: vi.fn(),
                    set: vi.fn(),
                    applySettings: vi.fn(),
                },
                projectsService: {},
                libraryService: {},
                fileSystem: { readText: vi.fn() },
                authSessionProvider: {},
                storageRoots: {},
                usfmOnionService: {},
                gitProvider: {},
            },
        },
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
});

function render(ui: React.ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root?.render(ui);
    });
}

function RemoteStatusConsumer() {
    const { remote } = useWorkspaceContext();

    return (
        <div>
            <button type="button" onClick={() => void remote.syncNow()}>
                sync
            </button>
            <button type="button" onClick={() => void remote.reviewIncoming()}>
                review
            </button>
            <span>{remote.status?.kind ?? "none"}</span>
        </div>
    );
}

describe("ProjectProvider remote open hydration", () => {
    it("starts non-blocking remote status hydration when the project provider mounts", async () => {
        render(
            <ProjectProvider
                currentProjectRoute="foo"
                projectFiles={[
                    {
                        path: "/userData/projects/foo/41-MAT.usfm",
                        title: "Matthew",
                        bookCode: "MAT",
                        nextBookId: null,
                        prevBookId: null,
                        chapters: [
                            {
                                chapterNumber: 1,
                                lexicalState: { root: { children: [] } } as never,
                                loadedLexicalState: {
                                    root: { children: [] },
                                } as never,
                                sourceTokens: [],
                                currentTokens: [],
                                dirty: false,
                            },
                        ],
                    },
                ]}
                initialLintErrorsByBook={{}}
                loadedProject={{
                    folderName: "foo",
                    displayName: "Foo",
                    projectPath: "/userData/projects/foo",
                    projectId: "foo",
                    projectType: "scripture-burrito",
                    language: {
                        code: "en",
                        name: "English",
                        direction: "ltr",
                    },
                    books: [{ bookCode: "MAT", title: "Matthew" }] as never,
                    listBooks: async () => [],
                    getBook: async () => {
                        throw new Error("not needed");
                    },
                    saveBook: async () => {},
                    addBook: async () => {
                        throw new Error("not needed");
                    },
                    listVersions: async () => [],
                    restoreVersion: async () => {},
                    stageAndCommit: async () => ({ hash: "abc" }),
                }}
            >
                <RemoteStatusConsumer />
            </ProjectProvider>,
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(hydrateGitRemoteStatusOnOpenMock).toHaveBeenCalledWith(
            expect.objectContaining({
                projectPath: "/userData/projects/foo",
            }),
        );
        expect(document.body.textContent).toContain("connected");
    });

    it("forces a refresh when explicit sync is triggered from workspace remote actions", async () => {
        render(
            <ProjectProvider
                currentProjectRoute="foo"
                projectFiles={[
                    {
                        path: "/userData/projects/foo/41-MAT.usfm",
                        title: "Matthew",
                        bookCode: "MAT",
                        nextBookId: null,
                        prevBookId: null,
                        chapters: [
                            {
                                chapterNumber: 1,
                                lexicalState: { root: { children: [] } } as never,
                                loadedLexicalState: {
                                    root: { children: [] },
                                } as never,
                                sourceTokens: [],
                                currentTokens: [],
                                dirty: false,
                            },
                        ],
                    },
                ]}
                initialLintErrorsByBook={{}}
                loadedProject={{
                    folderName: "foo",
                    displayName: "Foo",
                    projectPath: "/userData/projects/foo",
                    projectId: "foo",
                    projectType: "scripture-burrito",
                    language: {
                        code: "en",
                        name: "English",
                        direction: "ltr",
                    },
                    books: [{ bookCode: "MAT", title: "Matthew" }] as never,
                    listBooks: async () => [],
                    getBook: async () => {
                        throw new Error("not needed");
                    },
                    saveBook: async () => {},
                    addBook: async () => {
                        throw new Error("not needed");
                    },
                    listVersions: async () => [],
                    restoreVersion: async () => {},
                    stageAndCommit: async () => ({ hash: "abc" }),
                }}
            >
                <RemoteStatusConsumer />
            </ProjectProvider>,
        );

        await act(async () => {
            await Promise.resolve();
        });

        const syncButton = document.querySelector("button");
        expect(syncButton).not.toBeNull();
        await act(async () => {
            syncButton?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            await Promise.resolve();
        });

        expect(hydrateGitRemoteStatusOnOpenMock).toHaveBeenLastCalledWith(
            expect.objectContaining({
                projectPath: "/userData/projects/foo",
                forceSync: true,
            }),
        );
    });

    it("publishes immediately when explicit sync is triggered from pending publish status", async () => {
        hydrateGitRemoteStatusOnOpenMock.mockResolvedValue({
            kind: "pendingPublish",
            status: {
                projectPath: "/userData/projects/foo",
                kind: "pendingPublish",
                lastCheckedAt: null,
                lastPublishedAt: null,
                lastKnownLocalHead: "local-head",
                lastKnownRemoteHead: "remote-head",
            },
        });

        render(
            <ProjectProvider
                currentProjectRoute="foo"
                projectFiles={[
                    {
                        path: "/userData/projects/foo/41-MAT.usfm",
                        title: "Matthew",
                        bookCode: "MAT",
                        nextBookId: null,
                        prevBookId: null,
                        chapters: [
                            {
                                chapterNumber: 1,
                                lexicalState: { root: { children: [] } } as never,
                                loadedLexicalState: {
                                    root: { children: [] },
                                } as never,
                                sourceTokens: [],
                                currentTokens: [],
                                dirty: false,
                            },
                        ],
                    },
                ]}
                initialLintErrorsByBook={{}}
                loadedProject={{
                    folderName: "foo",
                    displayName: "Foo",
                    projectPath: "/userData/projects/foo",
                    projectId: "foo",
                    projectType: "scripture-burrito",
                    language: {
                        code: "en",
                        name: "English",
                        direction: "ltr",
                    },
                    books: [{ bookCode: "MAT", title: "Matthew" }] as never,
                    listBooks: async () => [],
                    getBook: async () => {
                        throw new Error("not needed");
                    },
                    saveBook: async () => {},
                    addBook: async () => {
                        throw new Error("not needed");
                    },
                    listVersions: async () => [],
                    restoreVersion: async () => {},
                    stageAndCommit: async () => ({ hash: "abc" }),
                }}
            >
                <RemoteStatusConsumer />
            </ProjectProvider>,
        );

        await act(async () => {
            await Promise.resolve();
        });

        const syncButton = document.querySelector("button");
        expect(syncButton).not.toBeNull();

        await act(async () => {
            syncButton?.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
            await Promise.resolve();
        });

        expect(publishLinkedProjectNowMock).toHaveBeenCalledWith(
            expect.objectContaining({
                projectPath: "/userData/projects/foo",
            }),
        );
        expect(hydrateGitRemoteStatusOnOpenMock).toHaveBeenCalledTimes(1);
        expect(readGitRemoteProjectStatusMock).toHaveBeenCalledWith(
            expect.objectContaining({
                projectPath: "/userData/projects/foo",
            }),
        );
    });

    it("routes review requests through the save compare remote-review action", async () => {
        render(
            <ProjectProvider
                currentProjectRoute="foo"
                projectFiles={[
                    {
                        path: "/userData/projects/foo/41-MAT.usfm",
                        title: "Matthew",
                        bookCode: "MAT",
                        nextBookId: null,
                        prevBookId: null,
                        chapters: [
                            {
                                chapterNumber: 1,
                                lexicalState: { root: { children: [] } } as never,
                                loadedLexicalState: {
                                    root: { children: [] },
                                } as never,
                                sourceTokens: [],
                                currentTokens: [],
                                dirty: false,
                            },
                        ],
                    },
                ]}
                initialLintErrorsByBook={{}}
                loadedProject={{
                    folderName: "foo",
                    displayName: "Foo",
                    projectPath: "/userData/projects/foo",
                    projectId: "foo",
                    projectType: "scripture-burrito",
                    language: {
                        code: "en",
                        name: "English",
                        direction: "ltr",
                    },
                    books: [{ bookCode: "MAT", title: "Matthew" }] as never,
                    listBooks: async () => [],
                    getBook: async () => {
                        throw new Error("not needed");
                    },
                    saveBook: async () => {},
                    addBook: async () => {
                        throw new Error("not needed");
                    },
                    listVersions: async () => [],
                    restoreVersion: async () => {},
                    stageAndCommit: async () => ({ hash: "abc" }),
                }}
            >
                <RemoteStatusConsumer />
            </ProjectProvider>,
        );

        await act(async () => {
            await Promise.resolve();
        });

        const buttons = [...document.querySelectorAll("button")];
        await act(async () => {
            buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await Promise.resolve();
        });

        expect(openRemoteLatestReviewMock).toHaveBeenCalled();
    });
});
