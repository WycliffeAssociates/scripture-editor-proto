import { describe, expect, it } from "vitest";

import {
  chapterLabelStem,
  findChapterLabelEntries,
  tallyChapterLabels,
} from "@/app/domain/editor/annotations/chapterLabelTally.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

let nextId = 0;
function tok(kind: Token["kind"], source: string, marker?: string): Token {
  nextId += 1;
  return { id: `t${nextId}`, kind, source, marker } as Token;
}

/** `\cl <label>` as the editor's flat stream emits it: a marker then a text. */
function cl(label: string): Token[] {
  return [tok("marker", "\\cl", "cl"), tok("text", label)];
}

describe("chapterLabelStem", () => {
  it("strips the chapter number, keeping the stem", () => {
    expect(chapterLabelStem("Marika 14")).toBe("Marika");
    expect(chapterLabelStem("Chapter 4")).toBe("Chapter");
    expect(chapterLabelStem("  Psalm 119 ")).toBe("Psalm");
  });

  it("keeps a label that has no number", () => {
    expect(chapterLabelStem("Wase")).toBe("Wase");
  });

  it("is empty when the label starts with a digit", () => {
    // onion drops these before tallying — a label with no alphabetic stem
    // carries no standardization signal.
    expect(chapterLabelStem("12 foo")).toBe("");
    expect(chapterLabelStem("")).toBe("");
  });
});

describe("findChapterLabelEntries", () => {
  it("pairs each \\cl marker with its next text token", () => {
    const tokens = [
      tok("marker", "\\c", "c"),
      tok("number", "1"),
      ...cl("Wase 1"),
      ...cl("Marika 2"),
    ];
    const entries = findChapterLabelEntries(tokens);
    expect(entries.map((e) => e.stem)).toEqual(["Wase", "Marika"]);
    expect(entries.map((e) => e.text)).toEqual(["Wase 1", "Marika 2"]);
    expect(entries.every((e) => typeof e.textTokenId === "string")).toBe(true);
  });

  it("skips intervening non-text tokens to find the label", () => {
    const tokens = [
      tok("marker", "\\cl", "cl"),
      tok("newline", "\n"),
      tok("text", "Wase 3"),
    ];
    expect(findChapterLabelEntries(tokens)[0]?.stem).toBe("Wase");
  });

  it("ignores a \\cl with no following text, and empty-stem labels", () => {
    const tokens = [
      ...cl("99"), // empty stem -> dropped
      tok("marker", "\\cl", "cl"), // no following text -> dropped
    ];
    expect(findChapterLabelEntries(tokens)).toEqual([]);
  });
});

describe("tallyChapterLabels", () => {
  it("counts stems and picks the most-used as dominant", () => {
    const tokens = [...cl("Wase 1"), ...cl("Wase 2"), ...cl("Marika 3")];
    const tally = tallyChapterLabels(findChapterLabelEntries(tokens));
    expect(tally.dominant).toBe("Wase");
    expect(tally.counts).toEqual([
      { stem: "Wase", count: 2 },
      { stem: "Marika", count: 1 },
    ]);
  });

  it("breaks dominance ties toward the lexicographically-largest stem", () => {
    // Matches onion's BTreeMap + max_by_key (keeps the last max). Tie 1-1
    // between "Apple" and "Zebra" -> "Zebra".
    const tokens = [...cl("Apple 1"), ...cl("Zebra 1")];
    expect(tallyChapterLabels(findChapterLabelEntries(tokens)).dominant).toBe(
      "Zebra",
    );
  });

  it("has no dominant when there are no labels", () => {
    expect(tallyChapterLabels([])).toEqual({ counts: [], dominant: null });
  });
});
