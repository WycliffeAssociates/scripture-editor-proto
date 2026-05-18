// @vitest-environment jsdom

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSave } from "@/app/ui/hooks/useSave.tsx";

const useRouterMock = vi.fn();
const diffOpenMock = vi.fn();
const saveProjectToDiskMock = vi.fn();

vi.mock("@tanstack/react-router", async () => {
    const actual =
        await vi.importActual<typeof import("@tanstack/react-router")>(
            "@tanstack/react-router",
        );
    return {
        ...actual,
        useRouter: () => useRouterMock(),
    };
});

vi.mock("@/app/ui/hooks/save/useVersionHistory.ts", () => ({
    useVersionHistory: () => ({
        state: {
            entries: [],
            isViewingOlderVersion: false,
            isOpen: false,
            isLoading: false,
            selectedHash: null,
            latestHash: null,
            isDirtyPromptOpen: false,
        },
        actions: {
            ensureLoaded: vi.fn(async () => {}),
            close: vi.fn(),
            refresh: vi.fn(async () => {}),
            setLatestHash: vi.fn(),
            setSelectedHash: vi.fn(),
            open: vi.fn(async () => {}),
            loadMore: vi.fn(async () => {}),
            select: vi.fn(async () => {}),
            backToLatest: vi.fn(async () => {}),
            dismissDirtyPrompt: vi.fn(),
            discardAndContinue: vi.fn(async () => {}),
            saveAndContinue: vi.fn(),
        },
    }),
}));

vi.mock("@/app/ui/hooks/save/useExternalCompare.ts", () => ({
    useExternalCompare: () => ({
        state: {
            mode: "unsaved",
            diffsByChapter: null,
            isCalculating: false,
            pendingRemotePartialReconciliation: null,
            sourceKind: "existingProject",
            sourceProjectId: "",
            sourceVersionHash: "",
            warnings: [],
            hasComputed: false,
            availableProjects: [],
            versionOptions: [],
        },
        actions: {
            reset: vi.fn(),
            rerunForChapters: vi.fn(async () => {}),
            setMode: vi.fn(),
            setSourceKind: vi.fn(),
            setSourceProjectId: vi.fn(),
            setSourceVersionHash: vi.fn(),
            refresh: vi.fn(),
            loadFromProject: vi.fn(async () => {}),
            loadFromZip: vi.fn(async () => {}),
            loadFromDirectory: vi.fn(async () => {}),
            loadFromVersion: vi.fn(async () => {}),
            loadFromRemoteLatest: vi.fn(async () => ({ requiresReview: true })),
            openRemoteLatestReview: vi.fn(async () => {}),
            applyIncomingHunk: vi.fn(),
            applyIncomingChapter: vi.fn(),
            applyIncomingAll: vi.fn(),
        },
    }),
}));

vi.mock("@/app/ui/hooks/save/useDiffModalState.ts", () => ({
    useDiffModalState: () => ({
        state: {
            isOpen: false,
            isCalculating: false,
            diffs: [],
            diffsByChapter: {},
        },
        actions: {
            open: diffOpenMock,
            close: vi.fn(),
            refreshChapter: vi.fn(),
            refreshChapters: vi.fn(async () => {}),
            resetUnsavedDiffs: vi.fn(),
            setUnsavedDiffsByChapter: vi.fn(),
        },
    }),
}));

vi.mock("@/app/ui/hooks/save/useSaveAndRevert.ts", () => ({
    useSaveAndRevert: () => ({
        state: {
            hasUnsavedChanges: true,
        },
        actions: {
            saveProjectToDisk: saveProjectToDiskMock,
            discardAllChanges: vi.fn(async () => {}),
            revertDiff: vi.fn(async () => {}),
            revertChapter: vi.fn(async () => {}),
            revertAll: vi.fn(async () => {}),
        },
    }),
}));

const STABLE_EMPTY_WORKING_FILES: never[] = [];
const STABLE_WORKING_FILES_STORE = {
    read: () => STABLE_EMPTY_WORKING_FILES,
    readChapter: () => undefined,
    commit: () => {},
    reset: () => {},
    subscribe: () => () => {},
    getSnapshot: () => STABLE_EMPTY_WORKING_FILES,
} as never;

function HookHarness(props: {
    autoAcceptOwnWorkOnSave: boolean;
    onState: (value: ReturnType<typeof useSave>) => void;
}) {
    const value = useSave({
        mutWorkingFilesRef: [],
        workingFilesStore: STABLE_WORKING_FILES_STORE,
        editorRef: { current: null },
        pickedFile: null,
        pickedChapter: null,
        loadedProject: {
            projectPath: "/userData/projects/demo",
        } as never,
        history: {
            registerPostUndoRedoAction: vi.fn(),
        } as never,
        projectsService: {} as never,
        fileSystem: {} as never,
        storageRoots: {} as never,
        gitProvider: {} as never,
        editorMode: "regular",
        allProjects: [],
        currentProjectRoute: "demo",
    });

    props.onState(value);
    return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useSave> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
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

function render(autoAcceptOwnWorkOnSave: boolean) {
    useRouterMock.mockReturnValue({
        options: {
            context: {
                usfmOnionService: {},
                settingsManager: {
                    get: vi.fn((key: string) => {
                        if (key === "autoAcceptOwnWorkOnSave") {
                            return autoAcceptOwnWorkOnSave;
                        }
                        if (key === "autoAcceptIncomingWork") {
                            return false;
                        }
                        return "regular";
                    }),
                },
                authSessionProvider: {},
            },
        },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root?.render(
            <HookHarness
                autoAcceptOwnWorkOnSave={autoAcceptOwnWorkOnSave}
                onState={(value) => {
                    latestState = value;
                }}
            />,
        );
    });
}

describe("useSave", () => {
    it("opens review by default when auto-accept-own-work is disabled", async () => {
        render(false);

        await act(async () => {
            await latestState?.diff.open();
        });

        expect(diffOpenMock).toHaveBeenCalled();
        expect(saveProjectToDiskMock).not.toHaveBeenCalled();
    });

    it("saves directly when auto-accept-own-work is enabled", async () => {
        render(true);

        await act(async () => {
            await latestState?.diff.open();
        });

        expect(saveProjectToDiskMock).toHaveBeenCalled();
        expect(diffOpenMock).not.toHaveBeenCalled();
    });
});
