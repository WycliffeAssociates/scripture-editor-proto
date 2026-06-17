import { describe, expect, it } from "vitest";

import {
  analyzeChapterSequence,
  analyzeChapterVerses,
  type ChapterMarker,
  chapterMarkerOf,
} from "@/app/domain/editor/annotations/localLint/numberingRules.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

let nextId = 0;
function tok(kind: Token["kind"], source: string, marker?: string): Token {
  nextId += 1;
  return { id: `t${nextId}`, kind, source, marker } as Token;
}
/** A `\v` as the canonical stream emits it: marker token then number token. */
function v(num: string): Token[] {
  return [tok("marker", "\\v", "v"), tok("number", num)];
}
function c(num: string): Token[] {
  return [tok("marker", "\\c", "c"), tok("number", num)];
}
function text(source: string): Token {
  return tok("text", source);
}
/** A `ChapterMarker` for sequence tests, built directly. */
function chap(number: number): ChapterMarker {
  return { number, tokenId: `c${number}` };
}

const seqCodes = (markers: ChapterMarker[]) =>
  analyzeChapterSequence(markers).map((issue) => issue.code);
const verseCodes = (tokens: Token[]) =>
  analyzeChapterVerses(tokens).map((issue) => issue.code);

describe("chapterMarkerOf", () => {
  it("reads the chapter number from the \\c marker's following number token", () => {
    const tokens = [text("\\h Genesis"), ...c("3"), ...v("1")];
    const marker = chapterMarkerOf(tokens);
    expect(marker?.number).toBe(3);
    expect(marker?.tokenId).toBe(tokens[2].id); // the \c NUMBER token (rendered id)
  });

  it("returns null for front matter (no \\c)", () => {
    expect(chapterMarkerOf([text("\\id GEN"), text("\\h Genesis")])).toBeNull();
  });
});

describe("analyzeChapterSequence (book scope)", () => {
  it("is silent on a clean 1..n run", () => {
    expect(seqCodes([chap(1), chap(2), chap(3)])).toEqual([]);
  });

  it("flags an interior gap as a warning, anchored to the marker after the gap", () => {
    const markers = [chap(1), chap(2), chap(4)];
    const issues = analyzeChapterSequence(markers);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "chapter-number-gap",
      found: 4,
      previous: 2,
      tokenId: markers[2].tokenId,
    });
  });

  it("flags a backward chapter as a decrease", () => {
    const issues = analyzeChapterSequence([chap(1), chap(2), chap(3), chap(2)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "chapter-number-decrease",
      found: 2,
      previous: 3,
    });
  });

  it("flags a non-1 first chapter as info", () => {
    const issues = analyzeChapterSequence([chap(5), chap(6)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "chapter-starts-at-one",
      found: 5,
    });
  });
});

describe("analyzeChapterVerses (chapter scope)", () => {
  it("is silent on a clean 1..n run", () => {
    expect(verseCodes([...v("1"), ...v("2"), ...v("3")])).toEqual([]);
  });

  it("flags an interior verse gap (2 → 93), anchored to the offending \\v", () => {
    const tokens = [...v("1"), ...v("2"), ...v("93")];
    const issues = analyzeChapterVerses(tokens);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "verse-number-gap",
      found: 93,
      previous: 2,
      tokenId: tokens[5].id, // the \v 93 NUMBER token (rendered id)
    });
  });

  it("flags a backward verse as a decrease (93 → 4)", () => {
    const issues = analyzeChapterVerses([...v("2"), ...v("93"), ...v("4")]);
    expect(issues.map((i) => i.code)).toEqual([
      "verse-starts-at-one", // first verse is 2, not 1
      "verse-number-gap", // 2 → 93
      "verse-number-decrease", // 93 → 4
    ]);
  });

  it("resyncs after an out-of-order number — no decrease cascade", () => {
    // 33 is a gap from 2; 4 is a decrease from 33; then 4→5 is fine. One bad
    // number must not paint every following verse red.
    expect(
      analyzeChapterVerses([
        ...v("1"),
        ...v("2"),
        ...v("33"),
        ...v("4"),
        ...v("5"),
      ]).map((i) => i.code),
    ).toEqual(["verse-number-gap", "verse-number-decrease"]);
  });

  it("flags a non-1 first verse as info", () => {
    const issues = analyzeChapterVerses([...v("3")]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "verse-starts-at-one", found: 3 });
  });

  it("treats a bridge as covering its whole span (no false gap after 5-6 → 7)", () => {
    expect(
      verseCodes([
        ...v("1"),
        ...v("2"),
        ...v("3"),
        ...v("4"),
        ...v("5-6"),
        ...v("7"),
      ]),
    ).toEqual([]);
  });

  it("reads an a/b split as a repeat, not a decrease (onion's Duplicate)", () => {
    expect(verseCodes([...v("1"), ...v("2"), ...v("2b"), ...v("3")])).toEqual(
      [],
    );
  });

  it("ignores a \\v with no following number (onion's Missing*, not ours)", () => {
    expect(verseCodes([tok("marker", "\\v", "v"), text("hello")])).toEqual([]);
  });
});
