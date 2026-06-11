/** biome-ignore-all lint/suspicious/noExplicitAny: test mocks */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportProjectResult } from "@/core/library/ImportService.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

const mocks = vi.hoisted(() => ({
    openMock: vi.fn(),
    invokeMock: vi.fn(),
    listenMock: vi.fn(),
    unlistenMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
    open: mocks.openMock,
}));

vi.mock("@tauri-apps/api/core", () => ({
    invoke: mocks.invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
    listen: mocks.listenMock,
}));

import { TauriImportService } from "@/tauri/persistence/TauriImportService.ts";

describe("TauriImportService", () => {
    const roots: StorageRoots = {
        appDataRoot: "/userData/app-data",
        projectsRoot: "/userData/projects",
        tempRoot: "/userData/temp",
        cacheRoot: "/userData/cache",
        logsRoot: "/userData/logs",
        databaseRoot: "/userData/database",
    };
    const importedResult: ImportProjectResult = {
        project: {
            projectPath: "/userData/projects/en_tn",
            projectId: "en_tn",
            displayName: "English TN",
            languageCode: "en",
            languageName: "English",
            projectType: "resource-container",
            folderName: "en_tn",
        },
        gitReady: false,
        isEditableProject: false,
    };
    let projectsService: ProjectsService;
    let fileSystem: FileSystem;

    beforeEach(() => {
        mocks.openMock.mockReset();
        mocks.invokeMock.mockReset();
        mocks.listenMock.mockReset();
        mocks.unlistenMock.mockReset();
        mocks.listenMock.mockResolvedValue(mocks.unlistenMock);
        projectsService = {
            listProjects: vi.fn(),
            listReferenceResources: vi.fn(),
            openEditableProject: vi.fn(),
            loadMetadataEditor: vi.fn(),
            saveMetadataEditor: vi.fn(),
            openProject: vi.fn(),
            openProjectReadOnly: vi.fn(),
            openResource: vi.fn(),
            importProject: vi.fn().mockResolvedValue(importedResult),
            listWritableRemoteRepos: vi.fn(),
            listOwnedRemoteRepos: vi.fn(),
            getRemoteRepo: vi.fn(),
            forkRemoteRepo: vi.fn(),
            createRemoteForProject: vi.fn(),
            attachProjectToRemote: vi.fn(),
            cloneWritableRemoteProject: vi.fn(),
            readDeclaredSources: vi.fn(),
            readProjectOrigin: vi.fn(),
            deleteProject: vi.fn(),
            renameDisplayName: vi.fn(),
            reconcileIndex: vi.fn(),
        };
        fileSystem = {
            readText: vi.fn(),
            readBytes: vi.fn(),
            writeText: vi.fn(),
            atomicWriteText: vi.fn(),
            writeBytes: vi.fn(),
            exists: vi.fn(),
            list: vi.fn(),
            mkdir: vi.fn(),
            remove: vi.fn(),
            move: vi.fn(),
            createTempFile: vi.fn(),
        };
    });

    it("maps directory selection to a native folder path", async () => {
        mocks.openMock.mockResolvedValue("/Users/test/Desktop/en_tn");
        const service = new TauriImportService(
            roots,
            projectsService,
            fileSystem,
            "WA-Tool-Desktop",
        );

        await expect(
            service.pickDirectory({ title: "Select folder" }),
        ).resolves.toBe("/Users/test/Desktop/en_tn");
        expect(mocks.openMock).toHaveBeenCalledWith({
            directory: true,
            multiple: false,
            title: "Select folder",
        });
    });

    it("maps zip selection to a native file path and normalizes cancellation", async () => {
        mocks.openMock
            .mockResolvedValueOnce(["/Users/test/Desktop/en_tn.zip"])
            .mockResolvedValueOnce(null);
        const service = new TauriImportService(
            roots,
            projectsService,
            fileSystem,
            "WA-Tool-Desktop",
        );

        await expect(service.pickZip({ title: "Select ZIP file" })).resolves.toBe(
            "/Users/test/Desktop/en_tn.zip",
        );
        await expect(service.pickZip()).resolves.toBeNull();
        expect(mocks.openMock).toHaveBeenNthCalledWith(1, {
            directory: false,
            multiple: false,
            title: "Select ZIP file",
            filters: [{ name: "Zip", extensions: ["zip"] }],
        });
        expect(mocks.openMock).toHaveBeenNthCalledWith(2, {
            directory: false,
            multiple: false,
            title: undefined,
            filters: [{ name: "Zip", extensions: ["zip"] }],
        });
    });

    it("normalizes windows-native desktop selections and imported paths before shared code sees them", async () => {
        mocks.openMock.mockResolvedValueOnce("C:\\Users\\test\\Desktop\\en_tn");
        mocks.invokeMock
            .mockResolvedValueOnce(
                "C:\\Users\\test\\AppData\\Roaming\\org.bibletranslationtools.bttrefinerproto\\projects\\en_tn",
            )
            .mockResolvedValueOnce(undefined);

        const service = new TauriImportService(
            roots,
            projectsService,
            fileSystem,
            "WA-Tool-Desktop",
        );

        await expect(service.pickDirectory()).resolves.toBe(
            "C:/Users/test/Desktop/en_tn",
        );

        await expect(
            service.importFolder({
                kind: "path",
                path: "C:/Users/test/Desktop/en_tn",
            }),
        ).resolves.toEqual(importedResult);

        expect(mocks.invokeMock).toHaveBeenNthCalledWith(
            1,
            "import_copy_directory_to_managed_storage",
            expect.objectContaining({
                sourcePath: "C:/Users/test/Desktop/en_tn",
            }),
        );
        expect(mocks.invokeMock).toHaveBeenNthCalledWith(
            2,
            "finalize_imported_resource",
            expect.objectContaining({
                resourcePath:
                    "C:/Users/test/AppData/Roaming/org.bibletranslationtools.bttrefinerproto/projects/en_tn",
            }),
        );
        expect(projectsService.importProject).toHaveBeenCalledWith(
            {
                type: "fromPreparedDir",
                directoryPath:
                    "C:/Users/test/AppData/Roaming/org.bibletranslationtools.bttrefinerproto/projects/en_tn",
            },
            undefined,
        );
    });

    it("copies a native directory through Rust progress events and then imports from prepared storage", async () => {
        let progressListener:
            | ((event: { payload: { phase: string; message: string; current?: number; total?: number } }) => Promise<void>)
            | undefined;
        mocks.listenMock.mockImplementation(async (_eventName, handler) => {
            progressListener = handler;
            return mocks.unlistenMock;
        });
        mocks.invokeMock.mockImplementation(async (command, args) => {
            if (command === "finalize_imported_resource") {
                expect(args.resourcePath).toBe("/userData/projects/en_tn");
                return undefined;
            }
            await progressListener?.({
                payload: {
                    phase: "copy-content",
                    message: "Copying source directory into app storage (0/2)...",
                    current: 0,
                    total: 2,
                },
            });
            await progressListener?.({
                payload: {
                    phase: "copy-content",
                    message: "Copying source directory into app storage (2/2)...",
                    current: 2,
                    total: 2,
                },
            });
            expect(args.sourcePath).toBe("/Users/test/Desktop/en_tn");
            expect(args.projectsRoot).toBe("/userData/projects");
            expect(args.progressEvent).toMatch(
                /^native-directory-import-progress:/,
            );
            return "/userData/projects/en_tn";
        });

        const service = new TauriImportService(
            roots,
            projectsService,
            fileSystem,
            "WA-Tool-Desktop",
        );
        const onProgress = vi.fn();

        await expect(
            service.importFolder({
                kind: "path",
                path: "/Users/test/Desktop/en_tn",
            }, {
                onProgress,
            }),
        ).resolves.toEqual(importedResult);

        expect(mocks.listenMock).toHaveBeenCalledTimes(1);
        expect(mocks.invokeMock).toHaveBeenCalledWith(
            "import_copy_directory_to_managed_storage",
            expect.objectContaining({
                sourcePath: "/Users/test/Desktop/en_tn",
                projectsRoot: "/userData/projects",
            }),
        );
        expect(mocks.invokeMock).toHaveBeenNthCalledWith(
            2,
            "finalize_imported_resource",
            expect.objectContaining({
                resourcePath: "/userData/projects/en_tn",
            }),
        );
        expect(projectsService.importProject).toHaveBeenCalledWith(
            {
                type: "fromPreparedDir",
                directoryPath: "/userData/projects/en_tn",
            },
            { onProgress },
        );
        expect(onProgress).toHaveBeenNthCalledWith(1, {
            phase: "copy-content",
            message: "Copying source directory into app storage (0/2)...",
            current: 0,
            total: 2,
        });
        expect(onProgress).toHaveBeenNthCalledWith(2, {
            phase: "copy-content",
            message: "Copying source directory into app storage (2/2)...",
            current: 2,
            total: 2,
        });
        expect(mocks.unlistenMock).toHaveBeenCalledTimes(1);
        expect(fileSystem.remove).not.toHaveBeenCalled();
    });

    it("cleans up the copied directory if later import indexing fails", async () => {
        mocks.invokeMock.mockResolvedValue("/userData/projects/en_tn");
        vi.mocked(projectsService.importProject).mockRejectedValueOnce(
            new Error("index failed"),
        );
        const service = new TauriImportService(
            roots,
            projectsService,
            fileSystem,
            "WA-Tool-Desktop",
        );

        await expect(
            service.importFolder({
                kind: "path",
                path: "/Users/test/Desktop/en_tn",
            }),
        ).rejects.toThrow("index failed");

        expect(fileSystem.remove).toHaveBeenCalledWith(
            "/userData/projects/en_tn",
            { recursive: true },
        );
        expect(mocks.unlistenMock).toHaveBeenCalledTimes(1);
    });

    it("extracts a native zip through Rust progress events and then imports from prepared storage", async () => {
        let progressListener:
            | ((event: { payload: { phase: string; message: string; current?: number; total?: number } }) => Promise<void>)
            | undefined;
        mocks.listenMock.mockImplementation(async (_eventName, handler) => {
            progressListener = handler;
            return mocks.unlistenMock;
        });
        mocks.invokeMock.mockImplementation(async (command, args) => {
            if (command === "finalize_imported_resource") {
                expect(args.resourcePath).toBe("/userData/projects/en_tn");
                return undefined;
            }
            await progressListener?.({
                payload: {
                    phase: "extract-archive",
                    message: "Extracting archive contents (0/2)...",
                    current: 0,
                    total: 2,
                },
            });
            await progressListener?.({
                payload: {
                    phase: "copy-content",
                    message: "Copying extracted archive into app storage (2/2)...",
                    current: 2,
                    total: 2,
                },
            });
            expect(args.archivePath).toBe("/Users/test/Desktop/en_tn.zip");
            expect(args.projectsRoot).toBe("/userData/projects");
            expect(args.tempRoot).toBe("/userData/temp");
            expect(args.progressEvent).toMatch(
                /^native-directory-import-progress:/,
            );
            return "/userData/projects/en_tn";
        });

        const service = new TauriImportService(
            roots,
            projectsService,
            fileSystem,
            "WA-Tool-Desktop",
        );
        const onProgress = vi.fn();

        await expect(
            service.importZip({
                kind: "path",
                path: "/Users/test/Desktop/en_tn.zip",
            }, {
                onProgress,
            }),
        ).resolves.toEqual(importedResult);

        expect(onProgress).toHaveBeenNthCalledWith(1, {
            phase: "read-source",
            message: "Reading staged archive en_tn.zip...",
        });
        expect(onProgress).toHaveBeenNthCalledWith(2, {
            phase: "extract-archive",
            message: "Extracting archive contents (0/2)...",
            current: 0,
            total: 2,
        });
        expect(onProgress).toHaveBeenNthCalledWith(3, {
            phase: "copy-content",
            message: "Copying extracted archive into app storage (2/2)...",
            current: 2,
            total: 2,
        });
        expect(mocks.invokeMock).toHaveBeenCalledWith(
            "import_extract_zip_to_managed_storage",
            expect.objectContaining({
                archivePath: "/Users/test/Desktop/en_tn.zip",
                projectsRoot: "/userData/projects",
                tempRoot: "/userData/temp",
            }),
        );
        expect(mocks.invokeMock).toHaveBeenNthCalledWith(
            2,
            "finalize_imported_resource",
            expect.objectContaining({
                resourcePath: "/userData/projects/en_tn",
            }),
        );
        expect(projectsService.importProject).toHaveBeenCalledWith(
            {
                type: "fromPreparedDir",
                directoryPath: "/userData/projects/en_tn",
            },
            { onProgress },
        );
        expect(mocks.unlistenMock).toHaveBeenCalledTimes(1);
    });

    it("cleans up the extracted directory if later zip import indexing fails", async () => {
        mocks.invokeMock.mockResolvedValue("/userData/projects/en_tn");
        vi.mocked(projectsService.importProject).mockRejectedValueOnce(
            new Error("index failed"),
        );
        const service = new TauriImportService(roots, projectsService, fileSystem);

        await expect(
            service.importZip({
                kind: "path",
                path: "/Users/test/Desktop/en_tn.zip",
            }),
        ).rejects.toThrow("index failed");

        expect(fileSystem.remove).toHaveBeenCalledWith(
            "/userData/projects/en_tn",
            { recursive: true },
        );
        expect(mocks.unlistenMock).toHaveBeenCalledTimes(1);
    });

    it("downloads a remote archive through the native Rust path and then imports from prepared storage", async () => {
        let progressListener:
            | ((event: { payload: { phase: string; message: string; current?: number; total?: number } }) => Promise<void>)
            | undefined;
        mocks.listenMock.mockImplementation(async (_eventName, handler) => {
            progressListener = handler;
            return mocks.unlistenMock;
        });
        mocks.invokeMock.mockImplementation(async (command, args) => {
            if (command === "finalize_imported_resource") {
                expect(args.resourcePath).toBe("/userData/projects/en_tn");
                return undefined;
            }
            await progressListener?.({
                payload: {
                    phase: "read-source",
                    message: "Downloading remote archive https://example.org/en_tn.zip...",
                    current: 0,
                    total: 512,
                },
            });
            await progressListener?.({
                payload: {
                    phase: "extract-archive",
                    message: "Extracting archive contents (0/2)...",
                    current: 0,
                    total: 2,
                },
            });
            expect(args.url).toBe("https://example.org/en_tn.zip");
            expect(args.projectsRoot).toBe("/userData/projects");
            expect(args.tempRoot).toBe("/userData/temp");
            expect(args.progressEvent).toMatch(
                /^native-directory-import-progress:/,
            );
            return "/userData/projects/en_tn";
        });

        const service = new TauriImportService(
            roots,
            projectsService,
            fileSystem,
            "WA-Tool-Desktop",
        );
        const onProgress = vi.fn();

        await expect(
            service.importRemoteZip(
                { type: "fromGitRepo", url: "https://example.org/en_tn.zip" },
                {
                    onProgress,
                },
            ),
        ).resolves.toEqual(importedResult);

        expect(mocks.invokeMock).toHaveBeenCalledWith(
            "import_download_remote_archive_to_managed_storage",
            expect.objectContaining({
                url: "https://example.org/en_tn.zip",
                projectsRoot: "/userData/projects",
                tempRoot: "/userData/temp",
                requestedWithHeaderValue: "WA-Tool-Desktop",
            }),
        );
        expect(mocks.invokeMock).toHaveBeenNthCalledWith(
            2,
            "finalize_imported_resource",
            expect.objectContaining({
                resourcePath: "/userData/projects/en_tn",
            }),
        );
        expect(projectsService.importProject).toHaveBeenCalledWith(
            {
                type: "fromPreparedDir",
                directoryPath: "/userData/projects/en_tn",
            },
            { onProgress },
        );
        expect(onProgress).toHaveBeenNthCalledWith(1, {
            phase: "read-source",
            message: "Downloading remote archive https://example.org/en_tn.zip...",
            current: 0,
            total: 512,
        });
        expect(onProgress).toHaveBeenNthCalledWith(2, {
            phase: "extract-archive",
            message: "Extracting archive contents (0/2)...",
            current: 0,
            total: 2,
        });
        expect(mocks.unlistenMock).toHaveBeenCalledTimes(1);
    });

    it("cleans up the extracted remote directory if later import indexing fails", async () => {
        mocks.invokeMock.mockResolvedValue("/userData/projects/en_tn");
        vi.mocked(projectsService.importProject).mockRejectedValueOnce(
            new Error("index failed"),
        );
        const service = new TauriImportService(roots, projectsService, fileSystem);

        await expect(
            service.importRemoteZip({
                type: "fromGitRepo",
                url: "https://example.org/en_tn.zip",
            }),
        ).rejects.toThrow("index failed");

        expect(fileSystem.remove).toHaveBeenCalledWith(
            "/userData/projects/en_tn",
            { recursive: true },
        );
        expect(mocks.unlistenMock).toHaveBeenCalledTimes(1);
    });
});
