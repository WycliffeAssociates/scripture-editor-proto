// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";
import { OpfsStorageRoots } from "@/web/persistence/OpfsStorageRoots.ts";
import { WebImportService } from "@/web/persistence/WebImportService.ts";

function withRelativePath(file: File, relativePath: string): File {
  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: relativePath,
  });
  return file;
}

function makeBrowserFile(
  name: string,
  content: string,
  relativePath?: string,
): File {
  const bytes = new TextEncoder().encode(content);
  const file = {
    name,
    arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer.slice(0)),
    text: vi.fn().mockResolvedValue(content),
  } as unknown as File;

  if (relativePath) {
    withRelativePath(file, relativePath);
  }

  return file;
}

describe("WebImportService", () => {
  beforeEach(() => {
    i18n.load("en", {});
    i18n.activate("en");
    vi.clearAllMocks();
  });

  function makeProjectsService() {
    return {
      importProject: vi.fn().mockResolvedValue({
        project: {
          folderName: "folder",
          displayName: "Folder",
          projectPath: "/userData/projects/folder",
          projectId: "folder",
          languageCode: "en",
          languageName: "English",
          projectType: "resource-container",
        },
        gitReady: false,
        isEditableProject: false,
      }),
    } as unknown as ProjectsService;
  }

  it("imports a browser directory source into managed storage", async () => {
    const fileSystem = new InMemoryFileSystem();
    const storageRoots = new OpfsStorageRoots();
    const projectsService = makeProjectsService();
    const service = new WebImportService(
      storageRoots,
      projectsService,
      fileSystem,
    );

    const files = {
      0: withRelativePath(
        makeBrowserFile(
          "manifest.yaml",
          ["dublin_core:", "  identifier: folder", "  title: Folder"].join(
            "\n",
          ),
        ),
        "folder/manifest.yaml",
      ),
      1: withRelativePath(
        makeBrowserFile("1.md", "note one"),
        "folder/luk/22/1.md",
      ),
      length: 2,
      item(index: number) {
        return (this as Record<number, File>)[index] ?? null;
      },
    } as unknown as FileList;

    const result = await service.importFolder(
      {
        kind: "files",
        folderName: "folder",
        files,
      },
      {
        onProgress: vi.fn(),
      },
    );

    expect(result.project.projectPath).toBe("/userData/projects/folder");
    expect(
      await fileSystem.exists("/userData/projects/folder/luk/22/1.md"),
    ).toBe(true);
    expect(projectsService.importProject).toHaveBeenCalledWith(
      {
        type: "fromPreparedDir",
        directoryPath: "/userData/projects/folder",
      },
      { onProgress: expect.any(Function) },
    );
  });

  it("imports a browser zip file through a staged temp file", async () => {
    const fileSystem = new InMemoryFileSystem();
    const storageRoots = new OpfsStorageRoots();
    const projectsService = makeProjectsService();
    const service = new WebImportService(
      storageRoots,
      projectsService,
      fileSystem,
    );

    const file = makeBrowserFile("folder.zip", "zip data");
    const result = await service.importZip(
      {
        kind: "file",
        file,
      },
      {
        onProgress: vi.fn(),
      },
    );

    expect(result.project.projectPath).toBe("/userData/projects/folder");
    expect(projectsService.importProject).toHaveBeenCalledWith(
      {
        type: "fromZipFile",
        filePath: expect.stringContaining("/temp/import-"),
      },
      { onProgress: expect.any(Function) },
    );
    expect(
      [...fileSystem.files.keys()].some((path) =>
        path.startsWith("/temp/import-"),
      ),
    ).toBe(false);
  });
});
