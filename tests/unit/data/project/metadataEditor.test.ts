import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import { describe, expect, test, vi } from "vitest";

import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import {
  loadMetadataEditorDocument,
  saveMetadataEditorDocument,
} from "@/core/domain/project/metadataEditor.ts";

const mockMd5Service: IMd5Service = {
  calculateMd5: vi.fn(async (text: string) => `md5-${text.length}`),
};

describe("metadataEditor", () => {
  test("loads RC metadata without issues unless requested", async () => {
    const fs = new InMemoryFileSystem({
      "/projects/reg/manifest.yaml": [
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
    });

    const withoutIssues = await loadMetadataEditorDocument({
      fs,
      managedPath: "/projects/reg",
      displayName: "Adhola Bible",
      includeIssues: false,
    });
    const withIssues = await loadMetadataEditorDocument({
      fs,
      managedPath: "/projects/reg",
      displayName: "Adhola Bible",
      includeIssues: true,
    });

    expect(withoutIssues?.issues).toEqual([]);
    expect(withIssues?.issues).toEqual([
      expect.objectContaining({
        code: "missing-project-file",
        currentValue: "./41-MAT.usfm",
      }),
    ]);
  });

  test("prefills broken RC project rows from matching USFM filenames", async () => {
    const fs = new InMemoryFileSystem({
      "/projects/examples/manifest.yaml": [
        "dublin_core:",
        "  identifier: reg",
        "  language:",
        "    identifier: bem",
        "    title: Bemba",
        "    direction: ltr",
        "projects:",
        "  - title: Genesis",
        "    identifier: gen",
        "    sort: 1",
        "    path: ./01-GEN.usfm",
        "    categories: []",
        "  - title: Leviticus",
        "    identifier: lev",
        "    sort: 3",
        "    path: ./03-LEV.usfm",
        "    categories: []",
      ].join("\n"),
      "/projects/examples/01GENBSB.usfm": "\\id GEN\n\\c 1\n",
      "/projects/examples/03LEVBSB.usfm": "\\id LEV\n\\c 1\n",
    });

    const document = await loadMetadataEditorDocument({
      fs,
      managedPath: "/projects/examples",
      displayName: "Examples",
      includeIssues: true,
    });

    expect(document?.draft.kind).toBe("resource-container");
    if (document?.draft.kind !== "resource-container") {
      throw new Error("expected RC draft");
    }

    expect(document.draft.projects).toEqual([
      expect.objectContaining({
        title: "Genesis",
        identifier: "gen",
        sort: "1",
        path: "./01-GEN.usfm",
        suggestedIdentifier: "gen",
        suggestedSort: "1",
        suggestedPath: "./01GENBSB.usfm",
      }),
      expect.objectContaining({
        title: "Leviticus",
        identifier: "lev",
        sort: "3",
        path: "./03-LEV.usfm",
        suggestedIdentifier: "lev",
        suggestedSort: "3",
        suggestedPath: "./03LEVBSB.usfm",
      }),
    ]);
  });

  test("prefers the last embedded canonical code in compact filenames like 52COLBSB.usfm", async () => {
    const fs = new InMemoryFileSystem({
      "/projects/examples/manifest.yaml": [
        "dublin_core:",
        "  identifier: reg",
        "  language:",
        "    identifier: eng",
        "    title: English",
        "    direction: ltr",
        "projects:",
        "  - title: Colossians",
        "    identifier: col",
        "    sort: 52",
        "    path: ./52-COL.usfm",
        "    categories: []",
      ].join("\n"),
      "/projects/examples/52COLBSB.usfm": "\\id COL\n\\c 1\n",
    });

    const document = await loadMetadataEditorDocument({
      fs,
      managedPath: "/projects/examples",
      displayName: "Examples",
      includeIssues: true,
    });

    expect(document?.draft.kind).toBe("resource-container");
    if (document?.draft.kind !== "resource-container") {
      throw new Error("expected RC draft");
    }

    expect(document.draft.projects[0]).toEqual(
      expect.objectContaining({
        identifier: "col",
        suggestedIdentifier: "col",
        suggestedSort: "52",
        suggestedPath: "./52COLBSB.usfm",
      }),
    );
  });

  test("saves RC metadata edits back to manifest.yaml", async () => {
    const fs = new InMemoryFileSystem({
      "/projects/reg/manifest.yaml": [
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
        "    path: ./missing.usfm",
        "    categories: []",
      ].join("\n"),
      "/projects/reg/41-MAT.usfm": "\\id MAT\n\\c 1\n",
    });

    const loaded = await loadMetadataEditorDocument({
      fs,
      managedPath: "/projects/reg",
      displayName: "Adhola Bible",
      includeIssues: true,
    });
    expect(loaded?.draft.kind).toBe("resource-container");

    await saveMetadataEditorDocument({
      fs,
      managedPath: "/projects/reg",
      draft: {
        kind: "resource-container",
        language: {
          direction: "ltr",
          identifier: "adh",
          title: "Adhola",
        },
        description: "Updated description",
        projects: [
          {
            title: "Matthew",
            identifier: "mat",
            sort: "41",
            path: "./41-MAT.usfm",
          },
        ],
      },
      md5Service: mockMd5Service,
      appVersion: "0.1.2",
    });

    const savedManifest = await fs.readText("/projects/reg/manifest.yaml");
    expect(savedManifest).toContain("Updated description");
    expect(savedManifest).toContain("path: ./41-MAT.usfm");
  });

  test("prefers scripture burrito metadata when both metadata.json and manifest.yaml exist", async () => {
    const fs = new InMemoryFileSystem({
      "/projects/mixed/manifest.yaml": [
        "dublin_core:",
        "  identifier: reg",
        "  language:",
        "    identifier: bem",
        "    title: Bemba",
        "    direction: ltr",
        "projects: []",
      ].join("\n"),
      "/projects/mixed/metadata.json": JSON.stringify({
        format: "scripture burrito",
        meta: {
          version: "1.0.0",
          defaultLocale: "en",
          dateCreated: "2026-03-30T15:24:27.6868909+00:00",
        },
        identification: {
          name: { en: "Bible" },
          abbreviation: { en: "Bible" },
        },
        confidential: false,
        languages: [
          {
            tag: "bem",
            name: { en: "Bemba (Zambia)", bem: "Icibemba" },
            scriptDirection: "ltr",
          },
        ],
        ingredients: {},
        localizedNames: {},
        type: {
          flavorType: {
            name: "scripture",
            flavor: {
              name: "textTranslation",
              projectType: "standard",
            },
          },
        },
      }),
    });

    const document = await loadMetadataEditorDocument({
      fs,
      managedPath: "/projects/mixed",
      displayName: "Mixed",
      includeIssues: false,
    });

    expect(document?.draft.kind).toBe("scripture-burrito");
  });
});
