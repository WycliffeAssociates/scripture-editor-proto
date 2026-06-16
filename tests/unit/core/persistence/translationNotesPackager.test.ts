import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { seedEnTnCondensedFixture } from "@tests/helpers/mockData/enTnCondensed.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPackedTranslationNotesBookFileName,
  createPackedTranslationNotesMetadataFileName,
  listPackedTranslationNotesBookCodes,
  packTranslationNotesDirectory,
} from "@/core/library/stores/PackedTranslationNotesRepository.ts";

describe("translation notes packager", () => {
  let fileSystem: InMemoryFileSystem;
  const projectRootPath = "/userData/projects/en_tn_condensed";

  beforeEach(() => {
    fileSystem = new InMemoryFileSystem();
  });

  it("packs raw TN trees into per-book JSON deterministically", async () => {
    await seedEnTnCondensedFixture(fileSystem, projectRootPath);
    const onProgress = vi.fn();

    await packTranslationNotesDirectory({
      fs: fileSystem,
      resourcePath: projectRootPath,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "reshape-resource",
        message: "0/3 books",
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "reshape-resource",
        message: "3/3 books",
      }),
    );
    await expect(
      fileSystem.exists(
        `${projectRootPath}/${createPackedTranslationNotesBookFileName("LUK")}`,
      ),
    ).resolves.toBe(true);
    await expect(
      fileSystem.exists(`${projectRootPath}/luk/22/71.md`),
    ).resolves.toBe(false);
    await expect(
      fileSystem.exists(`${projectRootPath}/manifest.yaml`),
    ).resolves.toBe(true);
    await expect(
      fileSystem.exists(
        `${projectRootPath}/${createPackedTranslationNotesMetadataFileName()}`,
      ),
    ).resolves.toBe(false);
    await expect(
      listPackedTranslationNotesBookCodes({
        fs: fileSystem,
        resourcePath: projectRootPath,
      }),
    ).resolves.toEqual(expect.arrayContaining(["COL", "DAN", "LUK"]));

    const packedLuke = JSON.parse(
      await fileSystem.readText(`${projectRootPath}/luk.json`),
    ) as {
      bookCode: string;
      chapters: Record<string, Record<string, string>>;
    };
    expect(packedLuke.bookCode).toBe("LUK");
    expect(packedLuke.chapters["22"]["71"]).toBe(
      '# Why do we still need a witness?\n\n"We have no further need for witnesses!"\n\n# have heard from his own mouth\n\n"have heard him say it"\n',
    );
  });

  it("persists explicit remote metadata when provided by the import path", async () => {
    await seedEnTnCondensedFixture(fileSystem, projectRootPath);

    await packTranslationNotesDirectory({
      fs: fileSystem,
      resourcePath: projectRootPath,
      remoteSource: {
        kind: "git",
        identifier: "https://example.com/en_tn_condensed.git",
        ref: "main",
        shallowClone: true,
      },
    });

    expect(
      JSON.parse(
        await fileSystem.readText(
          `${projectRootPath}/${createPackedTranslationNotesMetadataFileName()}`,
        ),
      ),
    ).toEqual({
      remoteSource: {
        kind: "git",
        identifier: "https://example.com/en_tn_condensed.git",
        ref: "main",
        shallowClone: true,
      },
    });
  });

  it("cleans up packed output when reshape fails", async () => {
    await seedEnTnCondensedFixture(fileSystem, projectRootPath);
    const writeTextSpy = vi.spyOn(fileSystem, "writeText");
    writeTextSpy.mockImplementation(async (path: string, content: string) => {
      if (path.endsWith(".json")) {
        throw new Error("reshape failed");
      }
      return InMemoryFileSystem.prototype.writeText.call(
        fileSystem,
        path,
        content,
      );
    });

    await expect(
      packTranslationNotesDirectory({
        fs: fileSystem,
        resourcePath: projectRootPath,
      }),
    ).rejects.toThrow("reshape failed");

    expect(fileSystem.files.has(`${projectRootPath}/luk/22/71.md`)).toBe(true);
    expect(
      [...fileSystem.directories].some(
        (path) => path.includes(".packed-") || path.includes(".raw-"),
      ),
    ).toBe(false);
  });
});
