import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    handleDownload,
    handleOpenDirectory,
    handleOpenFile,
    processFile,
} from "@/app/domain/api/import.tsx";

const { indexProjectMock } = vi.hoisted(() => ({
    indexProjectMock: vi.fn(),
}));

vi.mock("@/app/domain/project/ProjectIndexer.ts", () => ({
    ProjectIndexer: class {
        indexProject = indexProjectMock;
    },
}));

describe("import api return values", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("handleDownload returns imported path and indexes it", async () => {
        const importer = {
            import: vi.fn().mockResolvedValue("/userData/projects/en_ulb"),
        };
        const invalidateRouterAndReload = vi.fn();

        const result = await handleDownload(
            {
                importer: importer as never,
                projectRepository: {} as never,
                md5Service: {} as never,
                invalidateRouterAndReload,
            },
            "https://example.org/repo.zip",
        );

        expect(result).toBe("/userData/projects/en_ulb");
        expect(indexProjectMock).toHaveBeenCalledWith(
            "/userData/projects/en_ulb",
        );
        expect(invalidateRouterAndReload).toHaveBeenCalledTimes(1);
    });

    it("handleDownload throws when import fails", async () => {
        const importer = {
            import: vi.fn().mockResolvedValue(null),
        };

        await expect(
            handleDownload(
                {
                    importer: importer as never,
                    projectRepository: {} as never,
                    md5Service: {} as never,
                    invalidateRouterAndReload: vi.fn(),
                },
                "https://example.org/repo.zip",
            ),
        ).rejects.toThrow("Failed to download project");
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
            invalidateRouterAndReload: vi.fn(),
        });

        expect(result).toBeNull();
    });

    it("processFile returns imported path and indexes it", async () => {
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

        const file = {
            name: "project.zip",
            size: 100,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        } as unknown as File;

        const result = await processFile(file, {
            directoryProvider: directoryProvider as never,
            projectImporter: projectImporter as never,
            projectRepository: {} as never,
            md5Service: {} as never,
            invalidateRouterAndReload,
        });

        expect(result).toBe("/userData/projects/llx_reg");
        expect(indexProjectMock).toHaveBeenCalledWith(
            "/userData/projects/llx_reg",
        );
        expect(invalidateRouterAndReload).toHaveBeenCalledTimes(1);
    });
});
