// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectProvider } from "@/app/ui/contexts/WorkspaceContext.tsx";

const hydrateGitRemoteStatusOnOpenMock = vi.fn();
const useLoaderDataMock = vi.fn();
const useRouterMock = vi.fn();

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

vi.mock("@/app/domain/project/gitRemoteOpenStatus.ts", () => ({
    hydrateGitRemoteStatusOnOpen: (...args: unknown[]) =>
        hydrateGitRemoteStatusOnOpenMock(...args),
}));

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
        compare: {},
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
    hydrateGitRemoteStatusOnOpenMock.mockResolvedValue({
        kind: "connected",
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
                <div>child</div>
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
        expect(document.body.textContent).toContain("child");
    });
});
