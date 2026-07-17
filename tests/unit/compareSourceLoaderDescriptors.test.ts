import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompareSourceLoader } from "@/app/domain/project/compare/compareSourceLoader.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type { ReadOnlyOpenProjectService } from "@/core/persistence/WorkspaceService.ts";

const parseMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/domain/api/scriptureProjectToParsedFiles.ts", () => ({
  scriptureProjectToParsedFiles: parseMock,
}));

const storageRoots: StorageRoots = {
  appDataRoot: "/appData",
  projectsRoot: "/projects",
  tempRoot: "/appData/temp",
  cacheRoot: "/appData/cache",
  logsRoot: "/appData/logs",
  databaseRoot: "/appData/database",
};

const parsedFiles: ScriptureBookState[] = [
  {
    bookCode: "GEN",
    path: "GEN.usfm",
    title: "Genesis",
    nextBookId: null,
    prevBookId: null,
    chapters: [],
  },
];

function project(): Project {
  return {
    folderName: "project-folder",
    displayName: "Project name",
    projectPath: "/projects/project-folder",
    projectId: "project-id",
    projectType: "resource-container",
    language: { code: "en", name: "English", direction: "ltr" },
    books: [],
    listBooks: async () => [],
    getBook: async () => {
      throw new Error("not needed");
    },
    saveBook: async () => {},
    addBook: async () => {
      throw new Error("not needed");
    },
    removeBook: async () => {},
    listVersions: async () => [],
    restoreVersion: async () => {},
    stageAndCommit: async () => ({ hash: "head" }),
  };
}

function makeHarness() {
  const fileSystem = new InMemoryFileSystem();
  const projectsService = {
    openProjectReadOnly: vi.fn(),
  } satisfies ReadOnlyOpenProjectService;
  const gitProvider = {
    readProjectSnapshotAtCommit: vi.fn(),
  } as unknown as GitProvider;
  const loader = new CompareSourceLoader({
    projectsService,
    fileSystem,
    storageRoots,
    usfmOnionService: { supportsPathIo: false } as IUsfmOnionService,
    authSessionProvider: {
      getCurrentSession: vi.fn(),
    } as unknown as AuthSessionProvider,
    gitProvider,
  });
  return { fileSystem, gitProvider, loader, projectsService };
}

describe("CompareSourceLoader descriptors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseMock.mockResolvedValue({ parsedFiles });
  });

  it("reopens an existing project for each descriptor reload", async () => {
    const { loader } = makeHarness();
    const load = vi.spyOn(loader, "loadExistingProject").mockResolvedValue({
      parsedFiles,
      metadataSummary: { projectId: "source" },
    });
    const descriptor = loader.createExistingProjectDescriptor({
      projectId: "source",
      label: "Source project",
    });

    await descriptor.reload();
    await descriptor.reload();

    expect(descriptor).toMatchObject({
      id: "existingProject:source",
      label: "Source project",
      locator: { kind: "existingProject", projectId: "source" },
      writable: false,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retains ZIP and directory File objects for explicit refresh", async () => {
    const { loader } = makeHarness();
    const zip = new File(["zip"], "source.zip");
    const directoryFile = new File(["usfm"], "GEN.usfm");
    Object.defineProperty(directoryFile, "webkitRelativePath", {
      value: "source-folder/GEN.usfm",
    });
    const loadZip = vi.spyOn(loader, "loadFromZipFile").mockResolvedValue({
      parsedFiles,
      metadataSummary: {},
    });
    const loadDirectory = vi
      .spyOn(loader, "loadFromDirectoryFiles")
      .mockResolvedValue({ parsedFiles, metadataSummary: {} });
    const zipDescriptor = loader.createZipFileDescriptor({
      file: zip,
      loadId: "zip-load",
    });
    const directoryDescriptor = loader.createDirectoryDescriptor({
      files: [directoryFile],
      loadId: "directory-load",
    });

    await zipDescriptor.reload();
    await zipDescriptor.reload();
    await directoryDescriptor.reload();
    await directoryDescriptor.reload();

    expect(zipDescriptor).toMatchObject({
      id: "zipFile:zip-load",
      label: "source.zip",
      locator: {
        kind: "zipFile",
        loadId: "zip-load",
        fileName: "source.zip",
      },
    });
    expect(directoryDescriptor).toMatchObject({
      id: "directory:directory-load",
      label: "source-folder",
      locator: {
        kind: "directory",
        loadId: "directory-load",
        displayPath: "source-folder",
      },
    });
    expect(loadZip).toHaveBeenNthCalledWith(2, zip);
    expect(loadDirectory.mock.calls[1]?.[0]).toEqual([directoryFile]);
  });

  it("addresses previous versions by commit and reloads their snapshot", async () => {
    const { gitProvider, loader } = makeHarness();
    vi.mocked(gitProvider.readProjectSnapshotAtCommit).mockResolvedValue(
      new Map([["GEN.usfm", "\\id GEN"]]),
    );
    const descriptor = loader.createPreviousVersionDescriptor({
      loadedProject: project(),
      oid: "commit-123",
      label: "Yesterday",
    });

    const material = await descriptor.reload();

    expect(descriptor).toMatchObject({
      id: "previousVersion:project-id:commit-123",
      label: "Yesterday",
      locator: {
        kind: "previousVersion",
        projectId: "project-id",
        oid: "commit-123",
      },
    });
    expect(gitProvider.readProjectSnapshotAtCommit).toHaveBeenCalledWith(
      "/projects/project-folder",
      "commit-123",
    );
    expect(material.files).toBe(parsedFiles);
  });

  it("keeps remote latest reloadable while material carries its resolved head", async () => {
    const { loader } = makeHarness();
    const loadedProject = project();
    const load = vi.spyOn(loader, "loadRemoteLatest").mockResolvedValue({
      parsedFiles,
      metadataSummary: { projectId: "project-id" },
      remoteSync: {
        remoteHead: "remote-head",
        localHead: "local-head",
        mergeBase: "base",
        trackedBranch: "main",
        relationship: "diverged",
      },
    });
    const descriptor = loader.createRemoteLatestDescriptor({
      loadedProject,
    });

    const material = await descriptor.reload();

    expect(descriptor).toMatchObject({
      id: "remoteLatest:project-id",
      label: "Remote latest",
      locator: { kind: "remoteLatest", projectId: "project-id" },
    });
    expect(material.remoteSync?.remoteHead).toBe("remote-head");
    expect(load).toHaveBeenCalledWith(loadedProject);
  });

  it("makes temporary-directory cleanup safe to call more than once", async () => {
    const { fileSystem, loader, projectsService } = makeHarness();
    projectsService.openProjectReadOnly.mockResolvedValue(project());
    const file = new File(["\\id GEN"], "GEN.usfm");
    Object.defineProperty(file, "webkitRelativePath", {
      value: "source-folder/GEN.usfm",
    });

    const material = await loader.loadFromDirectoryFiles([file]);
    const tempEntriesBefore = await fileSystem.list(storageRoots.tempRoot);
    await material.cleanup?.();
    await material.cleanup?.();

    expect(tempEntriesBefore).toHaveLength(1);
    expect(await fileSystem.list(storageRoots.tempRoot)).toEqual([]);
  });
});
