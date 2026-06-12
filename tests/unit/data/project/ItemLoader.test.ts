import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import { ScriptureBurritoProjectLoader } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import type { LibraryItem } from "@/core/library/LibraryItem.ts";
import type { LoadedReferenceItem } from "@/core/library/LoadedReferenceItem.ts";
import { createReferenceDocumentId } from "@/core/library/ReferenceDocuments.ts";
import { ItemLoader } from "@/core/loading/ItemLoader.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

const mockMd5Service: IMd5Service = {
  calculateMd5: vi.fn(() => Promise.resolve("mock-md5-checksum")),
};

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    folderName: "reg",
    displayName: "Adhola Bible",
    projectPath: "/projects/reg",
    projectId: "reg",
    projectType: "scripture-burrito",
    language: {
      code: "adh",
      name: "Adhola",
      direction: "ltr",
    },
    books: [],
    listBooks: async () => [],
    getBook: async () => ({
      bookCode: "GEN",
      title: "Genesis",
      fileName: "01-GEN.usfm",
      storageKey: "01-GEN.usfm",
      path: "/projects/reg/01-GEN.usfm",
      contents: "",
    }),
    saveBook: async () => {},
    addBook: async () => ({
      bookCode: "GEN",
      title: "Genesis",
      fileName: "01-GEN.usfm",
      storageKey: "01-GEN.usfm",
      path: "/projects/reg/01-GEN.usfm",
    }),
    listVersions: async () => [],
    restoreVersion: async () => {},
    stageAndCommit: async () => ({ hash: "abc123" }),
    ...overrides,
  };
}

function makeTranslationNotesResource(): LoadedReferenceItem {
  return {
    folderName: "en_tn_condensed",
    displayName: "English Translation Notes Condensed",
    managedPath: "/projects/en_tn_condensed",
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
        id: createReferenceDocumentId("luk.json"),
        name: "LUK",
      },
    ],
    readDocument: async () => ({
      id: createReferenceDocumentId("luk.json"),
      name: "LUK",
      contents: JSON.stringify({
        bookCode: "LUK",
        chapters: [
          {
            chapterNumber: 22,
            verses: [
              {
                verseNumber: 71,
                rawMarkdown: "# Luke 22:71",
              },
            ],
          },
        ],
      }),
    }),
  };
}

describe("ItemLoader", () => {
  let fileSystem: InMemoryFileSystem;
  let itemLoader: ItemLoader;

  beforeEach(() => {
    vi.restoreAllMocks();
    fileSystem = new InMemoryFileSystem();
    itemLoader = new ItemLoader(mockMd5Service);
  });

  test("prefers scripture burrito when metadata.json exists", async () => {
    const openProjectSpy = vi
      .spyOn(ScriptureBurritoProjectLoader.prototype, "openProject")
      .mockResolvedValueOnce(makeProject());
    const rcProjectSpy = vi.spyOn(
      ResourceContainerProjectLoader.prototype,
      "openProject",
    );
    await fileSystem.writeText("/projects/reg/metadata.json", "{}");
    await fileSystem.writeText("/projects/reg/manifest.yaml", "projects: []");

    const loadedItem = await itemLoader.openItem({
      fs: fileSystem,
      managedPath: "/projects/reg",
      displayName: "Adhola Bible",
    });

    expect(openProjectSpy).toHaveBeenCalledWith({
      fs: fileSystem,
      projectRootPath: "/projects/reg",
      folderName: "reg",
      displayName: "Adhola Bible",
    });
    expect(rcProjectSpy).not.toHaveBeenCalled();
    expect(loadedItem).toMatchObject({
      type: "usfmScripture",
      displayName: "Adhola Bible",
    });
  });

  test("falls back to resource container when only manifest exists", async () => {
    const openProjectSpy = vi
      .spyOn(ResourceContainerProjectLoader.prototype, "openProject")
      .mockResolvedValueOnce(
        makeProject({ projectType: "resource-container" }),
      );
    const sbProjectSpy = vi.spyOn(
      ScriptureBurritoProjectLoader.prototype,
      "openProject",
    );
    await fileSystem.writeText("/projects/reg/manifest.yaml", "projects: []");

    const loadedItem = await itemLoader.openItem({
      fs: fileSystem,
      managedPath: "/projects/reg",
      displayName: "Adhola Bible",
    });

    expect(openProjectSpy).toHaveBeenCalledWith({
      fs: fileSystem,
      projectRootPath: "/projects/reg",
      folderName: "reg",
      displayName: "Adhola Bible",
    });
    expect(sbProjectSpy).not.toHaveBeenCalled();
    expect(loadedItem).toMatchObject({
      type: "usfmScripture",
      containerFormat: "resource-container",
    });
  });

  test("returns null when no recognized metadata exists", async () => {
    const loadedItem = await itemLoader.openItem({
      fs: fileSystem,
      managedPath: "/projects/reg",
      displayName: "Adhola Bible",
    });

    expect(loadedItem).toBeNull();
  });

  test("returns a translation notes noun for non-scripture resources", async () => {
    vi.spyOn(
      ScriptureBurritoProjectLoader.prototype,
      "openProject",
    ).mockResolvedValueOnce(null);
    vi.spyOn(
      ScriptureBurritoProjectLoader.prototype,
      "openResource",
    ).mockResolvedValueOnce(makeTranslationNotesResource() as never);
    await fileSystem.writeText("/projects/en_tn_condensed/metadata.json", "{}");

    const loadedItem = (await itemLoader.openItem({
      fs: fileSystem,
      managedPath: "/projects/en_tn_condensed",
      displayName: "English Translation Notes Condensed",
    })) as LibraryItem | null;

    expect(loadedItem).toMatchObject({
      type: "translationNotes",
      displayName: "English Translation Notes Condensed",
    });
  });
});
