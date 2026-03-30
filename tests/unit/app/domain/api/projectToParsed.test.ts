import { beforeEach, describe, expect, test, vi } from "vitest";
import { projectParamToParsedScripture } from "@/app/domain/api/projectToParsed.tsx";
import { scriptureProjectToParsedFiles } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import type { LibraryService } from "@/app/library/LibraryService.ts";
import type { UsfmScriptureItem } from "@/core/library/LibraryItem.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { ensureProjectGitReady } from "@/core/persistence/ensureProjectGitReady.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

vi.mock("@/app/domain/api/scriptureProjectToParsedFiles.ts", () => ({
    scriptureProjectToParsedFiles: vi.fn(async () => ({
        parsedFiles: [],
        initialLintErrorsByBook: {},
    })),
}));

vi.mock("@/core/persistence/ensureProjectGitReady.ts", () => ({
    ensureProjectGitReady: vi.fn(async () => {}),
}));

const mockFileSystem: FileSystem = {
    readText: vi.fn(),
    readBytes: vi.fn(),
    writeText: vi.fn(),
    writeBytes: vi.fn(),
    exists: vi.fn(),
    list: vi.fn(),
    mkdir: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    createTempFile: vi.fn(),
};

const mockGitProvider: GitProvider = {
    ensureRepo: vi.fn(),
    getBranchInfo: vi.fn(),
    checkoutPreferredBranch: vi.fn(),
    listHistory: vi.fn(),
    readProjectSnapshotAtCommit: vi.fn(),
    restoreTrackedFilesFromCommit: vi.fn(),
    commitAll: vi.fn(),
    inspectRemoteHeads: vi.fn(),
    fetchRemoteHeads: vi.fn(),
    pushCurrentBranch: vi.fn(),
    planReplayOntoRemote: vi.fn(),
    isRepoHealthy: vi.fn(),
};

const mockUsfmOnionService = {
    supportsPathIo: true,
} as IUsfmOnionService;

const mockProject: Project = {
    folderName: "ref",
    displayName: "Reference",
    projectPath: "/projects/ref",
    projectId: "ref",
    projectType: "scripture-burrito",
    language: {
        code: "eng",
        name: "English",
        direction: "ltr",
    },
    books: [],
    listBooks: vi.fn(async () => []),
    getBook: vi.fn(),
    saveBook: vi.fn(),
    addBook: vi.fn(),
    listVersions: vi.fn(async () => []),
    restoreVersion: vi.fn(),
    stageAndCommit: vi.fn(),
};

const mockEditableItem: UsfmScriptureItem = {
    ...mockProject,
    id: "ref",
    managedPath: "/projects/ref",
    containerFormat: "scripture-burrito",
    capabilities: { editableWith: "usfmScripture" },
    type: "usfmScripture",
    readWorkspace: vi.fn(async () => ({ bookCode: "MAT", usfmContents: "" })),
    readBook: vi.fn(async () => null),
};

describe("projectParamToParsedFiles", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("uses the read-only opener and skips git readiness for reference loading", async () => {
        const openProjectReadOnly = vi.fn(async () => mockProject);

        const result = await projectParamToParsedScripture({
            openProjectReadOnly,
            project: "ref",
            fileSystem: mockFileSystem,
            gitProvider: mockGitProvider,
            editorMode: "regular",
            usfmOnionService: mockUsfmOnionService,
        });

        expect(openProjectReadOnly).toHaveBeenCalledWith("ref");
        expect(ensureProjectGitReady).not.toHaveBeenCalled();
        expect(scriptureProjectToParsedFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                loadedProject: mockProject,
            }),
        );
        expect(result).toEqual({
            parsedFiles: [],
            initialLintErrorsByBook: {},
            loadedProject: mockProject,
            rejectionReason: null,
        });
    });

    test("keeps editable loading on the git-ready path by default", async () => {
        const libraryService = {
            openItem: vi.fn(async () => mockEditableItem),
        } as Pick<LibraryService, "openItem"> as LibraryService;

        await projectParamToParsedScripture({
            libraryService,
            project: "ref",
            fileSystem: mockFileSystem,
            gitProvider: mockGitProvider,
            editorMode: "regular",
            usfmOnionService: mockUsfmOnionService,
        });

        expect(libraryService.openItem).toHaveBeenCalledWith("ref");
        expect(ensureProjectGitReady).toHaveBeenCalledWith({
            fileSystem: mockFileSystem,
            gitProvider: mockGitProvider,
            loadedProject: mockEditableItem,
        });
    });

    test("returns an explicit rejection for non-editable resources on the main workspace path", async () => {
        const libraryService = {
            openItem: vi.fn(async () => null),
        } as Pick<LibraryService, "openItem"> as LibraryService;

        const result = await projectParamToParsedScripture({
            libraryService,
            project: "ref",
            fileSystem: mockFileSystem,
            gitProvider: mockGitProvider,
            editorMode: "regular",
            usfmOnionService: mockUsfmOnionService,
        });

        expect(libraryService.openItem).toHaveBeenCalledWith("ref");
        expect(scriptureProjectToParsedFiles).not.toHaveBeenCalled();
        expect(ensureProjectGitReady).not.toHaveBeenCalled();
        expect(result).toEqual({
            parsedFiles: [],
            initialLintErrorsByBook: {},
            loadedProject: null,
            rejectionReason: "not-found",
        });
    });
});
