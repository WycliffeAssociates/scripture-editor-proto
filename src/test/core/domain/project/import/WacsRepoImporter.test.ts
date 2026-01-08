import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WacsRepoImporter } from "@/core/domain/project/import/WacsRepoImporter.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import { MockDirectoryHandle } from "@/test/shared/mock.ts";

// Mock fetch globally
const mockFetch = vi.fn();

global.fetch = mockFetch;

// Mock fflate
vi.mock("fflate", () => ({
    strFromU8: vi.fn((data: Uint8Array) => new TextDecoder().decode(data)),
    unzip: vi.fn(),
}));

describe("WacsRepoImporter", () => {
    let mockDirectoryProvider: IDirectoryProvider;
    let mockProjectsDir: MockDirectoryHandle;
    let mockTempDir: MockDirectoryHandle;
    let importer: WacsRepoImporter;

    beforeEach(() => {
        mockProjectsDir = new MockDirectoryHandle("projects");
        mockTempDir = new MockDirectoryHandle("temp");

        mockDirectoryProvider = {
            projectsDirectory: Promise.resolve(mockProjectsDir),
            tempDirectory: Promise.resolve(mockTempDir),
            // Mock other required methods
            getAppPublicDirectory: vi.fn(),
            getAppPrivateDirectory: vi.fn(),
            getDirectoryHandle: vi.fn(),
            getProjectDirectory: vi.fn(),
            newFileWriter: vi.fn(),
            newFileReader: vi.fn(),
            createTempFile: vi.fn(),
            cleanTempDirectory: vi.fn(),
            openInFileManager: vi.fn(),
            databaseDirectory: Promise.resolve(new MockDirectoryHandle("db")),
            logsDirectory: Promise.resolve(new MockDirectoryHandle("logs")),
            cacheDirectory: Promise.resolve(new MockDirectoryHandle("cache")),
            getHandle: vi.fn(),
            resolveHandle: vi.fn(),
            removeDirectory: vi.fn(),
        };

        importer = new WacsRepoImporter(mockDirectoryProvider);

        // Reset fetch mock
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("import method", () => {
        it("should accept a URL string parameter", async () => {
            // Arrange
            const testUrl = "https://example.com/project.zip";
            const zipContent = new ArrayBuffer(100);

            mockFetch.mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(zipContent),
            });

            // Act & Assert - The method should accept the URL without throwing
            await importer.import(testUrl);

            // Verify fetch was called with the correct URL
            expect(mockFetch).toHaveBeenCalledWith(testUrl);
        });

        it("should handle different URL formats", async () => {
            // Test various URL formats
            const urls = [
                "https://example.com/repo.zip",
                "http://example.com/project.zip",
                "https://cdn.example.org/files/archive.zip",
            ];

            const zipContent = new ArrayBuffer(100);
            mockFetch.mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(zipContent),
            });

            for (const url of urls) {
                await importer.import(url);
                expect(mockFetch).toHaveBeenCalledWith(url);
                mockFetch.mockClear();
            }
        });

        it("should handle fetch errors gracefully", async () => {
            const testUrl = "https://example.com/invalid.zip";

            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            const result = await importer.import(testUrl);
            expect(result).toBeNull();
        });

        it("should handle network errors", async () => {
            const testUrl = "https://example.com/network-error.zip";

            mockFetch.mockRejectedValue(new Error("Network error"));

            const result = await importer.import(testUrl);
            expect(result).toBeNull();
        });
    });

    describe("downloadData method", () => {
        it("should extract filename from URL", async () => {
            const testUrl = "https://example.com/path/to/my-project.zip";
            const zipContent = new ArrayBuffer(100);

            mockFetch.mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(zipContent),
            });

            // Access private method through prototype for testing
            const downloadData = importer.downloadData.bind(importer);
            const result = await downloadData(testUrl);

            expect(result.filename).toBe("my-project.zip");
            expect(result.data).toBe(zipContent);
        });
    });
});
