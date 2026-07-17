import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  fetchVersionPreview,
  prefetchVersionPreview,
  versionPreviewQueryKey,
} from "@/app/ui/hooks/save/versionQueries.ts";

describe("versionQueries", () => {
  it("reuses the same query result for repeated fetches", async () => {
    const queryClient = new QueryClient();
    const gitProvider = {
      readProjectSnapshotAtCommit: vi.fn().mockResolvedValue(new Map()),
    };
    const usfmOnionService = {
      getMarkerCatalog: vi.fn(),
      parseUsfm: vi.fn(),
      parseUsfmBatchFromPaths: vi.fn(),
      parseUsfmBatchFromContents: vi.fn(),
      lintExisting: vi.fn(),
      lintScope: vi.fn(),
      formatScope: vi.fn(),
      applyTokenFixes: vi.fn(),
      diffTokens: vi.fn(),
      mergeDiffBlocks: vi.fn(),
      diffScope: vi.fn(),
      supportsPathIo: false,
    };
    const loadedProject = {
      projectPath: "/userData/projects/demo",
      books: [],
    };

    const first = await fetchVersionPreview({
      queryClient,
      projectPath: loadedProject.projectPath,
      commitHash: "abc123",
      loadedProject: loadedProject as never,
      gitProvider: gitProvider as never,
      usfmOnionService: usfmOnionService as never,
    });
    const second = await fetchVersionPreview({
      queryClient,
      projectPath: loadedProject.projectPath,
      commitHash: "abc123",
      loadedProject: loadedProject as never,
      gitProvider: gitProvider as never,
      usfmOnionService: usfmOnionService as never,
    });

    expect(first.commitHash).toBe("abc123");
    expect(second.commitHash).toBe("abc123");
    expect(gitProvider.readProjectSnapshotAtCommit).toHaveBeenCalledTimes(1);
  });

  it("evicts older prefetched previews beyond the cache cap", async () => {
    const queryClient = new QueryClient();
    const gitProvider = {
      readProjectSnapshotAtCommit: vi.fn().mockResolvedValue(new Map()),
    };
    const usfmOnionService = {
      getMarkerCatalog: vi.fn(),
      parseUsfm: vi.fn(),
      parseUsfmBatchFromPaths: vi.fn(),
      parseUsfmBatchFromContents: vi.fn(),
      lintExisting: vi.fn(),
      lintScope: vi.fn(),
      formatScope: vi.fn(),
      applyTokenFixes: vi.fn(),
      diffTokens: vi.fn(),
      mergeDiffBlocks: vi.fn(),
      diffScope: vi.fn(),
      supportsPathIo: false,
    };
    const loadedProject = {
      projectPath: "/userData/projects/demo",
      books: [],
    };

    for (let index = 0; index < 9; index += 1) {
      await prefetchVersionPreview({
        queryClient,
        projectPath: loadedProject.projectPath,
        commitHash: `hash-${index}`,
        loadedProject: loadedProject as never,
        gitProvider: gitProvider as never,
        usfmOnionService: usfmOnionService as never,
      });
    }

    expect(
      queryClient.getQueryData(
        versionPreviewQueryKey(loadedProject.projectPath, "hash-0"),
      ),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        versionPreviewQueryKey(loadedProject.projectPath, "hash-8"),
      ),
    ).toBeTruthy();
  });
});
