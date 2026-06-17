import { describe, expect, it } from "vitest";

import {
  analyzeChapterSequence,
  analyzeChapterVerses,
  type ChapterMarker,
  chapterMarkerOf,
} from "@/app/domain/editor/annotations/localLint/numberingRules.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

let nextId = 0;
/** A `\v` marker token carrying the sid the reducer parses its number from. */
function vMarker(sid: string): Token {
  nextId += 1;
  return {
    id: `t${nextId}`,
    kind: "marker",
    source: "\\v",
    marker: "v",
    sid,
  } as Token;
}
function cMarker(sid: string): Token {
  nextId += 1;
  return {
    id: `t${nextId}`,
    kind: "marker",
    source: "\\c",
    marker: "c",
    sid,
  } as Token;
}
function text(source: string): Token {
  nextId += 1;
  return { id: `t${nextId}`, kind: "text", source } as Token;
}
/** A `ChapterMarker` for sequence tests, without going through tokens. */
function chapter(number: number): ChapterMarker {
  return { number, tokenId: `c${number}`, sid: `GEN ${number}` };
}

const seqCodes = (markers: ChapterMarker[]) =>
  analyzeChapterSequence(markers).map((issue) => issue.code);
const verseCodes = (tokens: Token[]) =>
  analyzeChapterVerses(tokens).map((issue) => issue.code);

describe("chapterMarkerOf", () => {
  it("returns the first \\c marker's number, token-id, and sid", () => {
    const c = cMarker("GEN 3");
    expect(
      chapterMarkerOf([text("\\h Genesis"), c, vMarker("GEN 3:1")]),
    ).toEqual({ number: 3, tokenId: c.id, sid: "GEN 3" });
  });

  it("returns null for front matter (no \\c)", () => {
    expect(chapterMarkerOf([text("\\id GEN"), text("\\h Genesis")])).toBeNull();
  });
});

describe("analyzeChapterSequence (book scope)", () => {
  it("is silent on a clean 1..n run", () => {
    expect(seqCodes([chapter(1), chapter(2), chapter(3)])).toEqual([]);
  });

  it("flags an interior gap as a warning, anchored to the marker after the gap", () => {
    const markers = [chapter(1), chapter(2), chapter(4)];
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
    const issues = analyzeChapterSequence([
      chapter(1),
      chapter(2),
      chapter(3),
      chapter(2),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "chapter-number-decrease",
      found: 2,
      previous: 3,
    });
  });

  it("flags a non-1 first chapter as info", () => {
    const issues = analyzeChapterSequence([chapter(5), chapter(6)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "chapter-starts-at-one",
      found: 5,
    });
  });
});

describe("analyzeChapterVerses (chapter scope)", () => {
  it("is silent on a clean 1..n run", () => {
    expect(
      verseCodes([vMarker("GEN 1:1"), vMarker("GEN 1:2"), vMarker("GEN 1:3")]),
    ).toEqual([]);
  });

  it("flags an interior verse gap as a warning", () => {
    const tokens = [vMarker("GEN 1:1"), vMarker("GEN 1:2"), vMarker("GEN 1:5")];
    const issues = analyzeChapterVerses(tokens);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "verse-number-gap",
      found: 5,
      previous: 2,
      tokenId: tokens[2].id,
    });
  });

  it("flags a backward verse as a decrease", () => {
    const issues = analyzeChapterVerses([
      vMarker("GEN 1:1"),
      vMarker("GEN 1:2"),
      vMarker("GEN 1:3"),
      vMarker("GEN 1:2"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "verse-number-decrease",
      found: 2,
      previous: 3,
    });
  });

  it("flags a non-1 first verse as info", () => {
    const issues = analyzeChapterVerses([vMarker("GEN 1:3")]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "verse-starts-at-one", found: 3 });
  });

  it("treats a bridge as covering its whole span (no false gap after 5-6 → 7)", () => {
    expect(
      verseCodes([
        vMarker("GEN 1:1"),
        vMarker("GEN 1:2"),
        vMarker("GEN 1:3"),
        vMarker("GEN 1:4"),
        vMarker("GEN 1:5-6"),
        vMarker("GEN 1:7"),
      ]),
    ).toEqual([]);
  });

  it("reads an a/b split as a repeat, not a decrease (onion's Duplicate, not ours)", () => {
    expect(
      verseCodes([
        vMarker("GEN 1:1"),
        vMarker("GEN 1:2"),
        vMarker("GEN 1:2b"),
        vMarker("GEN 1:3"),
      ]),
    ).toEqual([]);
  });

  it("ignores non-\\v tokens — front matter / prose carry no verse sequence", () => {
    expect(verseCodes([text("\\id GEN"), text("\\h Genesis")])).toEqual([]);
  });
});
