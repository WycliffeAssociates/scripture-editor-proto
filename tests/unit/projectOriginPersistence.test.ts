import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { describe, expect, it } from "vitest";

import { toProjectStorageKey } from "@/core/persistence/gitRemotePaths.ts";
import {
  deriveOriginFromImportSource,
  normalizeOriginUrl,
  PROJECT_ORIGIN_SCHEMA_VERSION,
  parseProjectOrigin,
} from "@/core/persistence/projectOriginModels.ts";
import {
  getProjectOriginPath,
  getProjectOriginStateRoot,
} from "@/core/persistence/projectOriginPaths.ts";
import {
  deleteProjectOrigin,
  readProjectOrigin,
  writeProjectOrigin,
} from "@/core/persistence/projectOriginStore.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

const storageRoots: StorageRoots = {
  appDataRoot: "/appData",
  projectsRoot: "/userData/projects",
  tempRoot: "/appData/temp",
  cacheRoot: "/appData/cache",
  logsRoot: "/appData/logs",
  databaseRoot: "/appData/database",
};

describe("project origin path helpers", () => {
  it("stores origin records beneath their own app-data root", () => {
    expect(getProjectOriginStateRoot(storageRoots)).toBe(
      "/appData/project-origin",
    );
    expect(getProjectOriginPath(storageRoots, "/userData/projects/foo")).toBe(
      `/appData/project-origin/${toProjectStorageKey("/userData/projects/foo")}.json`,
    );
  });
});

describe("deriveOriginFromImportSource", () => {
  it("derives a remote origin from a catalog archive URL", () => {
    const origin = deriveOriginFromImportSource(
      {
        type: "fromGitRepo",
        url: "https://content.bibletranslationtools.org/WA-Catalog/en_ulb/archive/master.zip",
      },
      "/userData/projects/en_ulb",
    );
    expect(origin).toEqual({
      schemaVersion: PROJECT_ORIGIN_SCHEMA_VERSION,
      projectPath: "/userData/projects/en_ulb",
      kind: "remote",
      url: "https://content.bibletranslationtools.org/wa-catalog/en_ulb",
      owner: "wa-catalog",
      name: "en_ulb",
    });
  });

  it("records folder and zip imports as local with no upstream", () => {
    expect(
      deriveOriginFromImportSource(
        { type: "fromDir", directoryPath: "/somewhere/proj" },
        "/userData/projects/proj",
      ),
    ).toMatchObject({ kind: "local", source: "folder" });
    expect(
      deriveOriginFromImportSource(
        { type: "fromZipFile", filePath: "/somewhere/proj.zip" },
        "/userData/projects/proj",
      ),
    ).toMatchObject({ kind: "local", source: "zip" });
  });

  it("yields no origin for a prepared-dir continuation (already stamped)", () => {
    expect(
      deriveOriginFromImportSource(
        { type: "fromPreparedDir", directoryPath: "/userData/projects/proj" },
        "/userData/projects/proj",
      ),
    ).toBeNull();
  });
});

describe("normalizeOriginUrl", () => {
  it("strips archive suffix, .git, trailing slash, and lowercases", () => {
    const base = "https://example.org/wa-catalog/en_ulb";
    expect(
      normalizeOriginUrl(
        "https://example.org/WA-Catalog/en_ulb/archive/main.zip",
      ),
    ).toBe(base);
    expect(
      normalizeOriginUrl("https://example.org/WA-Catalog/en_ulb.git"),
    ).toBe(base);
    expect(normalizeOriginUrl("https://example.org/WA-Catalog/en_ulb/")).toBe(
      base,
    );
  });
});

describe("project origin store round-trip", () => {
  it("writes, reads back, and deletes a remote origin", async () => {
    const fileSystem = new InMemoryFileSystem();
    const origin = deriveOriginFromImportSource(
      {
        type: "fromGitRepo",
        url: "https://content.bibletranslationtools.org/WA-Catalog/en_ulb/archive/master.zip",
      },
      "/userData/projects/en_ulb",
    );
    if (!origin) throw new Error("expected an origin");

    await writeProjectOrigin({ fileSystem, storageRoots, origin });
    const read = await readProjectOrigin({
      fileSystem,
      storageRoots,
      projectPath: "/userData/projects/en_ulb",
    });
    expect(read).toEqual(origin);

    await deleteProjectOrigin({
      fileSystem,
      storageRoots,
      projectPath: "/userData/projects/en_ulb",
    });
    expect(
      await readProjectOrigin({
        fileSystem,
        storageRoots,
        projectPath: "/userData/projects/en_ulb",
      }),
    ).toBeNull();
  });

  it("parses a persisted record back into the union", () => {
    const record = {
      schemaVersion: PROJECT_ORIGIN_SCHEMA_VERSION,
      projectPath: "/userData/projects/proj",
      kind: "local" as const,
      source: "zip" as const,
    };
    expect(parseProjectOrigin(record)).toEqual(record);
  });
});
