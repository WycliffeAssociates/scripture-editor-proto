import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthSessionProvider } from "@/core/persistence/AuthSessionProvider.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ProjectImporter } from "@/core/domain/project/import/ProjectImporter.ts";
import { createReferenceDocumentId } from "@/core/library/ReferenceDocuments.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import { ensureProjectGitReady } from "@/core/persistence/ensureProjectGitReady.ts";
import { GIT_REMOTE_PUBLISH_PUBLISHED } from "@/core/persistence/GitProvider.ts";
import type { GitProvider } from "@/core/persistence/GitProvider.ts";
import type { RemoteRepoProvider } from "@/core/persistence/RemoteRepoProvider.ts";
import type { ProjectIndex } from "@/core/library/ProjectIndex.ts";
import type { ImportProjectResult } from "@/core/persistence/WorkspaceService.ts";
import type { Project, ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import {
  readGitRemoteProjectInfo,
  readGitRemoteProjectStatus,
  writeGitRemoteProjectInfo,
  writeGitRemoteProjectStatus,
} from "@/core/persistence/gitRemoteStore.ts";
import { createDefaultGitRemoteProjectStatus } from "@/core/persistence/gitRemoteModels.ts";
import { DefaultProjectsService } from "@/app/persistence/DefaultProjectsService.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

vi.mock("@/core/persistence/ensureProjectGitReady.ts", () => ({
  ensureProjectGitReady: vi.fn(async () => {}),
}));

const mockMd5Service: IMd5Service = {
  calculateMd5: vi.fn((text: string) => Promise.resolve(`mock-md5-${text}`)),
};

const mockGitProvider: GitProvider = {
  ensureRepo: vi.fn(async () => {}),
  getBranchInfo: vi.fn(async () => ({
    current: "main",
    hasMaster: false,
    defaultBranch: "main",
    detached: false,
  })),
  checkoutPreferredBranch: vi.fn(async () => {}),
  listHistory: vi.fn(async () => []),
  readCommitDetails: vi.fn(async () => ({
    hash: "abc123",
    authorName: "alice",
    authoredAtIso: "2026-03-31T10:00:00.000Z",
    subject: "save:2026-03-31T10:00:00.000Z",
  })),
  readProjectSnapshotAtCommit: vi.fn(async () => new Map()),
  restoreTrackedFilesFromCommit: vi.fn(async () => {}),
  commitAll: vi.fn(async () => ({ hash: "abc123" })),
  cloneRemoteRepo: vi.fn(async () => ({ head: "abc123" })),
  ensureRemote: vi.fn(async () => {}),
  inspectRemoteHeads: vi.fn(async () => {
    throw new Error("not used in test");
  }),
  fetchRemoteHeads: vi.fn(async () => {
    throw new Error("not used in test");
  }),
  pushCurrentBranch: vi.fn(async () => ({
    outcome: GIT_REMOTE_PUBLISH_PUBLISHED,
    localHead: null,
    remoteHead: null,
  })),
  planReplayOntoRemote: vi.fn(async () => {
    throw new Error("not used in test");
  }),
  applyReplayPlanOntoRemote: vi.fn(async () => ({
    head: null,
    replayedCommitHashes: [],
  })),
  isRepoHealthy: vi.fn(async () => true),
};

const roots: StorageRoots = {
  appDataRoot: "/appData",
  projectsRoot: "/userData/projects",
  tempRoot: "/appData/temp",
  cacheRoot: "/appData/cache",
  logsRoot: "/appData/logs",
  databaseRoot: "/appData/database",
};

const projectIndex: ProjectIndex = {
  listProjects: vi.fn(async () => []),
  listLibraryItems: vi.fn(async () => []),
  getProjectByPath: vi.fn(async () => null),
  getLibraryItemByPath: vi.fn(async () => null),
  indexItem: vi.fn(async () => {}),
  renameDisplayName: vi.fn(async () => {}),
  deleteProject: vi.fn(async () => {}),
};

function createAuthSessionProvider(): AuthSessionProvider {
  return {
    getCurrentSession: vi.fn().mockResolvedValue({
      hostBaseUrl: "https://gitea.example.org",
      username: "alice",
      token: "secret-token",
      tokenId: "1",
      tokenName: "zephyr-web",
    }),
    loginWithPassword: vi.fn(),
    replaceSession: vi.fn(),
    logoutCurrentSession: vi.fn().mockResolvedValue(undefined),
    clearSession: vi.fn(),
  };
}

function createRemoteRepoProvider(): RemoteRepoProvider {
  return {
    listWritableRepos: vi.fn(),
    listOwnedRepos: vi.fn(),
    createRepo: vi.fn(),
    inspectProjectMetadata: vi.fn(),
  };
}

function makeOpenedProject(overrides: Partial<Project> = {}): Project {
  return {
    folderName: "reg",
    displayName: "Adhola Bible",
    projectPath: "/userData/projects/reg",
    projectId: "reg",
    projectType: "resource-container",
    language: {
      code: "adh",
      name: "Adhola",
      direction: "ltr",
    },
    books: [
      {
        bookCode: "1JN",
        title: "1 John",
        fileName: "63-1JN.usfm",
        storageKey: "63-1JN.usfm",
        path: "/userData/projects/reg/63-1JN.usfm",
      },
    ],
    listBooks: async () => [],
    getBook: async () => ({
      bookCode: "1JN",
      title: "1 John",
      fileName: "63-1JN.usfm",
      storageKey: "63-1JN.usfm",
      path: "/userData/projects/reg/63-1JN.usfm",
      contents: "\\id 1JN",
    }),
    saveBook: async () => {},
    addBook: async () => ({
      bookCode: "MAT",
      title: "Matthew",
      fileName: "41-MAT.usfm",
      storageKey: "41-MAT.usfm",
      path: "/userData/projects/reg/41-MAT.usfm",
    }),
    listVersions: async () => [],
    restoreVersion: async () => {},
    stageAndCommit: async () => ({ hash: "abc123" }),
    ...overrides,
  };
}

function makeOpenedScriptureItem(overrides: Partial<Project> = {}) {
  const project = makeOpenedProject(overrides);
  return {
    ...project,
    id: project.projectId ?? project.folderName,
    type: "usfmScripture" as const,
    managedPath: project.projectPath,
    containerFormat:
      project.projectType === "scripture-burrito"
        ? ("scripture-burrito" as const)
        : ("resource-container" as const),
    capabilities: {
      editableWith: "usfmScripture" as const,
    },
    readWorkspace: async () => ({
      bookCode: "1JN",
      usfmContents: "\\id 1JN",
    }),
    readBook: async () => ({
      bookCode: "1JN",
      usfmContents: "\\id 1JN",
    }),
  };
}

function makeOpenedResource(overrides: Partial<LoadedReferenceItem> = {}): LoadedReferenceItem {
  return {
    folderName: "en_tn_condensed",
    displayName: "English Translation Notes Condensed",
    managedPath: "/userData/projects/en_tn_condensed",
    projectId: "en_tn_condensed",
    projectType: "resource-container",
    descriptor: {
      id: "en_tn_condensed",
      displayName: "English Translation Notes Condensed",
      type: "translationNotes",
      containerFormat: "resource-container",
      language: {
        code: "en",
        name: "English",
        direction: "ltr",
      },
      readOnly: true,
    },
    listDocuments: async () => [
      {
        id: createReferenceDocumentId("luk/22/71.md"),
        name: "Luke",
        browsePath: ["luk", "22", "71"],
      },
    ],
    readDocument: async () => ({
      id: createReferenceDocumentId("luk/22/71.md"),
      name: "Luke",
      browsePath: ["luk", "22", "71"],
      contents: "# Luke 22:71",
    }),
    ...overrides,
  };
}

describe("DefaultProjectsService", () => {
  let fileSystem: InMemoryFileSystem;
  let projectsService: DefaultProjectsService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectIndex.listProjects).mockResolvedValue([]);
    vi.mocked(projectIndex.listLibraryItems).mockResolvedValue([]);
    vi.mocked(projectIndex.getProjectByPath).mockResolvedValue(null);
    vi.mocked(projectIndex.getLibraryItemByPath).mockResolvedValue(null);
    vi.mocked(projectIndex.indexItem).mockResolvedValue();
    vi.mocked(projectIndex.renameDisplayName).mockResolvedValue();
    vi.mocked(projectIndex.deleteProject).mockResolvedValue();

    fileSystem = new InMemoryFileSystem({
      "/userData/projects/reg/manifest.yaml": "projects: []",
    });
    projectsService = new DefaultProjectsService({
      fileSystem,
      roots,
      projectIndex,
      md5Service: mockMd5Service,
      gitProvider: mockGitProvider,
    });
  });

  test("openProject should return the path-based opened-project facade", async () => {
    const openItemSpy = vi
      .spyOn(projectsService["itemLoader"], "openItem")
      .mockResolvedValueOnce(makeOpenedScriptureItem() as never);
    vi.mocked(projectIndex.getProjectByPath).mockResolvedValueOnce(null);

    const loadedProject = await projectsService.openProject("reg");

    expect(projectIndex.getProjectByPath).toHaveBeenCalledWith("/userData/projects/reg");
    expect(openItemSpy).toHaveBeenCalledWith({
      fs: fileSystem,
      managedPath: "/userData/projects/reg",
      displayName: "reg",
    });
    expect(loadedProject?.projectId).toBe("reg");
    expect(loadedProject?.language.code).toBe("adh");
    expect(loadedProject?.books).toEqual([
      expect.objectContaining({
        bookCode: "1JN",
        title: "1 John",
        path: "/userData/projects/reg/63-1JN.usfm",
      }),
    ]);
  });

  test("openProjectReadOnly returns the path-based opened-project facade without extra mutations", async () => {
    const openItemSpy = vi
      .spyOn(projectsService["itemLoader"], "openItem")
      .mockResolvedValueOnce(makeOpenedScriptureItem() as never);

    const loadedProject = await projectsService.openProjectReadOnly("reg");

    expect(openItemSpy).toHaveBeenCalledWith({
      fs: fileSystem,
      managedPath: "/userData/projects/reg",
      displayName: "reg",
    });
    expect(loadedProject?.projectId).toBe("reg");
  });

  test("openProject uses the indexed display name when available", async () => {
    const openItemSpy = vi.spyOn(projectsService["itemLoader"], "openItem").mockResolvedValueOnce(
      makeOpenedScriptureItem({
        displayName: "Indexed Adhola Bible",
      }) as never,
    );
    vi.mocked(projectIndex.getProjectByPath).mockResolvedValueOnce({
      folderName: "reg",
      projectPath: "/userData/projects/reg",
      displayName: "Indexed Adhola Bible",
      projectId: "reg",
      languageCode: "adh",
      languageName: "Adhola",
    });

    const loadedProject = await projectsService.openProject("reg");

    expect(openItemSpy).toHaveBeenCalledWith({
      fs: fileSystem,
      managedPath: "/userData/projects/reg",
      displayName: "Indexed Adhola Bible",
    });
    expect(loadedProject?.displayName).toBe("Indexed Adhola Bible");
  });

  test("openEditableProject reports non-editable resources explicitly", async () => {
    await fileSystem.writeText("/userData/projects/en_tn_condensed/manifest.yaml", "projects: []");
    const openItemSpy = vi
      .spyOn(projectsService["itemLoader"], "openItem")
      .mockResolvedValueOnce(makeOpenedResource() as never);

    const result = await projectsService.openEditableProject("en_tn_condensed");

    expect(openItemSpy).toHaveBeenCalledWith({
      fs: fileSystem,
      managedPath: "/userData/projects/en_tn_condensed",
      displayName: "en_tn_condensed",
    });
    expect(result).toEqual({
      project: null,
      rejectionReason: "not-editable",
    });
  });

  test("openEditableProject reports metadata-invalid when manifest paths are broken", async () => {
    await fileSystem.writeText(
      "/userData/projects/reg/manifest.yaml",
      [
        "dublin_core:",
        "  identifier: reg",
        "  language:",
        "    identifier: adh",
        "    title: Adhola",
        "    direction: ltr",
        "projects:",
        "  - title: Matthew",
        "    identifier: mat",
        "    sort: 41",
        "    path: ./41-MAT.usfm",
        "    categories: []",
      ].join("\n"),
    );

    const result = await projectsService.openEditableProject("reg");

    expect(result.project).toBeNull();
    expect(result.rejectionReason).toBe("metadata-invalid");
    expect(result.metadataIssues).toEqual([
      expect.objectContaining({
        code: "missing-project-file",
        fieldPath: "projects[0].path",
        currentValue: "./41-MAT.usfm",
      }),
    ]);
  });

  test("listProjects should return the indexed rows", async () => {
    const listedProjects: ProjectListItem[] = [
      {
        folderName: "reg",
        projectPath: "/userData/projects/reg",
        displayName: "Adhola Bible",
        projectId: "reg",
        languageCode: "adh",
        languageName: "Adhola",
      },
    ];
    vi.mocked(projectIndex.listProjects).mockResolvedValueOnce(listedProjects);

    const result = await projectsService.listProjects();

    expect(result).toEqual(listedProjects);
    expect(projectIndex.listProjects).toHaveBeenCalledTimes(1);
  });

  test("openResource uses the indexed display name and resource loader path", async () => {
    const openResourceSpy = vi.spyOn(projectsService as any, "reopenManagedResource");
    openResourceSpy.mockResolvedValueOnce(makeOpenedResource());
    vi.mocked(projectIndex.getLibraryItemByPath).mockResolvedValueOnce({
      folderName: "en_tn_condensed",
      projectPath: "/userData/projects/en_tn_condensed",
      displayName: "Indexed English TN",
      projectId: "en_tn_condensed",
      languageCode: "en",
      languageName: "English",
      projectType: "resource-container",
      type: "translationNotes",
      containerFormat: "resource-container",
      isEditable: false,
      hasRemoteSync: false,
      libraryGroup: "translation-notes",
    });
    await fileSystem.writeText("/userData/projects/en_tn_condensed/manifest.yaml", "projects: []");

    const loadedResource = await projectsService.openResource("/userData/projects/en_tn_condensed");

    expect(projectIndex.getLibraryItemByPath).toHaveBeenCalledWith(
      "/userData/projects/en_tn_condensed",
    );
    expect(openResourceSpy).toHaveBeenCalledWith({
      managedPath: "/userData/projects/en_tn_condensed",
      displayName: "Indexed English TN",
    });
    expect(loadedResource?.descriptor.type).toBe("translationNotes");
  });

  test("listReferenceResources returns grouped mixed-library results with optional filtering", async () => {
    vi.mocked(projectIndex.listLibraryItems).mockResolvedValue([
      {
        folderName: "reg",
        projectPath: "/userData/projects/reg",
        displayName: "Adhola Bible",
        projectId: "reg",
        languageCode: "adh",
        languageName: "Adhola",
        projectType: "resource-container",
        type: "usfmScripture",
        containerFormat: "resource-container",
        isEditable: true,
        hasRemoteSync: false,
        libraryGroup: "scripture",
      },
      {
        folderName: "en_tn_condensed",
        projectPath: "/userData/projects/en_tn_condensed",
        displayName: "English Translation Notes Condensed",
        projectId: "en_tn_condensed",
        languageCode: "en",
        languageName: "English",
        projectType: "resource-container",
        type: "translationNotes",
        containerFormat: "resource-container",
        isEditable: false,
        hasRemoteSync: false,
        libraryGroup: "translation-notes",
      },
    ]);

    const allResults = await projectsService.listReferenceResources();
    const filteredResults = await projectsService.listReferenceResources({
      libraryGroups: ["translation-notes"],
      types: ["translationNotes"],
    });

    expect(allResults).toHaveLength(2);
    expect(filteredResults).toEqual([
      expect.objectContaining({
        projectPath: "/userData/projects/en_tn_condensed",
        libraryGroup: "translation-notes",
        type: "translationNotes",
      }),
    ]);
    expect(projectIndex.listLibraryItems).toHaveBeenCalledTimes(2);
  });

  test("deleteProject removes disk contents and indexed rows through one service call", async () => {
    const removeSpy = vi.spyOn(fileSystem, "remove");

    await projectsService.deleteProject("/userData/projects/reg");

    expect(removeSpy).toHaveBeenCalledWith("/userData/projects/reg", {
      recursive: true,
    });
    expect(projectIndex.deleteProject).toHaveBeenCalledWith("/userData/projects/reg");
  });

  test("deleteProject still accepts an explicit recursive option", async () => {
    const removeSpy = vi.spyOn(fileSystem, "remove");

    await projectsService.deleteProject("/userData/projects/reg", {
      recursive: true,
    });

    expect(removeSpy).toHaveBeenCalledWith("/userData/projects/reg", {
      recursive: true,
    });
  });

  test("renameDisplayName updates the indexed project row through the service", async () => {
    await projectsService.renameDisplayName("/userData/projects/reg", "Adhola Bible Revised");

    expect(projectIndex.renameDisplayName).toHaveBeenCalledWith(
      "/userData/projects/reg",
      "Adhola Bible Revised",
    );
  });

  test("importProject indexes, git-initializes, and returns a successful import result", async () => {
    const importedItem: ProjectListItem = {
      folderName: "reg",
      projectPath: "/userData/projects/reg",
      displayName: "Adhola Bible",
      projectId: "reg",
      languageCode: "adh",
      languageName: "Adhola",
    };
    const importSpy = vi
      .spyOn(ProjectImporter.prototype, "import")
      .mockResolvedValueOnce(importedItem.projectPath);
    const gitReadySpy = vi.mocked(ensureProjectGitReady);
    const openEditableProjectSpy = vi
      .spyOn(projectsService, "openEditableProject")
      .mockResolvedValueOnce({ project: makeOpenedProject() });
    vi.mocked(projectIndex.getProjectByPath).mockResolvedValueOnce(importedItem);

    const result = await projectsService.importProject({
      type: "fromZipFile",
      filePath: "/appData/temp/import.zip",
    });

    expect(importSpy).toHaveBeenCalledWith(
      {
        type: "fromZipFile",
        filePath: "/appData/temp/import.zip",
      },
      expect.any(Function),
    );
    expect(openEditableProjectSpy).toHaveBeenCalledWith(importedItem.projectPath);
    expect(projectIndex.indexItem).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: importedItem.projectPath,
      }),
    );
    expect(gitReadySpy).toHaveBeenCalledWith({
      fileSystem,
      gitProvider: mockGitProvider,
      loadedProject: expect.objectContaining({
        projectPath: importedItem.projectPath,
      }),
    });
    expect(projectIndex.getProjectByPath).toHaveBeenCalledWith(importedItem.projectPath);
    expect(result).toEqual({
      project: importedItem,
      gitReady: true,
      isEditableProject: true,
      requiresMetadataReview: false,
    });
  });

  test("importProject keeps the imported project indexed when git readiness fails", async () => {
    const importedItem: ProjectListItem = {
      folderName: "reg",
      projectPath: "/userData/projects/reg",
      displayName: "Adhola Bible",
      projectId: "reg",
      languageCode: "adh",
      languageName: "Adhola",
    };
    vi.spyOn(ProjectImporter.prototype, "import").mockResolvedValueOnce(importedItem.projectPath);
    vi.spyOn(projectsService, "openEditableProject").mockResolvedValueOnce({
      project: makeOpenedProject(),
    });
    vi.mocked(projectIndex.getProjectByPath).mockResolvedValueOnce(importedItem);
    vi.mocked(ensureProjectGitReady).mockRejectedValueOnce(new Error("Repo init failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await projectsService.importProject({
      type: "fromZipFile",
      filePath: "/appData/temp/import.zip",
    });

    expect(projectIndex.indexItem).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: importedItem.projectPath,
      }),
    );
    expect(result).toEqual({
      project: importedItem,
      gitReady: false,
      isEditableProject: true,
      requiresMetadataReview: false,
      warning:
        "Project imported successfully, but version history could not be initialized. Repo init failed",
    });
    consoleErrorSpy.mockRestore();
  });

  test("importProject indexes and returns a reference resource when the import is not editable scripture", async () => {
    const importedPath = "/userData/projects/en_tn_condensed";
    const importedResourceItem = {
      folderName: "en_tn_condensed",
      projectPath: importedPath,
      displayName: "English Translation Notes Condensed",
      projectId: "en_tn_condensed",
      languageCode: "en",
      languageName: "English",
      projectType: "resource-container" as const,
      type: "translationNotes" as const,
      containerFormat: "resource-container" as const,
      isEditable: false,
      hasRemoteSync: false,
      libraryGroup: "translation-notes" as const,
    };
    vi.spyOn(ProjectImporter.prototype, "import").mockResolvedValueOnce(importedPath);
    await fileSystem.writeText(
      `${importedPath}/manifest.yaml`,
      `dublin_core:
  identifier: en_tn_condensed
  title: English Translation Notes Condensed
  language:
    identifier: en
    title: English
    direction: ltr
projects:
  - identifier: luk
    title: Luke
    path: notes/luk/22/71.md
`,
    );
    await fileSystem.writeText(
      `${importedPath}/notes/luk/22/71.md`,
      '# Why do we still need a witness?\n\n"We have no further need for witnesses!"\n',
    );
    vi.spyOn(projectsService, "openEditableProject").mockResolvedValueOnce({
      project: null,
      rejectionReason: "not-editable",
    });
    vi.spyOn(projectsService, "openResource").mockResolvedValueOnce(makeOpenedResource());
    vi.mocked(projectIndex.getLibraryItemByPath).mockResolvedValueOnce(importedResourceItem);

    const result = await projectsService.importProject({
      type: "fromDir",
      directoryPath: importedPath,
    });

    expect(projectIndex.indexItem).toHaveBeenCalledWith(
      expect.objectContaining({
        managedPath: importedPath,
      }),
    );
    expect(ensureProjectGitReady).not.toHaveBeenCalled();
    expect(result).toEqual({
      project: {
        folderName: importedResourceItem.folderName,
        projectPath: importedResourceItem.projectPath,
        displayName: importedResourceItem.displayName,
        projectId: importedResourceItem.projectId,
        languageCode: importedResourceItem.languageCode,
        languageName: importedResourceItem.languageName,
        projectType: importedResourceItem.projectType,
      },
      gitReady: false,
      isEditableProject: false,
      requiresMetadataReview: false,
    });
  });

  test("importProject returns editable project metadata review result when open is blocked by metadata issues", async () => {
    const importedPath = "/userData/projects/examples";
    vi.spyOn(ProjectImporter.prototype, "import").mockResolvedValueOnce(importedPath);
    await fileSystem.writeText(
      `${importedPath}/manifest.yaml`,
      `dublin_core:
  identifier: reg
  title: Example Bible
  language:
    identifier: bem
    title: Bemba
    direction: ltr
projects:
  - identifier: gen
    title: Genesis
    sort: 1
    path: ./01-GEN.usfm
    categories: []
`,
    );
    await fileSystem.writeText(`${importedPath}/01GENBSB.usfm`, "\\id GEN\n\\c 1\n");
    vi.spyOn(projectsService, "openEditableProject").mockResolvedValueOnce({
      project: null,
      rejectionReason: "metadata-invalid",
      metadataIssues: [
        {
          code: "missing-project-file",
          message: "broken path",
          fieldPath: "projects[0].path",
        },
      ],
    });
    vi.mocked(projectIndex.getProjectByPath).mockResolvedValueOnce({
      folderName: "examples",
      projectPath: importedPath,
      displayName: "examples",
      projectId: "examples",
      languageCode: "bem",
      languageName: "Bemba",
      projectType: "resource-container",
    });

    const result = await projectsService.importProject({
      type: "fromDir",
      directoryPath: importedPath,
    });

    expect(projectIndex.indexItem).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: importedPath,
        projectType: "resource-container",
      }),
    );
    expect(result).toEqual({
      project: {
        folderName: "examples",
        projectPath: importedPath,
        displayName: "examples",
        projectId: "examples",
        languageCode: "bem",
        languageName: "Bemba",
        projectType: "resource-container",
      },
      gitReady: false,
      isEditableProject: true,
      requiresMetadataReview: true,
    });
  });

  test("reconcileIndex removes stale indexed rows whose project paths no longer exist", async () => {
    vi.mocked(projectIndex.listLibraryItems).mockResolvedValueOnce([
      {
        folderName: "missing",
        projectPath: "/userData/projects/missing",
        displayName: "Missing Bible",
        projectId: "missing",
        languageCode: "adh",
        languageName: "Adhola",
        projectType: "resource-container",
        type: "usfmScripture",
        containerFormat: "resource-container",
        isEditable: true,
        hasRemoteSync: false,
        libraryGroup: "scripture",
      },
      {
        folderName: "ulb",
        projectPath: "/userData/projects/ulb",
        displayName: "ULB",
        projectId: "ulb",
        languageCode: "en",
        languageName: "English",
        projectType: "resource-container",
        type: "usfmScripture",
        containerFormat: "resource-container",
        isEditable: true,
        hasRemoteSync: false,
        libraryGroup: "scripture",
      },
      {
        folderName: "en_tn_condensed",
        projectPath: "/userData/projects/en_tn_condensed",
        displayName: "English Translation Notes Condensed",
        projectId: "en_tn_condensed",
        languageCode: "en",
        languageName: "English",
        projectType: "resource-container",
        type: "translationNotes",
        containerFormat: "resource-container",
        isEditable: false,
        hasRemoteSync: false,
        libraryGroup: "translation-notes",
      },
    ]);

    await fileSystem.writeText("/userData/projects/ulb/manifest.yaml", "");
    await fileSystem.writeText("/userData/projects/en_tn_condensed/manifest.yaml", "");

    await projectsService.reconcileIndex();

    expect(projectIndex.deleteProject).toHaveBeenCalledWith("/userData/projects/missing");
    expect(projectIndex.deleteProject).not.toHaveBeenCalledWith("/userData/projects/ulb");
    expect(projectIndex.deleteProject).not.toHaveBeenCalledWith(
      "/userData/projects/en_tn_condensed",
    );
  });

  test("reconcileIndex reindexes loadable projects and reference resources from disk", async () => {
    fileSystem = new InMemoryFileSystem({
      "/userData/projects/reg/manifest.yaml": "projects: []",
      "/userData/projects/en_tn_condensed/manifest.yaml": "projects: []",
    });
    projectsService = new DefaultProjectsService({
      fileSystem,
      roots,
      projectIndex,
      md5Service: mockMd5Service,
      gitProvider: mockGitProvider,
    });

    vi.mocked(projectIndex.listLibraryItems).mockResolvedValueOnce([]);
    const openProjectSpy = vi
      .spyOn(projectsService["itemLoader"], "openItem")
      .mockImplementation(async ({ managedPath }) =>
        managedPath.endsWith("/reg")
          ? (makeOpenedScriptureItem() as never)
          : managedPath.endsWith("/en_tn_condensed")
            ? ({
                id: "en_tn_condensed",
                displayName: "English Translation Notes Condensed",
                managedPath: "/userData/projects/en_tn_condensed",
                containerFormat: "resource-container",
                language: {
                  code: "en",
                  name: "English",
                  direction: "ltr",
                },
                capabilities: {},
                type: "translationNotes",
                listBookCodes: async () => ["LUK"],
                readBook: async () => null,
                readChapter: async () => null,
              } as never)
            : null,
      );

    await projectsService.reconcileIndex();

    expect(openProjectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        managedPath: "/userData/projects/reg",
      }),
    );
    expect(openProjectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        managedPath: "/userData/projects/en_tn_condensed",
      }),
    );
    expect(projectIndex.indexItem).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: "/userData/projects/reg",
      }),
    );
    expect(projectIndex.indexItem).toHaveBeenCalledWith(
      expect.objectContaining({
        managedPath: "/userData/projects/en_tn_condensed",
      }),
    );
  });

  test("createRemoteForProject creates, links, and publishes editable scripture", async () => {
    const remoteRepoProvider = createRemoteRepoProvider();
    vi.mocked(remoteRepoProvider.createRepo).mockResolvedValueOnce({
      id: "1",
      owner: "alice",
      name: "adh-reg",
      fullName: "alice/adh-reg",
      htmlUrl: "https://gitea.example.org/alice/adh-reg",
      cloneUrl: "https://gitea.example.org/alice/adh-reg.git",
      defaultBranch: "master",
      topics: ["consolidated"],
      canWrite: true,
    });
    projectsService = new DefaultProjectsService({
      fileSystem,
      roots,
      projectIndex,
      md5Service: mockMd5Service,
      gitProvider: mockGitProvider,
      remote: {
        authSessionProvider: createAuthSessionProvider(),
        remoteRepoProvider,
      },
    });
    vi.spyOn(projectsService, "openEditableProject").mockResolvedValueOnce({
      project: makeOpenedProject(),
    });

    const result = await projectsService.createRemoteForProject("reg");

    expect(vi.mocked(remoteRepoProvider.createRepo)).toHaveBeenCalledWith({
      hostBaseUrl: "https://gitea.example.org",
      username: "alice",
      token: "secret-token",
      request: {
        name: "adh-reg",
        visibility: "public",
        topics: ["consolidated"],
        defaultBranch: "master",
      },
    });
    expect(mockGitProvider.ensureRemote).toHaveBeenCalledWith({
      projectPath: "/userData/projects/reg",
      remoteName: "origin",
      remoteUrl: "https://gitea.example.org/alice/adh-reg.git",
    });
    expect(ensureProjectGitReady).toHaveBeenCalledWith({
      fileSystem,
      gitProvider: mockGitProvider,
      loadedProject: expect.objectContaining({
        projectPath: "/userData/projects/reg",
      }),
    });
    expect(mockGitProvider.pushCurrentBranch).toHaveBeenCalledWith({
      projectPath: "/userData/projects/reg",
      remoteName: "origin",
      branch: "master",
      auth: {
        username: "alice",
        token: "secret-token",
      },
    });
    await expect(
      readGitRemoteProjectInfo({
        fileSystem,
        storageRoots: roots,
        projectPath: "/userData/projects/reg",
      }),
    ).resolves.toEqual(result.remoteInfo);
    await expect(
      readGitRemoteProjectStatus({
        fileSystem,
        storageRoots: roots,
        projectPath: "/userData/projects/reg",
      }),
    ).resolves.toMatchObject({
      kind: "connected",
    });
  });

  test("cloneWritableRemoteProject reuses the prepared-dir import path after cloning", async () => {
    const remoteRepoProvider = createRemoteRepoProvider();
    projectsService = new DefaultProjectsService({
      fileSystem,
      roots,
      projectIndex,
      md5Service: mockMd5Service,
      gitProvider: mockGitProvider,
      remote: {
        authSessionProvider: createAuthSessionProvider(),
        remoteRepoProvider,
      },
    });
    const importResult = {
      project: {
        folderName: "bho-bible",
        projectPath: "/userData/projects/bho-bible",
        displayName: "Bho Bible",
        projectId: "bho-bible",
        languageCode: "bho",
        languageName: "Bhojpuri",
      },
      gitReady: true,
      isEditableProject: true,
    } satisfies ImportProjectResult;
    const importSpy = vi
      .spyOn(projectsService, "importProject")
      .mockResolvedValueOnce(importResult);

    const result = await projectsService.cloneWritableRemoteProject({
      repo: {
        id: "1",
        owner: "alice",
        name: "bho-bible",
        fullName: "alice/bho-bible",
        htmlUrl: "https://gitea.example.org/alice/bho-bible",
        cloneUrl: "https://gitea.example.org/alice/bho-bible.git",
        defaultBranch: "master",
        topics: ["consolidated"],
        canWrite: true,
      },
    });

    expect(mockGitProvider.cloneRemoteRepo).toHaveBeenCalledWith({
      projectPath: "/userData/projects/bho-bible",
      remoteUrl: "https://gitea.example.org/alice/bho-bible.git",
      branch: "master",
      auth: {
        username: "alice",
        token: "secret-token",
      },
    });
    expect(importSpy).toHaveBeenCalledWith({
      type: "fromPreparedDir",
      directoryPath: "/userData/projects/bho-bible",
    });
    expect(result).toEqual(importResult);
  });

  test("cloneWritableRemoteProject cleans up the cloned directory and remote link on import failure", async () => {
    const remoteRepoProvider = createRemoteRepoProvider();
    projectsService = new DefaultProjectsService({
      fileSystem,
      roots,
      projectIndex,
      md5Service: mockMd5Service,
      gitProvider: mockGitProvider,
      remote: {
        authSessionProvider: createAuthSessionProvider(),
        remoteRepoProvider,
      },
    });
    vi.mocked(mockGitProvider.cloneRemoteRepo).mockImplementationOnce(async ({ projectPath }) => {
      await fileSystem.mkdir(projectPath, { recursive: true });
      return { head: "abc123" };
    });
    const importSpy = vi
      .spyOn(projectsService, "importProject")
      .mockRejectedValueOnce(new Error("Invalid repo structure"));

    await expect(
      projectsService.cloneWritableRemoteProject({
        repo: {
          id: "1",
          owner: "alice",
          name: "bho-bible",
          fullName: "alice/bho-bible",
          htmlUrl: "https://gitea.example.org/alice/bho-bible",
          cloneUrl: "https://gitea.example.org/alice/bho-bible.git",
          defaultBranch: "master",
          topics: ["consolidated"],
          canWrite: true,
        },
      }),
    ).rejects.toThrow("Invalid repo structure");

    expect(importSpy).toHaveBeenCalled();
    await expect(fileSystem.exists("/userData/projects/bho-bible")).resolves.toBe(false);
    await expect(
      readGitRemoteProjectInfo({
        fileSystem,
        storageRoots: roots,
        projectPath: "/userData/projects/bho-bible",
      }),
    ).resolves.toBeNull();
  });

  test("importProject clears stale remote link state for portable imports", async () => {
    await writeGitRemoteProjectInfo({
      fileSystem,
      storageRoots: roots,
      info: {
        schemaVersion: 1,
        projectPath: "/userData/projects/reg",
        hostBaseUrl: "https://gitea.example.org",
        repoId: "1",
        repoOwner: "alice",
        repoName: "reg",
        repoUrl: "https://gitea.example.org/alice/reg",
        trackedBranch: "master",
      },
    });
    await writeGitRemoteProjectStatus({
      fileSystem,
      storageRoots: roots,
      status: createDefaultGitRemoteProjectStatus("/userData/projects/reg"),
    });
    vi.spyOn(projectsService["projectImporter"], "import").mockResolvedValue(
      "/userData/projects/reg",
    );
    vi.spyOn(projectsService, "openEditableProject").mockResolvedValue({
      project: makeOpenedProject(),
    });

    await projectsService.importProject({
      type: "fromZipFile",
      filePath: "/tmp/reg.zip",
    });

    await expect(
      readGitRemoteProjectInfo({
        fileSystem,
        storageRoots: roots,
        projectPath: "/userData/projects/reg",
      }),
    ).resolves.toBeNull();
    await expect(
      readGitRemoteProjectStatus({
        fileSystem,
        storageRoots: roots,
        projectPath: "/userData/projects/reg",
      }),
    ).resolves.toBeNull();
  });

  test("deleteProject removes persisted remote link state", async () => {
    await writeGitRemoteProjectInfo({
      fileSystem,
      storageRoots: roots,
      info: {
        schemaVersion: 1,
        projectPath: "/userData/projects/reg",
        hostBaseUrl: "https://gitea.example.org",
        repoId: "1",
        repoOwner: "alice",
        repoName: "reg",
        repoUrl: "https://gitea.example.org/alice/reg",
        trackedBranch: "master",
      },
    });
    await writeGitRemoteProjectStatus({
      fileSystem,
      storageRoots: roots,
      status: createDefaultGitRemoteProjectStatus("/userData/projects/reg"),
    });

    await projectsService.deleteProject("/userData/projects/reg");

    await expect(
      readGitRemoteProjectInfo({
        fileSystem,
        storageRoots: roots,
        projectPath: "/userData/projects/reg",
      }),
    ).resolves.toBeNull();
    await expect(
      readGitRemoteProjectStatus({
        fileSystem,
        storageRoots: roots,
        projectPath: "/userData/projects/reg",
      }),
    ).resolves.toBeNull();
  });
});
