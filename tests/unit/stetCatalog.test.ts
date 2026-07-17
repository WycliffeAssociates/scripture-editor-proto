import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeStetSid,
  parseStetCatalog,
  StetCatalogError,
} from "@/app/domain/stet/stetCatalog.ts";

// "In the beginning God created the heavens and the earth." → "God" at [17, 20).
const GEN_1_1 = "In the beginning God created the heavens and the earth.";

function validRaw(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    locale: "en",
    reference: {
      provenanceId: "sha123",
      displayName: "English ULB (en_ulb)",
      sourceUrl: "https://example/en_ulb/archive/sha123.zip",
    },
    referenceVerses: {
      "GEN 1:1": GEN_1_1,
      "JHN 1:1": "In the beginning was the Word.",
    },
    terms: [
      {
        term: "God",
        englishTerm: "God",
        strongs: [430],
        definition: "The creator.\n\nParagraph two.",
        subsetVerses: [{ ref: "GEN 1:1" }],
        exhaustiveVerses: ["GEN 1:1", "JHN 1:1"],
        glosses: ["God", "god", " God ", ""],
        glossRanges: { "GEN 1:1": [[17, 20]] },
      },
    ],
  };
}

describe("normalizeStetSid", () => {
  it("accepts canonical single-verse SIDs and rejects the rest", () => {
    expect(normalizeStetSid("GEN 1:1")).toBe("GEN 1:1");
    expect(normalizeStetSid(" gen 1:1 ")).toBe("GEN 1:1");
    expect(normalizeStetSid("MAT 1:1-3")).toBeNull(); // range
    expect(normalizeStetSid("GEN 1")).toBeNull(); // chapter-only
    expect(normalizeStetSid("ZZZ 1:1")).toBeNull(); // unknown book
    expect(normalizeStetSid("GEN 0:1")).toBeNull(); // zero chapter
    expect(normalizeStetSid("GEN 1:0")).toBeNull(); // zero verse
    expect(normalizeStetSid(42)).toBeNull();
  });
});

describe("parseStetCatalog — valid envelope", () => {
  it("normalizes terms, dedupes glosses, and preserves provenance", () => {
    const { catalog, warnings } = parseStetCatalog(validRaw());
    expect(warnings).toEqual([]);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.locale).toBe("en");
    expect(catalog.reference.provenanceId).toBe("sha123");
    expect(catalog.reference.displayName).toBe("English ULB (en_ulb)");
    expect(catalog.terms).toHaveLength(1);
    // Glosses trimmed, empty dropped, case-insensitively deduped.
    expect(catalog.terms[0]?.glosses).toEqual(["God"]);
    expect(catalog.terms[0]?.glossRanges["GEN 1:1"]).toEqual([[17, 20]]);
    expect(Object.keys(catalog.referenceVerses)).toContain("GEN 1:1");
  });
});

describe("parseStetCatalog — shipped en fixture", () => {
  it("parses the committed English catalog cleanly", () => {
    const raw: unknown = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/stet/en.json"), "utf8"),
    );
    const { catalog, warnings } = parseStetCatalog(raw);
    expect(warnings).toEqual([]);
    expect(catalog.locale).toBe("en");
    expect(catalog.terms).toHaveLength(102);
    expect(catalog.reference.provenanceId).toBe(
      "8baaf2076f7813ac7ab5f3e7988627ec0f9d91dc",
    );
    // Every gloss range key resolves to an in-bounds slice of its verse text.
    for (const term of catalog.terms) {
      for (const [sid, ranges] of Object.entries(term.glossRanges)) {
        const text = catalog.referenceVerses[sid];
        expect(typeof text).toBe("string");
        for (const [start, end] of ranges) {
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeLessThanOrEqual(text.length);
          expect(start).toBeLessThan(end);
        }
      }
    }
  });
});

describe("parseStetCatalog — fatal envelope errors", () => {
  it("throws on unusable envelopes", () => {
    expect(() => parseStetCatalog(null)).toThrow(StetCatalogError);
    expect(() => parseStetCatalog({ ...validRaw(), schemaVersion: 2 })).toThrow(
      StetCatalogError,
    );
    const noLocale = validRaw();
    delete noLocale.locale;
    expect(() => parseStetCatalog(noLocale)).toThrow(StetCatalogError);
    const noRef = validRaw();
    delete noRef.reference;
    expect(() => parseStetCatalog(noRef)).toThrow(StetCatalogError);
    const badRefVerses = { ...validRaw(), referenceVerses: [] };
    expect(() => parseStetCatalog(badRefVerses)).toThrow(StetCatalogError);
    const noTerms = { ...validRaw(), terms: "nope" };
    expect(() => parseStetCatalog(noTerms)).toThrow(StetCatalogError);
    const noProvenance = validRaw();
    (noProvenance.reference as Record<string, unknown>).provenanceId = "";
    expect(() => parseStetCatalog(noProvenance)).toThrow(StetCatalogError);
  });
});

describe("parseStetCatalog — non-fatal term/reference issues", () => {
  it("drops a malformed term and reports it, keeping the rest", () => {
    const raw = validRaw();
    (raw.terms as unknown[]).unshift({ term: "" }); // no term → dropped
    const { catalog, warnings } = parseStetCatalog(raw);
    expect(catalog.terms).toHaveLength(1);
    expect(catalog.terms[0]?.term).toBe("God");
    expect(warnings.some((w) => w.includes("term[0]"))).toBe(true);
  });

  it("drops invalid reference-verse keys and invalid term SIDs", () => {
    const raw = validRaw();
    (raw.referenceVerses as Record<string, unknown>)["GEN 1"] = "chapter only";
    (raw.terms as Array<Record<string, unknown>>)[0].subsetVerses = [
      { ref: "GEN 1:1" },
      { ref: "MAT 1:1-3" }, // range → dropped
      { ref: "GEN 1:1" }, // duplicate → collapsed
    ];
    const { catalog, warnings } = parseStetCatalog(raw);
    expect(Object.keys(catalog.referenceVerses)).not.toContain("GEN 1");
    expect(catalog.terms[0]?.subsetVerses.map((v) => v.ref)).toEqual([
      "GEN 1:1",
    ]);
    expect(warnings.some((w) => w.includes("GEN 1"))).toBe(true);
  });

  it("keeps in-bounds ordered ranges and drops overlapping/out-of-bounds ones", () => {
    const raw = validRaw();
    (raw.terms as Array<Record<string, unknown>>)[0].glossRanges = {
      "GEN 1:1": [
        [0, 2],
        [3, 5],
        [4, 6], // overlaps previous → dropped
        [100, 110], // out of bounds → dropped
        [8, 7], // start >= end → dropped
      ],
    };
    const { catalog } = parseStetCatalog(raw);
    expect(catalog.terms[0]?.glossRanges["GEN 1:1"]).toEqual([
      [0, 2],
      [3, 5],
    ]);
  });

  it("rejects an unsupported locale", () => {
    expect(() => parseStetCatalog({ ...validRaw(), locale: "bogus" })).toThrow(
      StetCatalogError,
    );
  });

  it("drops a term missing required fields and reports it (not defaulted)", () => {
    const raw = validRaw();
    (raw.terms as unknown[]).push({
      term: "Bare",
      subsetVerses: [{ ref: "GEN 1:1" }],
      exhaustiveVerses: [],
      glossRanges: {},
    });
    const { catalog, warnings } = parseStetCatalog(raw);
    // Missing englishTerm/definition/strongs/glosses → omitted, not fabricated.
    expect(catalog.terms.map((term) => term.term)).not.toContain("Bare");
    expect(
      warnings.some(
        (w) => w.includes('"Bare" dropped') && w.includes("englishTerm"),
      ),
    ).toBe(true);
  });

  it("warns when a term's subset/exhaustive refs or ranges are dropped", () => {
    const raw = validRaw();
    (raw.terms as Array<Record<string, unknown>>)[0].exhaustiveVerses = [
      "GEN 1:1",
      "MAT 1:1-3", // range → invalid → dropped + warned
    ];
    const { warnings } = parseStetCatalog(raw);
    expect(
      warnings.some((w) => w.includes("dropped 1 invalid exhaustive ref")),
    ).toBe(true);
  });

  it("warns on duplicate term labels but keeps both", () => {
    const raw = validRaw();
    (raw.terms as unknown[]).push({
      term: "God",
      englishTerm: "God",
      strongs: [430],
      definition: "Another God entry.",
      subsetVerses: [{ ref: "JHN 1:1" }],
      exhaustiveVerses: [],
      glosses: [],
      glossRanges: {},
    });
    const { catalog, warnings } = parseStetCatalog(raw);
    expect(catalog.terms.filter((term) => term.term === "God")).toHaveLength(2);
    expect(warnings.some((w) => w.includes("duplicate term label"))).toBe(true);
  });
});
