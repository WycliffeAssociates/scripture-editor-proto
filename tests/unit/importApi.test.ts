import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectImportFacade, handleOpenDirectory, handleOpenFile, processFile } from "@/app/domain/api/import.ts";
import type { ImportProjectResult } from "@/core/library/ImportService.ts";

describe("import api return values", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function makeImportedProject(): ImportProjectResult {
        return {
            project: {
                folderName: "en_ulb",
                displayName: "English ULB",
                projectPath: "/userData/projects/en_ulb",
                projectId: "en_ulb",
                languageCode: "en",
                languageName: "English",
            },
            gitReady: true,
            isEditableProject: true,
        };
    }

    function makeImportService(overrides: {
        importRemoteZip?: ReturnType<typeof vi.fn>;
        importFolder?: ReturnType<typeof vi.fn>;
        importZip?: ReturnType<typeof vi.fn>;
        pickDirectory?: ReturnType<typeof vi.fn>;
        pickZip?: ReturnType<typeof vi.fn>;
    } = {}) {
        return {
            importRemoteZip:
                overrides.importRemoteZip ??
                vi.fn().mockResolvedValue(makeImportedProject()),
            importFolder:
                overrides.importFolder ??
                vi.fn().mockResolvedValue(makeImportedProject()),
            importZip:
                overrides.importZip ?? vi.fn().mockResolvedValue(makeImportedProject()),
            pickDirectory:
                overrides.pickDirectory ?? vi.fn().mockResolvedValue("/native/folder"),
            pickZip: overrides.pickZip ?? vi.fn().mockResolvedValue("/native/file.zip"),
        };
    }

    it("controller.download delegates to the import service and invalidates", async () => {
        const importedProject = makeImportedProject();
        const invalidateRouterAndReload = vi.fn();
        const importService = makeImportService({
            importRemoteZip: vi.fn().mockResolvedValue(importedProject),
        });

        const controller = createProjectImportFacade({
            importService: importService as never,
            invalidateRouterAndReload,
        });

        await expect(controller.download("https://example.org/repo.zip")).resolves.toEqual(
            importedProject,
        );
        expect(importService.importRemoteZip).toHaveBeenCalledWith(
            {
                type: "fromGitRepo",
                url: "https://example.org/repo.zip",
            },
            { onProgress: undefined },
        );
        expect(invalidateRouterAndReload).toHaveBeenCalledTimes(1);
    });

    it("handleOpenDirectory returns null when no directory was selected", async () => {
        const event = {
            target: {
                files: null,
            },
        } as React.ChangeEvent<HTMLInputElement>;

        const result = await handleOpenDirectory(event, {
            importService: makeImportService() as never,
            invalidateRouterAndReload: vi.fn(),
        });

        expect(result).toBeNull();
    });

    it("handleOpenDirectory delegates browser directory selections to the import service", async () => {
        const importedProject = makeImportedProject();
        const onProgress = vi.fn();
        const invalidateRouterAndReload = vi.fn();
        const importService = makeImportService({
            importFolder: vi.fn().mockResolvedValue(importedProject),
        });
        const files = [
            {
                webkitRelativePath: "folder/manifest.yaml",
            },
        ] as unknown as FileList;
        const event = {
            target: {
                files,
            },
        } as React.ChangeEvent<HTMLInputElement>;

        await expect(
            handleOpenDirectory(event, {
                importService: importService as never,
                invalidateRouterAndReload,
                onProgress,
            }),
        ).resolves.toEqual(importedProject);

        expect(importService.importFolder).toHaveBeenCalledWith(
            {
                kind: "files",
                folderName: "folder",
                files,
            },
            { onProgress },
        );
        expect(invalidateRouterAndReload).toHaveBeenCalledTimes(1);
    });

    it("handleOpenFile returns null when no file was selected", async () => {
        const event = {
            target: {
                files: null,
            },
        } as React.ChangeEvent<HTMLInputElement>;

        const result = await handleOpenFile(event, {
            importService: makeImportService() as never,
            invalidateRouterAndReload: vi.fn(),
        });

        expect(result).toBeNull();
    });

    it("processFile delegates browser zip selections to the import service", async () => {
        const importedProject = makeImportedProject();
        const onProgress = vi.fn();
        const invalidateRouterAndReload = vi.fn();
        const importService = makeImportService({
            importZip: vi.fn().mockResolvedValue(importedProject),
        });
        const file = {
            name: "project.zip",
            size: 100,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        } as unknown as File;

        await expect(
            processFile(file, {
                importService: importService as never,
                invalidateRouterAndReload,
                onProgress,
            }),
        ).resolves.toEqual(importedProject);

        expect(importService.importZip).toHaveBeenCalledWith(
            {
                kind: "file",
                file,
            },
            { onProgress },
        );
        expect(invalidateRouterAndReload).toHaveBeenCalledTimes(1);
    });

    it("createProjectImportFacade delegates native path imports and picker access", async () => {
        const importedProject = makeImportedProject();
        const invalidateRouterAndReload = vi.fn();
        const importService = makeImportService({
            importFolder: vi.fn().mockResolvedValue(importedProject),
            importZip: vi.fn().mockResolvedValue(importedProject),
            pickDirectory: vi.fn().mockResolvedValue("/native/folder"),
            pickZip: vi.fn().mockResolvedValue("/native/file.zip"),
        });

        const controller = createProjectImportFacade({
            importService: importService as never,
            invalidateRouterAndReload,
        });

        await expect(controller.pickDirectory()).resolves.toBe("/native/folder");
        await expect(controller.pickZip()).resolves.toBe("/native/file.zip");
        await expect(
            controller.importNativeDirectoryPath("/native/folder"),
        ).resolves.toEqual(importedProject);
        await expect(
            controller.importNativeZipPath("/native/file.zip"),
        ).resolves.toEqual(importedProject);
        expect(importService.importFolder).toHaveBeenCalledWith(
            {
                kind: "path",
                path: "/native/folder",
            },
            { onProgress: undefined },
        );
        expect(importService.importZip).toHaveBeenCalledWith(
            {
                kind: "path",
                path: "/native/file.zip",
            },
            { onProgress: undefined },
        );
        expect(invalidateRouterAndReload).toHaveBeenCalledTimes(2);
    });
});
