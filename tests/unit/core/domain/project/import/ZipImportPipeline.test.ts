import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZipImportPipeline } from "@/core/domain/project/import/ZipImportPipeline.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const { unzipMock } = vi.hoisted(() => ({
    unzipMock: vi.fn(),
}));

vi.mock("fflate", () => ({
    unzip: unzipMock,
}));

describe("ZipImportPipeline", () => {
    let fileSystem: InMemoryFileSystem;
    let roots: StorageRoots;

    beforeEach(() => {
        vi.clearAllMocks();
        fileSystem = new InMemoryFileSystem();
        roots = {
            appDataRoot: "/appData",
            projectsRoot: "/userData/projects",
            tempRoot: "/appData/temp",
            cacheRoot: "/appData/cache",
            logsRoot: "/appData/logs",
            databaseRoot: "/appData/database",
        };
    });

    it("emits extract and copy progress while importing a zip archive", async () => {
        unzipMock.mockImplementation(
            (
                _data: Uint8Array,
                _opts: unknown,
                cb: (err: unknown, result?: Record<string, Uint8Array>) => void,
            ) => {
                cb(null, {
                    "project/manifest.yaml": new TextEncoder().encode(
                        "dublin_core: {}",
                    ),
                    "project/luk/22/71.md": new TextEncoder().encode("hello"),
                });
            },
        );

        const pipeline = new ZipImportPipeline(fileSystem, roots);
        const onProgress = vi.fn();

        const result = await pipeline.importFromZipData({
            archiveName: "project.zip",
            data: new Uint8Array([1, 2, 3]),
            onProgress,
        });

        expect(result).toBe("/userData/projects/project");
        expect(onProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                phase: "extract-archive",
                current: 0,
                total: 2,
            }),
        );
        expect(onProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                phase: "copy-content",
                current: 0,
                total: 2,
            }),
        );
        expect(onProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                phase: "copy-content",
                current: 2,
                total: 2,
            }),
        );
    });

    it("cleans up temp extraction and staged files when final copy fails", async () => {
        unzipMock.mockImplementation(
            (
                _data: Uint8Array,
                _opts: unknown,
                cb: (err: unknown, result?: Record<string, Uint8Array>) => void,
            ) => {
                cb(null, {
                    "project/manifest.yaml": new TextEncoder().encode(
                        "dublin_core: {}",
                    ),
                    "project/luk/22/71.md": new TextEncoder().encode("hello"),
                });
            },
        );

        const originalWriteBytes = fileSystem.writeBytes.bind(fileSystem);
        vi.spyOn(fileSystem, "writeBytes").mockImplementation(
            async (path: string, content: Uint8Array) => {
                if (path.startsWith("/userData/projects/")) {
                    throw new Error("copy failed");
                }
                return await originalWriteBytes(path, content);
            },
        );
        const removeSpy = vi.spyOn(fileSystem, "remove");
        const pipeline = new ZipImportPipeline(fileSystem, roots);

        await expect(
            pipeline.importFromZipData({
                archiveName: "project.zip",
                data: new Uint8Array([1, 2, 3]),
                stagedZipPath: "/appData/temp/project.zip",
            }),
        ).rejects.toThrow("copy failed");

        expect(removeSpy).toHaveBeenCalledWith(
            expect.stringContaining("/appData/temp/project-extract-"),
            { recursive: true },
        );
        expect(removeSpy).toHaveBeenCalledWith(
            "/appData/temp/project.zip",
            { recursive: false },
        );
    });
});
