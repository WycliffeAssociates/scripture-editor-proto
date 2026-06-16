import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { seedEnTnCondensedFixture } from "@tests/helpers/mockData/enTnCondensed.ts";
import { beforeEach, describe, expect, test } from "vitest";
import { parse, stringify } from "yaml";

import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import { isRemoteSyncCapable } from "@/core/library/ReferenceItemSupport.ts";
import {
  createPackedTranslationNotesBook,
  createPackedTranslationNotesBookFileName,
  createPackedTranslationNotesMetadataFileName,
} from "@/core/library/stores/PackedTranslationNotesRepository.ts";

describe("ResourceContainerProjectLoader path-based loading", () => {
  let loader: ResourceContainerProjectLoader;
  let fileSystem: InMemoryFileSystem;
  const folderName = "test-rc-id";
  const projectRootPath = `/projects/${folderName}`;
  const sampleManifestYaml = {
    dublin_core: {
      identifier: "test-rc-id",
      title: "My Test Resource Project",
      language: { identifier: "en", title: "English", direction: "ltr" },
    },
    projects: [
      {
        identifier: "2jn",
        title: "2 John",
        path: "./64-2JN.usfm",
        sort: 64,
        categories: [],
      },
    ],
  };

  beforeEach(() => {
    fileSystem = new InMemoryFileSystem();
    loader = new ResourceContainerProjectLoader();
  });

  test("opens a project and exposes books via storage keys", async () => {
    await fileSystem.writeText(
      `${projectRootPath}/manifest.yaml`,
      stringify(sampleManifestYaml),
    );
    await fileSystem.writeText(
      `${projectRootPath}/64-2JN.usfm`,
      "\\id 2JN\n\\c 1\n\\v 1 Elder",
    );

    const project = await loader.openProject({
      fs: fileSystem,
      projectRootPath,
      folderName,
      displayName: "Adhola Bible",
    });

    expect(project).not.toBeNull();
    expect(project?.projectPath).toBe(projectRootPath);
    expect(project?.language).toEqual({
      code: "en",
      name: "English",
      direction: "ltr",
    });
    expect(project?.books).toEqual([
      {
        bookCode: "2JN",
        title: "2 John",
        fileName: "64-2JN.usfm",
        storageKey: "64-2JN.usfm",
        path: `${projectRootPath}/64-2JN.usfm`,
      },
    ]);
    expect(await project?.listBooks()).toEqual([
      {
        bookCode: "2JN",
        title: "2 John",
        fileName: "64-2JN.usfm",
        storageKey: "64-2JN.usfm",
        path: `${projectRootPath}/64-2JN.usfm`,
      },
    ]);

    const book = await project?.getBook("64-2JN.usfm");
    expect(book?.contents).toContain("\\id 2JN");
  });

  test("opens a non-TN resource container as a read-only translation words resource", async () => {
    await fileSystem.writeText(
      `${projectRootPath}/manifest.yaml`,
      stringify({
        dublin_core: {
          identifier: "en_tw",
          title: "English Translation Words",
          language: {
            identifier: "en",
            title: "English",
            direction: "ltr",
          },
        },
        projects: [
          {
            identifier: "faith",
            title: "Faith",
            path: "./kt/faith.md",
            sort: 1,
            categories: [],
          },
        ],
      }),
    );
    await fileSystem.writeText(`${projectRootPath}/kt/faith.md`, "# Faith");

    const resource = await loader.openResource({
      fs: fileSystem,
      projectRootPath,
      folderName,
      displayName: "English Translation Words",
    });

    expect(resource?.descriptor).toEqual(
      expect.objectContaining({
        type: "translationWords",
        readOnly: true,
      }),
    );
    expect(isRemoteSyncCapable(resource)).toBe(false);
    await expect(resource?.listDocuments()).resolves.toEqual([
      {
        id: "kt/faith.md",
        name: "Faith",
        browsePath: ["kt", "faith"],
      },
    ]);
    await expect(
      resource?.readDocument("kt/faith.md" as never),
    ).resolves.toEqual(
      expect.objectContaining({
        contents: "# Faith",
      }),
    );
  });

  test("saveBook writes the USFM file without rewriting manifest.yaml", async () => {
    const manifest = stringify(sampleManifestYaml);
    await fileSystem.writeText(`${projectRootPath}/manifest.yaml`, manifest);
    await fileSystem.writeText(
      `${projectRootPath}/64-2JN.usfm`,
      "old contents",
    );

    const project = await loader.openProject({
      fs: fileSystem,
      projectRootPath,
      folderName,
      displayName: "Adhola Bible",
    });

    await project?.saveBook("64-2JN.usfm", "new contents");

    expect(await fileSystem.readText(`${projectRootPath}/64-2JN.usfm`)).toBe(
      "new contents",
    );
    expect(await fileSystem.readText(`${projectRootPath}/manifest.yaml`)).toBe(
      manifest,
    );
  });

  test("addBook creates a file and updates manifest.yaml", async () => {
    await fileSystem.writeText(
      `${projectRootPath}/manifest.yaml`,
      stringify({
        ...sampleManifestYaml,
        projects: [],
      }),
    );

    const project = await loader.openProject({
      fs: fileSystem,
      projectRootPath,
      folderName,
      displayName: "Adhola Bible",
    });

    const added = await project?.addBook("MAT", {
      localizedBookTitle: "Matthew",
      contents: "\\id MAT\n\\c 1\n\\v 1 In the beginning",
    });

    expect(added).toEqual({
      bookCode: "MAT",
      title: "Matthew",
      fileName: "41-MAT.usfm",
      storageKey: "41-MAT.usfm",
      path: `${projectRootPath}/41-MAT.usfm`,
    });
    expect(
      await fileSystem.readText(`${projectRootPath}/41-MAT.usfm`),
    ).toContain("\\id MAT");

    const updatedManifest = parse(
      await fileSystem.readText(`${projectRootPath}/manifest.yaml`),
    );
    expect(updatedManifest.projects).toHaveLength(1);
    expect(updatedManifest.projects[0].identifier).toBe("mat");
    expect(updatedManifest.projects[0].path).toBe("41-MAT.usfm");
    expect(project?.books).toContainEqual({
      bookCode: "MAT",
      title: "Matthew",
      fileName: "41-MAT.usfm",
      storageKey: "41-MAT.usfm",
      path: `${projectRootPath}/41-MAT.usfm`,
    });
  });

  test("opens the shared en_tn_condensed fixture with representative note files", async () => {
    await seedEnTnCondensedFixture(fileSystem, projectRootPath);

    const resource = await loader.openResource({
      fs: fileSystem,
      projectRootPath,
      folderName,
      displayName: "English Translation Notes Condensed",
    });

    expect(resource).not.toBeNull();
    expect(resource?.descriptor).toEqual({
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
    });
    expect(isRemoteSyncCapable(resource)).toBe(false);
    expect(resource?.remoteSource).toBeUndefined();
    await expect(resource?.listDocuments()).resolves.toEqual([
      {
        id: "dan/12/03.md",
        name: "Daniel",
        browsePath: ["dan", "12", "03"],
      },
      {
        id: "luk/22/71.md",
        name: "Luke",
        browsePath: ["luk", "22", "71"],
      },
      {
        id: "col/01/27.md",
        name: "Colossians",
        browsePath: ["col", "01", "27"],
      },
    ]);
    expect(
      (await resource?.readDocument("col/01/27.md" as never))?.contents,
    ).toContain("the riches of the glory of this mystery");
    expect(
      await fileSystem.readText(`${projectRootPath}/manifest.yaml`),
    ).toContain("en_tn_condensed");
  });

  test("does not expose remote sync capability when source metadata is absent", async () => {
    await fileSystem.writeText(
      `${projectRootPath}/manifest.yaml`,
      stringify(sampleManifestYaml),
    );
    await fileSystem.writeText(
      `${projectRootPath}/64-2JN.usfm`,
      "\\id 2JN\n\\c 1\n\\v 1 Elder",
    );

    const resource = await loader.openResource({
      fs: fileSystem,
      projectRootPath,
      folderName,
      displayName: "Adhola Bible",
    });

    expect(isRemoteSyncCapable(resource)).toBe(false);
    expect(resource?.remoteSource).toBeUndefined();
  });

  test("does not open a TN manifest as a writable Project", async () => {
    await seedEnTnCondensedFixture(fileSystem, projectRootPath);

    await expect(
      loader.openProject({
        fs: fileSystem,
        projectRootPath,
        folderName,
        displayName: "English Translation Notes Condensed",
      }),
    ).resolves.toBeNull();
  });

  test("opens packed TN books as the canonical read-only resource shape", async () => {
    await fileSystem.writeText(
      `${projectRootPath}/manifest.yaml`,
      stringify({
        dublin_core: {
          identifier: "en_tn_condensed",
          title: "English Translation Notes Condensed",
          language: {
            identifier: "en",
            title: "English",
            direction: "ltr",
          },
        },
        projects: [],
      }),
    );
    await fileSystem.writeText(
      `${projectRootPath}/${createPackedTranslationNotesMetadataFileName()}`,
      JSON.stringify({
        remoteSource: {
          kind: "git",
          identifier: "https://example.com/en_tn_condensed.git",
          ref: "main",
          shallowClone: true,
        },
      }),
    );
    for (const [bookCode, chapter, verse, body] of [
      ["LUK", "22", "71", '"We have no further need for witnesses!"'],
      ["COL", "1", "27", "the riches of the glory of this mystery"],
    ] as const) {
      await fileSystem.writeText(
        `${projectRootPath}/${createPackedTranslationNotesBookFileName(
          bookCode,
        )}`,
        JSON.stringify(
          createPackedTranslationNotesBook({
            bookCode,
            chapters: {
              [chapter]: {
                [verse]: body,
              },
            },
          }),
          null,
          2,
        ),
      );
    }

    const resource = await loader.openResource({
      fs: fileSystem,
      projectRootPath,
      folderName,
      displayName: "English Translation Notes Condensed",
    });

    expect(resource).not.toBeNull();
    expect(resource?.descriptor.type).toBe("translationNotes");
    expect(resource?.descriptor.readOnly).toBe(true);
    expect(isRemoteSyncCapable(resource)).toBe(true);
    expect(resource?.remoteSource).toEqual({
      kind: "git",
      identifier: "https://example.com/en_tn_condensed.git",
      ref: "main",
      shallowClone: true,
    });
    await expect(resource?.listDocuments()).resolves.toEqual([
      {
        id: "luk.json",
        name: "LUK",
        browsePath: ["LUK"],
      },
      {
        id: "col.json",
        name: "COL",
        browsePath: ["COL"],
      },
    ]);
    await expect(resource?.readDocument("luk.json" as never)).resolves.toEqual(
      expect.objectContaining({
        id: "luk.json",
        name: "LUK",
        contents: expect.stringContaining('"bookCode": "LUK"'),
      }),
    );
    await expect(
      loader.openProject({
        fs: fileSystem,
        projectRootPath,
        folderName,
        displayName: "English Translation Notes Condensed",
      }),
    ).resolves.toBeNull();
  });
});
