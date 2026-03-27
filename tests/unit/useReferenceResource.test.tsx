// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryService } from "@/app/library/LibraryService.ts";
import type {
    PackedTranslationNotesBook,
    TranslationNotesItem,
    UsfmScriptureItem,
} from "@/core/library/LibraryItem.ts";
import { createReferenceDocumentId } from "@/core/library/ReferenceDocuments.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";
import {
    type ReferenceItemHook,
    useReferenceItem,
} from "@/app/ui/hooks/useReferenceItem.tsx";

const projectParamToParsedScriptureMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
    useRouter: () => ({
        options: {
            context: {
                settingsManager: {
                    get: vi.fn(() => "regular"),
                },
                usfmOnionService: {},
            },
        },
    }),
}));

vi.mock("@/app/domain/api/projectToParsed.tsx", () => ({
    projectParamToParsedScripture: (...args: unknown[]) =>
        projectParamToParsedScriptureMock(...args),
}));

function makeResource(
    overrides: Partial<LoadedReferenceItem> = {},
): LoadedReferenceItem {
    return {
        folderName: "en_ulb",
        displayName: "English ULB",
        managedPath: "/userData/projects/en_ulb",
        projectId: "en_ulb",
        projectType: "resource-container",
        descriptor: {
            id: "en_ulb",
            displayName: "English ULB",
            type: "usfmScripture",
            containerFormat: "resource-container",
            language: {
                code: "en",
                name: "English",
                direction: "ltr",
            },
            readOnly: false,
        },
        listDocuments: async () => [
            {
                id: createReferenceDocumentId("41-MAT.usfm"),
                name: "Matthew",
                browsePath: ["41-MAT"],
            },
        ],
        readDocument: async () => ({
            id: createReferenceDocumentId("41-MAT.usfm"),
            name: "Matthew",
            browsePath: ["41-MAT"],
            contents: "\\id MAT",
        }),
        ...overrides,
    };
}

function flushPromises() {
    return act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

let latestHookState: ReferenceItemHook | null = null;

function HookHarness(props: {
    projectsService: ProjectsService;
    libraryService: { openItem: LibraryService["openItem"] };
    onState: (state: ReferenceItemHook) => void;
}) {
    const state = useReferenceItem({
        projectsService: props.projectsService,
        libraryService: props.libraryService as LibraryService,
        fileSystem: {
            exists: vi.fn(),
        } as never,
        pickedFileIdentifier: "MAT",
        pickedChapterNumber: 1,
        gitProvider: {} as never,
    });

    useEffect(() => {
        props.onState(state);
    }, [props, state]);

    return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let queryClient: QueryClient | null = null;

beforeAll(() => {
    (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    projectParamToParsedScriptureMock.mockReset();
    latestHookState = null;
    queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
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
    queryClient?.clear();
    root = null;
    container = null;
    queryClient = null;
    latestHookState = null;
});

function renderHookHarness(
    projectsService: ProjectsService,
    libraryService: { openItem: LibraryService["openItem"] },
) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
        root?.render(
            <QueryClientProvider client={queryClient!}>
                <HookHarness
                    projectsService={projectsService}
                    libraryService={libraryService}
                    onState={(state) => {
                        latestHookState = state;
                    }}
                />
            </QueryClientProvider>,
        );
    });
}

describe("useReferenceItem", () => {
    it("switches to a scripture reference resource and keeps scripture navigation behavior", async () => {
        const scriptureResource = makeResource();
        const libraryService = {
            openItem: vi.fn<LibraryService["openItem"]>(async () => ({
                ...scriptureResource,
                id: scriptureResource.projectId ?? "en_ulb",
                managedPath: scriptureResource.managedPath,
                containerFormat: "resource-container",
                language: scriptureResource.descriptor.language,
                capabilities: { editableWith: "usfmScripture" },
                type: "usfmScripture",
                books: [],
                folderName: scriptureResource.folderName,
                projectPath: scriptureResource.managedPath,
                displayName: scriptureResource.displayName,
                listBooks: async () => [],
                getBook: async () => ({
                    bookCode: "MAT",
                    title: "Matthew",
                    fileName: "41-MAT.usfm",
                    storageKey: "41-MAT.usfm",
                    path: "/userData/projects/en_ulb/41-MAT.usfm",
                    contents: "\\id MAT",
                }),
                saveBook: async () => {},
                addBook: async () => ({
                    bookCode: "MAT",
                    title: "Matthew",
                    fileName: "41-MAT.usfm",
                    storageKey: "41-MAT.usfm",
                    path: "/userData/projects/en_ulb/41-MAT.usfm",
                }),
                listVersions: async () => [],
                restoreVersion: async () => {},
                stageAndCommit: async () => ({ hash: "abc123" }),
                readWorkspace: async () => ({ bookCode: "MAT", usfmContents: "" }),
                readBook: async () => null,
            } as UsfmScriptureItem)),
        };
        const projectsService = {
            listReferenceResources: vi.fn(async () => [
                {
                    folderName: "en_ulb",
                    projectPath: "/userData/projects/en_ulb",
                    displayName: "English ULB",
                    projectId: "en_ulb",
                    languageCode: "en",
                    languageName: "English",
                    projectType: "resource-container",
                    type: "usfmScripture" as const,
                    containerFormat: "resource-container" as const,
                    isEditable: true,
                    hasRemoteSync: false,
                    libraryGroup: "scripture" as const,
                },
            ]),
            openResource: vi.fn(async () => scriptureResource),
            openProject: vi.fn(),
            openProjectReadOnly: vi.fn(),
        } as unknown as ProjectsService;
        projectParamToParsedScriptureMock.mockResolvedValue({
            parsedFiles: [
                {
                    bookCode: "MAT",
                    title: "Matthew",
                    chapters: [{ chapterNumber: 1 }],
                    prevBookId: undefined,
                    nextBookId: undefined,
                },
            ],
        });

        renderHookHarness(projectsService, libraryService);
        await flushPromises();

        await act(async () => {
            latestHookState?.setActiveReferenceResourcePath(
                "/userData/projects/en_ulb",
            );
        });
        await flushPromises();

        expect(latestHookState?.activeReferenceResourcePath).toBe(
            "/userData/projects/en_ulb",
        );
        expect(latestHookState?.supportsScriptureNavigation).toBe(true);
        expect(latestHookState?.referenceBookCode).toBe("MAT");
        expect(latestHookState?.referenceChapterNumber).toBe(1);
        expect(latestHookState?.parsedFiles).toHaveLength(1);
        expect(libraryService.openItem).toHaveBeenCalledWith(
            "/userData/projects/en_ulb",
        );
    });

    it("keeps the read-only scripture opener bound when loading a scripture reference resource", async () => {
        const scriptureResource = makeResource();
        const projectsService = {
            listReferenceResources: vi.fn(async () => [
                {
                    folderName: "en_ulb",
                    projectPath: "/userData/projects/en_ulb",
                    displayName: "English ULB",
                    projectId: "en_ulb",
                    languageCode: "en",
                    languageName: "English",
                    projectType: "resource-container",
                    type: "usfmScripture" as const,
                    containerFormat: "resource-container" as const,
                    isEditable: true,
                    hasRemoteSync: false,
                    libraryGroup: "scripture",
                },
            ]),
            openResource: vi.fn(async () => scriptureResource),
            openProject: vi.fn(),
            openProjectReadOnly: vi.fn(),
        } as unknown as ProjectsService;
        const libraryService = {
            openItem: vi.fn(async () => ({
                ...scriptureResource,
                id: scriptureResource.projectId ?? "en_ulb",
                managedPath: scriptureResource.managedPath,
                containerFormat: "resource-container" as const,
                language: scriptureResource.descriptor.language,
                capabilities: { editableWith: "usfmScripture" as const },
                type: "usfmScripture" as const,
                books: [],
                folderName: scriptureResource.folderName,
                projectPath: scriptureResource.managedPath,
                listBooks: async () => [],
                getBook: async () => ({
                    bookCode: "MAT",
                    title: "Matthew",
                    fileName: "41-MAT.usfm",
                    storageKey: "41-MAT.usfm",
                    path: "/userData/projects/en_ulb/41-MAT.usfm",
                    contents: "\\id MAT",
                }),
                saveBook: async () => {},
                addBook: async () => ({
                    bookCode: "MAT",
                    title: "Matthew",
                    fileName: "41-MAT.usfm",
                    storageKey: "41-MAT.usfm",
                    path: "/userData/projects/en_ulb/41-MAT.usfm",
                }),
                listVersions: async () => [],
                restoreVersion: async () => {},
                stageAndCommit: async () => ({ hash: "abc123" }),
                readWorkspace: async () => ({ bookCode: "MAT", usfmContents: "" }),
                readBook: async () => null,
            })),
        };
        projectParamToParsedScriptureMock.mockResolvedValue({
            parsedFiles: [
                {
                    bookCode: "MAT",
                    title: "Matthew",
                    chapters: [{ chapterNumber: 1 }],
                    prevBookId: undefined,
                    nextBookId: undefined,
                },
            ],
        });

        renderHookHarness(projectsService, libraryService);
        await flushPromises();

        await act(async () => {
            latestHookState?.setActiveReferenceResourcePath(
                "/userData/projects/en_ulb",
            );
        });
        await flushPromises();

        expect(latestHookState?.supportsScriptureNavigation).toBe(true);
        expect(latestHookState?.parsedFiles).toHaveLength(1);
        expect(libraryService.openItem).toHaveBeenCalledWith(
            "/userData/projects/en_ulb",
        );
    });

    it("does not force non-scripture resources into scripture navigation behavior", async () => {
        const projectsService = {
            listReferenceResources: vi.fn(async () => []),
            openResource: vi.fn(async () => null),
            openProject: vi.fn(),
            openProjectReadOnly: vi.fn(),
        } as unknown as ProjectsService;
        const libraryService = {
            openItem: vi.fn<LibraryService["openItem"]>(async () => null),
        };

        renderHookHarness(projectsService, libraryService);
        await flushPromises();

        await act(async () => {
            latestHookState?.setActiveReferenceResourcePath(
                "/userData/projects/en_tw",
            );
        });
        await flushPromises();

        expect(latestHookState?.supportsScriptureNavigation).toBe(false);
        expect(latestHookState?.isReferenceNavSynced).toBe(false);
        expect(latestHookState?.parsedFiles).toEqual([]);
        expect(latestHookState?.referenceChapter).toBeUndefined();
        expect(latestHookState?.goToReferenceInReference("MAT 1")).toBe(false);
        expect(projectParamToParsedScriptureMock).not.toHaveBeenCalled();
    });

    it("loads translation notes for the synced chapter anchor without forcing scripture parsing", async () => {
        const packedBook: PackedTranslationNotesBook = {
            bookCode: "MAT",
            chapters: [
                {
                    chapterNumber: 1,
                    verses: [
                        {
                            verseNumber: 1,
                            rawMarkdown: "# A note\n\nBody text",
                        },
                    ],
                },
            ],
        };
        const projectsService = {
            listReferenceResources: vi.fn(async () => []),
            openResource: vi.fn(),
            openProject: vi.fn(),
            openProjectReadOnly: vi.fn(),
        } as unknown as ProjectsService;
        const libraryService = {
            openItem: vi.fn<LibraryService["openItem"]>(async () => ({
                id: "en_tn_condensed",
                displayName: "English Translation Notes Condensed",
                managedPath: "/userData/projects/en_tn_condensed",
                containerFormat: "resource-container" as const,
                language: { code: "en", name: "English", direction: "ltr" as const },
                capabilities: {},
                type: "translationNotes" as const,
                listBookCodes: async () => ["MAT"],
                readBook: async () => packedBook,
                readChapter: async () => ({ "1": "# A note\n\nBody text" }),
            } as TranslationNotesItem)),
        };

        renderHookHarness(projectsService, libraryService);
        await flushPromises();

        await act(async () => {
            latestHookState?.setActiveReferenceResourcePath(
                "/userData/projects/en_tn_condensed",
            );
        });
        await flushPromises();

        expect(latestHookState?.supportsReferenceAnchors).toBe(true);
        expect(latestHookState?.supportsScriptureNavigation).toBe(false);
        expect(latestHookState?.isReferenceNavSynced).toBe(true);
        expect(projectParamToParsedScriptureMock).not.toHaveBeenCalled();
        expect(latestHookState?.translationNotesQuery.data).toEqual([
            {
                documentId: "MAT:1:1",
                bookCode: "MAT",
                chapterNumber: 1,
                verseNumber: 1,
                rawMarkdown: "# A note\n\nBody text",
            },
        ]);
    });
});
