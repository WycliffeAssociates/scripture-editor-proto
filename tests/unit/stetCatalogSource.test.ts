import { afterEach, describe, expect, it, vi } from "vitest";

import { StetCatalogError } from "@/app/domain/stet/stetCatalog.ts";
import { PublicStetCatalogSource } from "@/app/domain/stet/StetCatalogSource.ts";

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

function catalogFixture(
  overrides: {
    locale?: string;
    provenanceId?: string;
  } = {},
) {
  return {
    schemaVersion: 1,
    locale: overrides.locale ?? "en",
    reference: {
      provenanceId: overrides.provenanceId ?? "sha1",
      displayName: "English ULB (en_ulb)",
    },
    referenceVerses: { "GEN 1:1": "In the beginning." },
    terms: [
      {
        term: "God",
        englishTerm: "God",
        strongs: [430],
        definition: "The creator.",
        subsetVerses: [{ ref: "GEN 1:1" }],
        exhaustiveVerses: [],
        glosses: [],
        glossRanges: {},
      },
    ],
  };
}

const MANIFEST = {
  schemaVersion: 1,
  guides: [
    {
      locale: "en",
      displayName: "English ULB (en_ulb)",
      provenanceId: "sha1",
      file: "en.json",
    },
  ],
};

const EN_REF = {
  locale: "en",
  displayName: "English ULB (en_ulb)",
  provenanceId: "sha1",
  url: "/stet/en.json",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublicStetCatalogSource.listGuides", () => {
  it("maps the manifest to guide refs with resolved urls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(MANIFEST)),
    );
    const guides = await new PublicStetCatalogSource().listGuides(
      new AbortController().signal,
    );
    expect(guides).toEqual([
      {
        locale: "en",
        displayName: "English ULB (en_ulb)",
        provenanceId: "sha1",
        url: "/stet/en.json",
      },
    ]);
  });

  it("throws on an invalid manifest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ nope: true })),
    );
    await expect(
      new PublicStetCatalogSource().listGuides(new AbortController().signal),
    ).rejects.toBeInstanceOf(StetCatalogError);
  });
});

describe("PublicStetCatalogSource.loadCatalog", () => {
  it("returns the catalog when it matches the manifest ref", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(catalogFixture())),
    );
    const catalog = await new PublicStetCatalogSource().loadCatalog(
      EN_REF,
      new AbortController().signal,
    );
    expect(catalog.locale).toBe("en");
    expect(catalog.reference.provenanceId).toBe("sha1");
  });

  it("rejects a provenance mismatch against the ref (cache-key integrity)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(catalogFixture({ provenanceId: "sha2" }))),
    );
    await expect(
      new PublicStetCatalogSource().loadCatalog(
        EN_REF,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(StetCatalogError);
  });

  it("rejects a locale mismatch against the ref", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(catalogFixture({ locale: "es-419" }))),
    );
    await expect(
      new PublicStetCatalogSource().loadCatalog(
        EN_REF,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(StetCatalogError);
  });
});
