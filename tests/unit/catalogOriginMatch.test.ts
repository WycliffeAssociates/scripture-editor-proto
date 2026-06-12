import { describe, expect, it } from "vitest";

import {
  catalogRepoAlreadyImported,
  originMatchesCatalogRepo,
  selectWaCatalogRepos,
  WA_CATALOG_USERNAME,
} from "@/app/domain/project/catalogOriginMatch.ts";
import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import type { ProjectOrigin } from "@/core/persistence/projectOriginModels.ts";

function repo(overrides: Partial<ConsolidatedRepo> = {}): ConsolidatedRepo {
  const repo_name = overrides.repo_name ?? "en_ulb";
  return {
    language_ietf: "en",
    language_name: "English",
    language_english_name: "English",
    repo_url: `https://content.bibletranslationtools.org/WA-Catalog/${repo_name}`,
    repo_name,
    username: "WA-Catalog",
    title: "English ULB",
    ...overrides,
  };
}

describe("selectWaCatalogRepos", () => {
  it("keeps only WA-Catalog rows, case-insensitively", () => {
    const rows = [
      repo({ username: "WA-Catalog" }),
      repo({ username: "wa-catalog", repo_name: "en_ust" }),
      repo({ username: "someone-else", repo_name: "en_fork" }),
    ];
    const kept = selectWaCatalogRepos(rows);
    expect(kept.map((r) => r.repo_name)).toEqual(["en_ulb", "en_ust"]);
  });

  it("uses the lowercased catalog owner constant", () => {
    expect(WA_CATALOG_USERNAME).toBe("wa-catalog");
  });
});

describe("originMatchesCatalogRepo", () => {
  it("matches a remote origin by normalized base URL (archive suffix ignored)", () => {
    const origin: ProjectOrigin = {
      schemaVersion: 1,
      projectPath: "/userData/projects/en_ulb",
      kind: "remote",
      url: "https://content.bibletranslationtools.org/wa-catalog/en_ulb",
      owner: "wa-catalog",
      name: "en_ulb",
    };
    expect(originMatchesCatalogRepo(origin, repo())).toBe(true);
  });

  it("falls back to owner/name when the URL host differs (pasted link)", () => {
    const origin: ProjectOrigin = {
      schemaVersion: 1,
      projectPath: "/userData/projects/en_ulb",
      kind: "remote",
      url: "https://git.example.org/WA-Catalog/en_ulb",
      owner: "WA-Catalog",
      name: "en_ulb",
    };
    expect(originMatchesCatalogRepo(origin, repo())).toBe(true);
  });

  it("does not match a different repo", () => {
    const origin: ProjectOrigin = {
      schemaVersion: 1,
      projectPath: "/userData/projects/en_ust",
      kind: "remote",
      url: "https://content.bibletranslationtools.org/wa-catalog/en_ust",
      owner: "wa-catalog",
      name: "en_ust",
    };
    expect(originMatchesCatalogRepo(origin, repo())).toBe(false);
  });

  it("never matches a local origin", () => {
    const origin: ProjectOrigin = {
      schemaVersion: 1,
      projectPath: "/userData/projects/en_ulb",
      kind: "local",
      source: "folder",
    };
    expect(originMatchesCatalogRepo(origin, repo())).toBe(false);
  });
});

describe("catalogRepoAlreadyImported", () => {
  it("is true when any origin in the set matches", () => {
    const origins: ProjectOrigin[] = [
      { schemaVersion: 1, projectPath: "/a", kind: "local", source: "zip" },
      {
        schemaVersion: 1,
        projectPath: "/b",
        kind: "remote",
        url: "https://content.bibletranslationtools.org/wa-catalog/en_ulb",
        owner: "wa-catalog",
        name: "en_ulb",
      },
    ];
    expect(catalogRepoAlreadyImported(repo(), origins)).toBe(true);
    expect(
      catalogRepoAlreadyImported(repo({ repo_name: "en_ust" }), origins),
    ).toBe(false);
  });
});
