// tokenReplace.test.ts
//
// The token-store find/replace core against the real usfm-onion wasm:
//
//   - projection equivalence: the direct-from-Token[] projection matches the
//     serialized-node projection the results list reads, in both modes. The
//     occurrence-index join between a result row and its replace target leans
//     entirely on this equivalence.
//   - the fixpoint invariant `tokens ≡ lex(join(sources))` after each replace
//     class (T1, T2 window-snap, adjacent-text merge, milestone whitespace,
//     cross-verse sid re-derive), including sids in the store's own
//     `normalizeTokenSids` convention.
//   - the gap rule (see `matchHasGap`): a regular-mode span crossing a hidden
//     marker is a gap; a span crossing only a newline is benign.
//   - the store seam: a gap target returns `{ kind: "gap" }` with the store
//     untouched.

import { describe, expect, it } from "vitest";

import { EDITOR_SHAPES } from "@/app/data/editor.ts";
import { tokensToLexical } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { collectChapterMatches } from "@/app/domain/search/collectMatches.ts";
import { reduceSerializedNodesToText } from "@/app/domain/search/search.utils.ts";
import {
  projectChapterTokens,
  projectionToSearchNodes,
} from "@/app/domain/search/searchProjection.ts";
import {
  applyTier1,
  applyTier2,
  classifyTier,
  matchHasGap,
  type MatchAnchors,
  resolveMatchAnchors,
} from "@/app/domain/search/tokenReplace.ts";
import { normalizeTokenSids } from "@/core/domain/usfm/tokenSidNormalization.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const svc = webUsfmOnionService;

const TIT = `\\id TIT
\\c 1
\\cl Ikipande 1
\\p
\\v 1 Mukutampa, Resa apangire umuru.
\\v 2 Ikyaro karifye ikimfundawira.
`;

const GEN_ND = `\\id GEN
\\c 1
\\v 1 And the \\nd LORD\\nd* said to them plainly.
`;

async function parse(usfm: string): Promise<Token[]> {
  return (await svc.parseUsfm(usfm)).tokens;
}

// Store tokens are always sid-normalized (the load/commit paths run
// `normalizeTokenSids`), so fixtures start in that convention too.
async function load(usfm: string, bookCode: string): Promise<Token[]> {
  return normalizeTokenSids(await parse(usfm), bookCode);
}

const relexWindow = async (windowSource: string): Promise<Token[]> =>
  (await svc.parseUsfm(windowSource)).tokens;

function join(tokens: readonly Token[]): string {
  return tokens.map((t) => t.source).join("");
}

/** kind+source pairs — the fixpoint invariant compares these. */
function shape(tokens: readonly Token[]): Array<[string, string]> {
  return tokens.map((t) => [t.kind, t.source]);
}

/** Assert the stitched stream is what a full reparse would produce. */
async function expectFixpoint(result: readonly Token[], bookCode: string) {
  const relex = await parse(join(result));
  expect(shape(result)).toEqual(shape(relex));
  // sids too: the store convention is `normalizeTokenSids` over a full parse
  // (raw onion leaves the \id marker null; the app anchors it to BOOK 0:0), so
  // that is the correct baseline — not the raw parse.
  const relexSids = normalizeTokenSids(relex, bookCode).map(
    (t) => t.sid ?? null,
  );
  expect(result.map((t) => t.sid ?? null)).toEqual(relexSids);
}

/** First occurrence of `term` across a chapter's sid projections, in either mode. */
function firstAnchors(
  tokens: readonly Token[],
  includeUSFM: boolean,
  term: string,
): { anchors: MatchAnchors; hasGap: boolean } {
  const matches = collectChapterMatches({
    tokens,
    bookCode: "TIT",
    chapterNum: 1,
    searchUSFM: includeUSFM,
    searchTerm: term,
    matchCase: true,
    matchWholeWord: false,
    source: "target",
  });
  const projection = projectChapterTokens({ tokens, includeUSFM });
  const first = matches[0];
  const sidProjection = projection.get(first.sid);
  if (!sidProjection) throw new Error("no projection for sid");
  const idx = sidProjection.text.indexOf(term);
  const anchors = resolveMatchAnchors(sidProjection, idx, idx + term.length);
  if (!anchors) throw new Error("unresolved");
  return { anchors, hasGap: first.hasGap };
}

// Rich structure fixture: optBreak (//), inline \nd, \qt milestones, a
// footnote \f...\f*, and a \w attribute — the shapes where the two
// projections could plausibly disagree.
const GEN_RICH = `\\id GEN
\\c 1
\\v 1 And the \\nd LORD\\nd* said // to them plainly.
\\v 2 Q \\qt-s |sid="q1" who="God"\\*Be light.\\qt-e |eid="q1"\\* done.
\\v 3 alpha \\f + \\ft note body here\\f* omega.
\\v 4 see \\w term|strong="H1"\\w* here.
`;

function expectProjectionEquivalence(tokens: readonly Token[]) {
  for (const includeUSFM of [false, true]) {
    const direct = Object.fromEntries(
      projectionToSearchNodes(
        projectChapterTokens({ tokens, includeUSFM }),
      ).map(({ sid, text }) => [sid, text]),
    );
    const viaNodes = reduceSerializedNodesToText(
      tokensToLexical({
        tokens: tokens as Token[],
        direction: "ltr",
        mode: EDITOR_SHAPES.flat,
      }).root.children,
      includeUSFM,
    );
    expect(direct).toEqual(viaNodes);
  }
}

describe("projection equivalence", () => {
  it("matches the serialized-node projection in both modes", async () => {
    expectProjectionEquivalence(await load(TIT, "TIT"));
  });

  it("holds across optBreak, inline/milestone markers, footnotes, and attributes", async () => {
    expectProjectionEquivalence(await load(GEN_RICH, "GEN"));
  });
});

describe("replace tiers hold the fixpoint", () => {
  it("T1: plain prose splice, ids preserved", async () => {
    const tokens = await load(TIT, "TIT");
    const { anchors } = firstAnchors(tokens, true, "Mukutampa");
    expect(classifyTier({ tokens, anchors, replacement: "Mukutampo" })).toBe(
      "tier1",
    );
    const result = applyTier1({ tokens, anchors, replacement: "Mukutampo" });
    expect(join(result)).toBe(join(tokens).replace("Mukutampa", "Mukutampo"));
    expect(result.map((t) => t.id)).toEqual(tokens.map((t) => t.id));
    await expectFixpoint(result, "TIT");
  });

  it("T2: multi-token marker+number window (\\c 1 -> \\c 22)", async () => {
    const tokens = await load(TIT, "TIT");
    const { anchors } = firstAnchors(tokens, true, "\\c 1");
    expect(classifyTier({ tokens, anchors, replacement: "\\c 22" })).toBe(
      "tier2",
    );
    const result = await applyTier2({
      tokens,
      anchors,
      replacement: "\\c 22",
      bookCode: "TIT",
      relexWindow,
    });
    expect(join(result)).toBe(join(tokens).replace("\\c 1", "\\c 22"));
    await expectFixpoint(result, "TIT");
  });

  it("T2 window-snap: number-only anchor pulls in its governing marker", async () => {
    const tokens = await load(TIT, "TIT");
    // The \v 2 verse-number token. A naive number-only re-lex would classify
    // "22" as text; the snap includes the governing \v so it stays a number.
    const numberIndex = tokens.findIndex(
      (t) => t.kind === "number" && t.source.trim() === "2",
    );
    expect(numberIndex).toBeGreaterThan(0);
    const anchors: MatchAnchors = {
      startTokenIndex: numberIndex,
      startOffset: 0,
      endTokenIndex: numberIndex,
      endOffset: 1,
    };
    const result = await applyTier2({
      tokens,
      anchors,
      replacement: "22",
      bookCode: "TIT",
      relexWindow,
    });
    expect(result[numberIndex]?.kind).toBe("number");
    await expectFixpoint(result, "TIT");
  });

  it("T1: whitespace in the replacement lands verbatim (no trimming)", async () => {
    const tokens = await load(TIT, "TIT");
    const { anchors } = firstAnchors(tokens, true, "Mukutampa");
    const result = applyTier1({ tokens, anchors, replacement: "Mukutampo " });
    expect(join(result)).toBe(join(tokens).replace("Mukutampa", "Mukutampo "));
    await expectFixpoint(result, "TIT");
  });

  it("T2 adjacent-text merge: stripping an inline marker re-lexes the neighbors whole", async () => {
    const tokens = await load(GEN_ND, "GEN");
    const A = tokens.findIndex((t) => t.marker === "nd" && t.kind === "marker");
    const B = tokens.findIndex(
      (t) => t.marker === "nd" && t.kind === "endMarker",
    );
    const anchors: MatchAnchors = {
      startTokenIndex: A,
      startOffset: 0,
      endTokenIndex: B,
      endOffset: tokens[B].source.length,
    };
    const result = await applyTier2({
      tokens,
      anchors,
      replacement: "GOD",
      bookCode: "GEN",
      relexWindow,
    });
    // The whole verse line must re-lex as ONE text run — a stitch that leaves
    // three adjacent text tokens is byte-identical but non-canonical, and the
    // next keystroke's write-back would re-tokenize it (phantom dirty/diff).
    expect(
      result.filter((t) => t.kind === "text").map((t) => t.source),
    ).toContain("And the GOD said to them plainly.");
    await expectFixpoint(result, "GEN");
  });

  it("T2 milestone: re-lexing \\qt-s alone keeps whitespace attachment canonical", async () => {
    const tokens = await load(GEN_RICH, "GEN");
    const A = tokens.findIndex((t) => t.marker === "qt-s");
    const anchors: MatchAnchors = {
      startTokenIndex: A,
      startOffset: 0,
      endTokenIndex: A,
      endOffset: tokens[A].source.length,
    };
    const result = await applyTier2({
      tokens,
      anchors,
      replacement: tokens[A].source,
      bookCode: "GEN",
      relexWindow,
    });
    await expectFixpoint(result, "GEN");
  });

  it("T2 cross-verse: sids re-derived across a \\v boundary", async () => {
    const tokens = await load(TIT, "TIT");
    // Insert text just before \v 2, so the window spans TIT 1:1 -> 1:2.
    const v1TextIndex = tokens.findIndex((t) => t.source.includes("umuru."));
    const v2MarkerIndex = tokens.findIndex(
      (t, i) => i > v1TextIndex && t.kind === "marker" && t.marker === "v",
    );
    const anchors: MatchAnchors = {
      startTokenIndex: v1TextIndex,
      startOffset:
        tokens[v1TextIndex].source.indexOf("umuru.") + "umuru.".length,
      endTokenIndex: v2MarkerIndex,
      endOffset: tokens[v2MarkerIndex].source.length,
    };
    const result = await applyTier2({
      tokens,
      anchors,
      replacement: " YO \\v 2",
      bookCode: "TIT",
      relexWindow,
    });
    // expectFixpoint already pins sids: the \v 2 number resolves to TIT 1:2,
    // not the anchor verse's 1:1.
    await expectFixpoint(result, "TIT");
  });
});

describe("G3 gap rule", () => {
  it("regular-mode span across a hidden inline marker is a gap", async () => {
    const tokens = await load(GEN_ND, "GEN");
    const matches = collectChapterMatches({
      tokens,
      bookCode: "GEN",
      chapterNum: 1,
      searchUSFM: false,
      searchTerm: "LORD said",
      matchCase: true,
      matchWholeWord: false,
      source: "target",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].hasGap).toBe(true);
  });

  it("USFM-mode explicit span is gap-free", async () => {
    const tokens = await load(GEN_ND, "GEN");
    const matches = collectChapterMatches({
      tokens,
      bookCode: "GEN",
      chapterNum: 1,
      searchUSFM: true,
      searchTerm: "LORD\\nd* said",
      matchCase: true,
      matchWholeWord: false,
      source: "target",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].hasGap).toBe(false);
  });

  it("a newline (paragraph break) interior is benign, not a gap", () => {
    const tokens: Token[] = [
      {
        id: "a",
        kind: "text",
        source: "one",
        sid: "GEN 1:1",
      },
      {
        id: "b",
        kind: "newline",
        source: "\n",
        sid: "GEN 1:1",
      },
      {
        id: "c",
        kind: "text",
        source: "two",
        sid: "GEN 1:1",
      },
    ];
    const anchors: MatchAnchors = {
      startTokenIndex: 0,
      startOffset: 0,
      endTokenIndex: 2,
      endOffset: 3,
    };
    // The newline carries no projection segment, but it is benign.
    expect(
      matchHasGap({ tokens, anchors, coveredIndices: new Set([0, 2]) }),
    ).toBe(false);
    // An interior marker in the same shape IS a gap.
    const withMarker: Token[] = [
      tokens[0],
      {
        id: "m",
        kind: "marker",
        source: "\\nd ",
        marker: "nd",
        sid: "GEN 1:1",
      },
      tokens[2],
    ];
    expect(
      matchHasGap({
        tokens: withMarker,
        anchors,
        coveredIndices: new Set([0, 2]),
      }),
    ).toBe(true);
  });
});
