// tokenReplace.ts
//
// The pure token-space core of find/replace: turn a resolved match into new
// `currentTokens`. Two tiers:
//
//   Tier 1 — a match inside ONE plain-text token whose replacement carries no
//     USFM control char: splice the token's `source` in place. Same id, same
//     sid, same NodeState anchor; no re-lex. The common case.
//   Tier 2 — anything else (spans >1 token, touches a marker/number, or the
//     replacement carries a control char): serialize a self-contained window,
//     splice, re-lex JUST that window, and stitch the new tokens back. Token
//     ids OUTSIDE the window are carried untouched so findings/lint anchors
//     survive.
//
// Invariants the stitch protects (see product-docs/specs/
// find-and-replace-functionality.md):
//   Window self-containment: the lexer's boundary tokenization is context-
//     sensitive between newline tokens, so the window is snapped outward to
//     the nearest newline tokens — see `snapWindow` for why those are the
//     canonical boundary.
//   Sid derivation: re-lexed fragments have no verse scope. Rather than stamp
//     sids by hand, the stitched chapter is run through `normalizeTokenSids` —
//     the SAME `mutAddSids` pass `lexicalToTokens` runs at every commit — so
//     the result carries sids in the store's own convention for both
//     single-sid and verse-structural edits. Only `sid` changes; ids are
//     preserved.
//   Hidden markup: a regular-mode span can swallow filtered-out structure —
//     see `matchHasGap`, the owning seam for that rule.

import { guidGenerator } from "@/core/data/utils/generic.ts";
import { normalizeTokenSids } from "@/core/domain/usfm/tokenSidNormalization.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type { ProjectionSegment, SidProjection } from "./searchProjection.ts";

// USFM is line-anchored and backslash/pipe/slash-delimited; a replacement
// carrying any of these can restructure tokens, so it forces a Tier-2 re-lex.
const CONTROL_CHARS = /[\\|/\n]/u;

/**
 * Where a match sits in the token stream: an offset inside a start token, an
 * offset inside an end token, and the token indices between (inclusive). Token
 * indices index the `Token[]` the projection was built from.
 */
export type MatchAnchors = {
  startTokenIndex: number;
  startOffset: number;
  endTokenIndex: number;
  endOffset: number;
};

/** A painted sub-range within one rendered token, in that token's UTF-16 offsets. */
export type TokenPaintRange = {
  tokenId: string;
  start: number;
  end: number;
};

function segmentCovering(
  segments: readonly ProjectionSegment[],
  offset: number,
  side: "start" | "end",
): ProjectionSegment | undefined {
  return segments.find((s) =>
    side === "start"
      ? offset >= s.projStart && offset < s.projEnd
      : offset > s.projStart && offset <= s.projEnd,
  );
}

/**
 * Resolve a sid-relative match `[ms, me)` to token anchors via the sid's
 * inversion map. Null when the projection doesn't cover the offsets (should not
 * happen for offsets that came from searching this same projection).
 */
export function resolveMatchAnchors(
  projection: SidProjection,
  ms: number,
  me: number,
): MatchAnchors | null {
  const a = segmentCovering(projection.segments, ms, "start");
  const b = segmentCovering(projection.segments, me, "end");
  if (!a || !b) return null;
  return {
    startTokenIndex: a.tokenIndex,
    startOffset: ms - a.projStart,
    endTokenIndex: b.tokenIndex,
    endOffset: me - b.projStart,
  };
}

/**
 * The text-like paint ranges for a match: one clipped range per projected
 * (rendered) token the match overlaps. Markers/numbers not in the projection
 * (a regular-mode gap) contribute nothing — highlights stay grapheme runs.
 */
export function matchPaintRanges(
  projection: SidProjection,
  ms: number,
  me: number,
): TokenPaintRange[] {
  const ranges: TokenPaintRange[] = [];
  for (const seg of projection.segments) {
    const start = Math.max(ms, seg.projStart);
    const end = Math.min(me, seg.projEnd);
    if (end <= start) continue;
    ranges.push({
      tokenId: seg.tokenId,
      start: start - seg.projStart,
      end: end - seg.projStart,
    });
  }
  return ranges;
}

/**
 * Does the span swallow filtered-out structure? A gap is an interior token
 * (strictly between the anchors) with no projection segment, excluding benign
 * `newline` tokens (a paragraph break mid-verse).
 *
 * THE OWNING SEAM for the hidden-markup rule: in regular mode markers are
 * excluded from the projection, so an ordinary prose search ("LORD said") can
 * silently span an inline marker (`the \nd LORD\nd* said`) whose end-marker a
 * splice would delete — silent data corruption, and USFM markers are often
 * semantic (`\nd` divine name, `\add` translator addition), so no "inherit the
 * formatting" rule is safe. A gap match is therefore find-only in regular
 * mode; the affordance is a direct toggle to USFM mode, where markers ARE in
 * the projection — you cannot cross one without typing it, so dropping a
 * marker becomes an explicit on-screen choice and clean spans have no gap.
 */
export function matchHasGap(args: {
  tokens: readonly Token[];
  anchors: MatchAnchors;
  coveredIndices: ReadonlySet<number>;
}): boolean {
  const { tokens, anchors, coveredIndices } = args;
  for (let i = anchors.startTokenIndex + 1; i < anchors.endTokenIndex; i++) {
    if (coveredIndices.has(i)) continue;
    if (tokens[i]?.kind === "newline") continue;
    return true;
  }
  return false;
}

export type ReplaceTier = "tier1" | "tier2";

export function classifyTier(args: {
  tokens: readonly Token[];
  anchors: MatchAnchors;
  replacement: string;
}): ReplaceTier {
  const { tokens, anchors, replacement } = args;
  const single = anchors.startTokenIndex === anchors.endTokenIndex;
  const isProse = tokens[anchors.startTokenIndex]?.kind === "text";
  if (single && isProse && !CONTROL_CHARS.test(replacement)) return "tier1";
  return "tier2";
}

/**
 * Tier 1: splice one plain-text token's source in place. Synchronous; every
 * other token keeps its id/sid/NodeState anchor.
 */
export function applyTier1(args: {
  tokens: readonly Token[];
  anchors: MatchAnchors;
  replacement: string;
}): Token[] {
  const { tokens, anchors, replacement } = args;
  const i = anchors.startTokenIndex;
  const token = tokens[i];
  const source =
    token.source.slice(0, anchors.startOffset) +
    replacement +
    token.source.slice(anchors.endOffset);
  const out = tokens.slice();
  out[i] = { ...token, source };
  return out;
}

/**
 * Snap the Tier-2 window outward to the nearest `newline` token on each side
 * (exclusive; chapter edges otherwise). Interior newlines stay inside the
 * window, so cross-verse spans re-lex whole.
 *
 * Why newline tokens are the canonical boundary: the token stream is lossless
 * byte accounting — every byte is owned by a token, and a newline is a
 * meaningful byte with its OWN token. Adjacent text runs therefore cannot
 * merge across the boundary (the newline token sits between them), and every
 * within-boundary coupling (marker↔number pending state, milestone/endMarker
 * whitespace attachment) is captured whole by the window. This keeps the
 * stitched stream identical to a full reparse (`tokens ≡ lex(join(sources))`)
 * while still localizing token-id churn to the edited region.
 */
function snapWindow(
  tokens: readonly Token[],
  startTokenIndex: number,
  endTokenIndex: number,
): { w0: number; w1: number } {
  let w0 = startTokenIndex;
  while (w0 > 0 && tokens[w0 - 1].kind !== "newline") w0--;
  let w1 = endTokenIndex;
  while (w1 + 1 < tokens.length && tokens[w1 + 1].kind !== "newline") w1++;
  return { w0, w1 };
}

/**
 * Tier 2: windowed serialize · splice · re-lex · stitch. `relexWindow` re-lexes
 * the spliced window source into tokens (the onion `parseUsfm` window re-lex);
 * `bookCode` scopes the whole-chapter sid re-derivation. Async because the
 * re-lex is.
 */
export async function applyTier2(args: {
  tokens: readonly Token[];
  anchors: MatchAnchors;
  replacement: string;
  bookCode: string;
  relexWindow: (windowSource: string) => Promise<Token[]>;
}): Promise<Token[]> {
  const { tokens, anchors, replacement, bookCode, relexWindow } = args;
  const { w0, w1 } = snapWindow(
    tokens,
    anchors.startTokenIndex,
    anchors.endTokenIndex,
  );

  const windowSource = tokens
    .slice(w0, w1 + 1)
    .map((t) => t.source)
    .join("");

  let spliceStart = anchors.startOffset;
  for (let i = w0; i < anchors.startTokenIndex; i++) {
    spliceStart += tokens[i].source.length;
  }
  let spliceEnd = anchors.endOffset;
  for (let i = w0; i < anchors.endTokenIndex; i++) {
    spliceEnd += tokens[i].source.length;
  }

  const splicedWindow =
    windowSource.slice(0, spliceStart) +
    replacement +
    windowSource.slice(spliceEnd);

  // Fresh ids on re-lexed tokens: they are genuinely new lexemes, so a stale
  // finding/lint anchor must NOT resolve onto them.
  const relexed = (await relexWindow(splicedWindow)).map((token) => ({
    ...token,
    id: guidGenerator(),
  }));

  const stitched = [
    ...tokens.slice(0, w0),
    ...relexed,
    ...tokens.slice(w1 + 1),
  ];

  return normalizeTokenSids(stitched, bookCode);
}
