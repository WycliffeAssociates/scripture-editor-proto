import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WacsRepoImporter } from "@/core/domain/project/import/WacsRepoImporter.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

// Mock fetch globally
const mockFetch = vi.fn();

global.fetch = mockFetch;

// Mock fflate
vi.mock("fflate", () => ({
  strFromU8: vi.fn((data: Uint8Array) => new TextDecoder().decode(data)),
  unzip: vi.fn(),
}));

describe("WacsRepoImporter", () => {
  let fileSystem: InMemoryFileSystem;
  let roots: StorageRoots;
  let importer: WacsRepoImporter;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    fileSystem = new InMemoryFileSystem();
    roots = {
      appDataRoot: "/appData",
      projectsRoot: "/userData/projects",
      tempRoot: "/appData/temp",
      cacheRoot: "/appData/cache",
      logsRoot: "/appData/logs",
      databaseRoot: "/appData/database",
    };

    importer = new WacsRepoImporter(fileSystem, roots);

    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("import method", () => {
    it("should accept a URL string parameter", async () => {
      const testUrl = "https://example.com/project.zip";
      const zipContent = new Uint8Array(100);
      vi.spyOn(importer, "downloadData").mockResolvedValue({
        data: zipContent,
        filename: "project.zip",
      });
      vi.spyOn(
        importer["zipPipeline" as keyof WacsRepoImporter] as unknown as {
          importFromZipData: (args: {
            archiveName: string;
            data: Uint8Array;
          }) => Promise<string>;
        },
        "importFromZipData",
      ).mockResolvedValue("/userData/projects/project");

      await importer.import(testUrl);
      expect(importer.downloadData).toHaveBeenCalledWith(testUrl);
    });

    it("should handle different URL formats", async () => {
      const urls = [
        "https://example.com/repo.zip",
        "http://example.com/project.zip",
        "https://cdn.example.org/files/archive.zip",
      ];
      vi.spyOn(importer, "downloadData").mockImplementation(
        async (url: string) => ({
          data: new Uint8Array(100),
          filename: url.split("/").at(-1) ?? "archive.zip",
        }),
      );
      vi.spyOn(
        importer["zipPipeline" as keyof WacsRepoImporter] as unknown as {
          importFromZipData: (args: {
            archiveName: string;
            data: Uint8Array;
          }) => Promise<string>;
        },
        "importFromZipData",
      ).mockResolvedValue("/userData/projects/project");

      for (const url of urls) {
        await importer.import(url);
        expect(importer.downloadData).toHaveBeenCalledWith(url);
      }
    });

    it("should throw for non-ok fetch responses", async () => {
      const testUrl = "https://example.com/invalid.zip";

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(importer.import(testUrl)).rejects.toThrow(
        "Download failed with status: 404 Not Found",
      );
    });

    it("should throw network errors", async () => {
      const testUrl = "https://example.com/network-error.zip";

      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(importer.import(testUrl)).rejects.toThrow("Network error");
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
      expect(result.data).toEqual(new Uint8Array(zipContent));
    });
  });
});
