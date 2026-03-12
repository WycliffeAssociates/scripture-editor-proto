import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    handleDownload,
    handleOpenDirectory,
    handleOpenFile,
    processFile,
} from "@/app/domain/api/import.tsx";

const { indexProjectMock, ensureProjectGitReadyMock } = vi.hoisted(() => ({
    indexProjectMock: vi.fn(),
    ensureProjectGitReadyMock: vi.fn(),
}));

vi.mock("@/app/domain/project/ProjectIndexer.ts", () => ({
    ProjectIndexer: class {
        indexProject = indexProjectMock;
    },
}));

vi.mock("@/app/domain/git/ensureProjectGitReady.ts", () => ({
    ensureProjectGitReady: ensureProjectGitReadyMock,
}));

describe("import api return values", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ensureProjectGitReadyMock.mockResolvedValue(undefined);
    });

    it("handleDownload returns imported path only after git readiness", async () => {
        const md5Service = {} as never;
        const importer = {
            import: vi.fn().mockResolvedValue("/userData/projects/en_ulb"),
        };
        const invalidateRouterAndReload = vi.fn();
        const loadedProject = {
            id: "en_ulb",
            projectDir: { path: "/userData/projects/en_ulb" },
        };
        const projectRepository = {
            loadProject: vi.fn().mockResolvedValue(loadedProject),
        };
        const gitProvider = {
            isRepoHealthy: vi.fn().mockResolvedValue(true),
        };

        const result = await handleDownload(
            {
                importer: importer as never,
                projectRepository: projectRepository as never,
                md5Service,
                gitProvider: gitProvider as never,
                invalidateRouterAndReload,
            },
            "https://example.org/repo.zip",
        );

        expect(result).toBe("/userData/projects/en_ulb");
        expect(indexProjectMock).toHaveBeenCalledWith(
            "/userData/projects/en_ulb",
        );
        expect(projectRepository.loadProject).toHaveBeenCalledWith(
            "en_ulb",
            md5Service,
        );
        expect(ensureProjectGitReadyMock).toHaveBeenCalledWith({
            gitProvider,
            loadedProject,
        });
        expect(invalidateRouterAndReload).toHaveBeenCalledTimes(1);
    });

    it("handleDownload throws when import fails", async () => {
        const importer = {
            import: vi
                .fn()
                .mockRejectedValue(
                    new Error("Download failed with status: 404 Not Found"),
                ),
        };

        await expect(
            handleDownload(
                {
                    importer: importer as never,
                    projectRepository: {} as never,
                    md5Service: {} as never,
                    gitProvider: {} as never,
                    invalidateRouterAndReload: vi.fn(),
                },
                "https://example.org/repo.zip",
            ),
        ).rejects.toThrow("Download failed with status: 404 Not Found");
    });

    it("suppresses disposal-only finalization noise when project is already loadable and git is healthy", async () => {
        const md5Service = {} as never;
        const importer = {
            import: vi.fn().mockResolvedValue("/userData/projects/ilo_udb"),
        };
        const invalidateRouterAndReload = vi.fn(() => {
            throw new Error("An error was suppressed during disposal.");
        });
        const loadedProject = {
            id: "ilo_udb",
            projectDir: { path: "/userData/projects/ilo_udb" },
        };
        const projectRepository = {
            loadProject: vi.fn().mockResolvedValue(loadedProject),
        };
        const gitProvider = {
            isRepoHealthy: vi.fn().mockResolvedValue(true),
        };

        const result = await handleDownload(
            {
                importer: importer as never,
                projectRepository: projectRepository as never,
                md5Service,
                gitProvider: gitProvider as never,
                invalidateRouterAndReload,
            },
            "https://example.org/repo.zip",
        );

        expect(result).toBe("/userData/projects/ilo_udb");
        expect(projectRepository.loadProject).toHaveBeenCalledTimes(2);
        expect(gitProvider.isRepoHealthy).toHaveBeenCalledWith(
            "/userData/projects/ilo_udb",
        );
    });

    it("handleOpenDirectory returns null when no directory was selected", async () => {
        const event = {
            target: {
                files: null,
            },
        } as React.ChangeEvent<HTMLInputElement>;

        const result = await handleOpenDirectory(event, {
            directoryProvider: {} as never,
            projectImporter: {} as never,
            projectRepository: {} as never,
            md5Service: {} as never,
            gitProvider: {} as never,
            invalidateRouterAndReload: vi.fn(),
        });

        expect(result).toBeNull();
    });

    it("handleOpenFile returns null when no file was selected", async () => {
        const event = {
            target: {
                files: null,
            },
        } as React.ChangeEvent<HTMLInputElement>;

        const result = await handleOpenFile(event, {
            directoryProvider: {} as never,
            projectImporter: {} as never,
            projectRepository: {} as never,
            md5Service: {} as never,
            gitProvider: {} as never,
            invalidateRouterAndReload: vi.fn(),
        });

        expect(result).toBeNull();
    });

    it("processFile returns imported path only after git readiness", async () => {
        const md5Service = {} as never;
        const writer = {
            write: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
        };
        const tempFileHandle = {
            name: "temp.zip",
            createWriter: vi.fn().mockResolvedValue(writer),
        };
        const tempDirectory = {
            getFileHandle: vi.fn().mockResolvedValue(tempFileHandle),
            removeEntry: vi.fn().mockResolvedValue(undefined),
        };
        const directoryProvider = {
            tempDirectory: Promise.resolve(tempDirectory),
        };

        const projectImporter = {
            import: vi.fn().mockResolvedValue("/userData/projects/llx_reg"),
        };
        const invalidateRouterAndReload = vi.fn();
        const loadedProject = {
            id: "llx_reg",
            projectDir: { path: "/userData/projects/llx_reg" },
        };
        const projectRepository = {
            loadProject: vi.fn().mockResolvedValue(loadedProject),
        };
        const gitProvider = {
            isRepoHealthy: vi.fn().mockResolvedValue(true),
        };

        const file = {
            name: "project.zip",
            size: 100,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        } as unknown as File;

        const result = await processFile(file, {
            directoryProvider: directoryProvider as never,
            projectImporter: projectImporter as never,
            projectRepository: projectRepository as never,
            md5Service,
            gitProvider: gitProvider as never,
            invalidateRouterAndReload,
        });

        expect(result).toBe("/userData/projects/llx_reg");
        expect(indexProjectMock).toHaveBeenCalledWith(
            "/userData/projects/llx_reg",
        );
        expect(projectRepository.loadProject).toHaveBeenCalledWith(
            "llx_reg",
            md5Service,
        );
        expect(ensureProjectGitReadyMock).toHaveBeenCalledWith({
            gitProvider,
            loadedProject,
        });
        expect(invalidateRouterAndReload).toHaveBeenCalledTimes(1);
        expect(tempDirectory.removeEntry).toHaveBeenCalledWith(
            expect.any(String),
            { recursive: false },
        );
    });

    it("processFile removes the staged temp file when import fails", async () => {
        const writer = {
            write: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
        };
        const tempFileHandle = {
            name: "temp.zip",
            createWriter: vi.fn().mockResolvedValue(writer),
        };
        const tempDirectory = {
            getFileHandle: vi.fn().mockResolvedValue(tempFileHandle),
            removeEntry: vi.fn().mockResolvedValue(undefined),
        };
        const directoryProvider = {
            tempDirectory: Promise.resolve(tempDirectory),
        };
        const projectImporter = {
            import: vi.fn().mockRejectedValue(new Error("zip import failed")),
        };
        const file = {
            name: "project.zip",
            size: 100,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        } as unknown as File;

        await expect(
            processFile(file, {
                directoryProvider: directoryProvider as never,
                projectImporter: projectImporter as never,
                projectRepository: {} as never,
                md5Service: {} as never,
                gitProvider: {} as never,
                invalidateRouterAndReload: vi.fn(),
            }),
        ).rejects.toThrow("zip import failed");

        expect(tempDirectory.removeEntry).toHaveBeenCalledWith(
            expect.any(String),
            { recursive: false },
        );
    });

    it("handleOpenDirectory removes the staged temp directory when import fails", async () => {
        const writer = {
            write: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
        };
        const fileHandle = {
            createWriter: vi.fn().mockResolvedValue(writer),
        };
        const nestedDirectory = {
            getFileHandle: vi.fn().mockResolvedValue(fileHandle),
            getDirectoryHandle: vi.fn(),
        };
        nestedDirectory.getDirectoryHandle.mockResolvedValue(nestedDirectory);
        const tempDirectory = {
            getDirectoryHandle: vi.fn().mockResolvedValue(nestedDirectory),
            removeEntry: vi.fn().mockResolvedValue(undefined),
        };
        const directoryProvider = {
            tempDirectory: Promise.resolve(tempDirectory),
        };
        const event = {
            target: {
                files: [
                    {
                        webkitRelativePath: "folder/manifest.yaml",
                        arrayBuffer: vi
                            .fn()
                            .mockResolvedValue(new ArrayBuffer(8)),
                    },
                ],
            },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        const projectImporter = {
            import: vi
                .fn()
                .mockRejectedValue(new Error("directory import failed")),
        };

        await expect(
            handleOpenDirectory(event, {
                directoryProvider: directoryProvider as never,
                projectImporter: projectImporter as never,
                projectRepository: {} as never,
                md5Service: {} as never,
                gitProvider: {} as never,
                invalidateRouterAndReload: vi.fn(),
            }),
        ).rejects.toThrow("directory import failed");

        expect(tempDirectory.removeEntry).toHaveBeenCalledWith("folder", {
            recursive: true,
        });
    });
});
