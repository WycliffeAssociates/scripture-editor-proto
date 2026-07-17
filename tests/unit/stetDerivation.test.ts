import { describe, expect, it } from "vitest";

import type { StetTerm } from "@/app/domain/stet/stetCatalog.ts";
import {
  buildStetRows,
  computeCoverage,
  formatStetDefinition,
  resolveTermVerseSet,
} from "@/app/domain/stet/stetDerivation.ts";

function makeTerm(overrides: Partial<StetTerm> = {}): StetTerm {
  return {
    term: "Grace",
    englishTerm: "Grace",
    strongs: [5485],
    definition: "Unmerited favor.",
    subsetVerses: [{ ref: "JHN 1:1" }],
    exhaustiveVerses: ["GEN 1:1", "JHN 1:1"],
    glosses: ["grace"],
    glossRanges: {},
    ...overrides,
  };
}

describe("resolveTermVerseSet", () => {
  it("adds exhaustive verses to curated (union, never replacement)", () => {
    const set = resolveTermVerseSet(makeTerm(), true);
    // JHN is curated; GEN is the only added exhaustive.
    expect(set.curatedSids).toEqual(["JHN 1:1"]);
    expect(set.addedExhaustiveSids).toEqual(["GEN 1:1"]);
    expect(set.hasExhaustiveExtra).toBe(true);
    // Expanded union in canonical order: GEN before JHN.
    expect(set.visibleSids).toEqual(["GEN 1:1", "JHN 1:1"]);
    expect(set.designatedCount).toBe(2);
  });

  it("shows only curated verses collapsed, still canonically ordered", () => {
    const term = makeTerm({
      subsetVerses: [{ ref: "JHN 1:1" }, { ref: "GEN 1:1" }],
      exhaustiveVerses: ["JHN 1:1"],
    });
    const set = resolveTermVerseSet(term, false);
    expect(set.visibleSids).toEqual(["GEN 1:1", "JHN 1:1"]);
    expect(set.hasExhaustiveExtra).toBe(false);
    expect(set.designatedCount).toBe(2);
  });
});

describe("buildStetRows", () => {
  const referenceVerses = {
    "GEN 1:1": "In the beginning God created the heavens and the earth.",
    "JHN 1:1": "In the beginning was the Word.",
  };

  it("preserves rows with missing GL or HL text and marks their absence", () => {
    const term = makeTerm({
      subsetVerses: [{ ref: "GEN 1:1" }, { ref: "MAT 1:1" }],
      exhaustiveVerses: [],
      glossRanges: { "GEN 1:1": [[17, 20]] },
    });
    const targetLookup = new Map<string, string>([
      ["GEN 1:1", "HL Genesis text"],
    ]);

    const rows = buildStetRows({
      term,
      showExhaustive: false,
      referenceVerses,
      targetLookup,
    });
    expect(rows.map((r) => r.sid)).toEqual(["GEN 1:1", "MAT 1:1"]);

    const gen = rows[0];
    expect(gen?.hasSource).toBe(true);
    expect(gen?.hasTarget).toBe(true);
    expect(gen?.ranges).toEqual([[17, 20]]);

    // MAT 1:1 is not in the snapshot and not in the project → preserved, empty.
    const mat = rows[1];
    expect(mat?.sourceText).toBeNull();
    expect(mat?.hasSource).toBe(false);
    expect(mat?.targetText).toBe("");
    expect(mat?.hasTarget).toBe(false);
    expect(mat?.ranges).toEqual([]);
  });

  it("computes coverage as present-HL over designated", () => {
    const term = makeTerm({
      subsetVerses: [{ ref: "GEN 1:1" }, { ref: "JHN 1:1" }],
      exhaustiveVerses: [],
    });
    const targetLookup = new Map<string, string>([["GEN 1:1", "present"]]);
    const rows = buildStetRows({
      term,
      showExhaustive: false,
      referenceVerses,
      targetLookup,
    });
    expect(computeCoverage(rows)).toEqual({
      presentTargetCount: 1,
      designatedCount: 2,
    });
  });
});

describe("formatStetDefinition", () => {
  it("splits on newline boundaries, trims, and omits empties", () => {
    expect(formatStetDefinition("A\n\nB\nC")).toEqual(["A", "B", "C"]);
    expect(formatStetDefinition("  only  ")).toEqual(["only"]);
    expect(formatStetDefinition("\n\n   \n")).toEqual([]);
  });
});
