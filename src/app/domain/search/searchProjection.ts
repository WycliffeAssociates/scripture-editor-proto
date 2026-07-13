// searchProjection.ts
//
// The canonical, per-sid text projection of a chapter's token stream, built
// DIRECTLY from `chapter.currentTokens` — plus the inversion map that turns a
// sid-relative match offset back into token anchors.
//
// Why straight off the tokens (not through `tokensToLexical` →
// `reduceSerializedNodesToText`): replace correctness needs each projection
// segment to name the exact index into `currentTokens`. The Lexical detour
// synthesizes nodes in some shapes (fresh ids, numbered-marker splitting), so
// its indices don't line up with the stored tokens. Projecting off the tokens
// keeps `tokenIndex` honest. The projection RULE mirrors
// `reduceSerializedNodesToText` exactly (pinned by an equivalence test):
// plain-text tokens always; marker/number/bookCode only when `includeUSFM`;
// newline tokens never (they render as `<br>`, never as searchable text).

import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * One token's contribution to a sid's projection buffer. `tokenIndex` indexes
 * the SAME `Token[]` the projection was built from; `projStart`/`projEnd` are
 * offsets into that sid's buffer (`[projStart, projEnd)`).
 */
export type ProjectionSegment = {
  tokenId: string;
  tokenIndex: number;
  projStart: number;
  projEnd: number;
};

export type SidProjection = {
  text: string;
  segments: ProjectionSegment[];
};

/** Projection for one chapter, keyed by sid. */
export type ChapterProjection = Map<string, SidProjection>;

/**
 * A token contributes searchable text iff it is a plain-text kind. These are
 * the kinds `flatTokenKindToLexicalTokenType` maps to `UsfmTokenTypes.text`,
 * i.e. the ones `isSerializedPlainTextUSFMTextNode` accepts. Everything else
 * (markers, numbers, bookCode) is USFM-only; newline is never projected.
 */
function isPlainTextKind(kind: Token["kind"]): boolean {
  return kind === "text" || kind === "optBreak";
}

function kindParticipatesInProjection(
  kind: Token["kind"],
  includeUSFM: boolean,
): boolean {
  if (kind === "newline") return false;
  return isPlainTextKind(kind) || includeUSFM;
}

/**
 * Project a chapter's tokens into per-sid text + inversion map.
 *
 * `includeUSFM` mirrors the search toggle: false = regular mode (marker syntax
 * hidden), true = USFM mode (marker syntax searchable).
 */
export function projectChapterTokens(args: {
  tokens: readonly Token[];
  includeUSFM: boolean;
}): ChapterProjection {
  const projection: ChapterProjection = new Map();

  args.tokens.forEach((token, tokenIndex) => {
    const sid = token.sid;
    if (!sid) return;
    if (!kindParticipatesInProjection(token.kind, args.includeUSFM)) return;
    let entry = projection.get(sid);
    if (!entry) {
      entry = { text: "", segments: [] };
      projection.set(sid, entry);
    }
    const projStart = entry.text.length;
    entry.text += token.source;
    entry.segments.push({
      tokenId: token.id,
      tokenIndex,
      projStart,
      projEnd: entry.text.length,
    });
  });

  return projection;
}

/**
 * Flatten a chapter projection to the `{ sid, text }` node list the pure search
 * engine consumes. Preserves projection (first-seen) order.
 */
export function projectionToSearchNodes(
  projection: ChapterProjection,
): Array<{ sid: string; text: string }> {
  return [...projection.entries()].map(([sid, { text }]) => ({ sid, text }));
}
