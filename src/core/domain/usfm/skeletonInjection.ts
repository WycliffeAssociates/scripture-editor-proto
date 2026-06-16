// skeletonInjection.ts
//
// Pure helpers that copy structural skeleton from a source token stream
// onto a target. Used by the match-formatting pipeline after the
// algorithmic verse-anchor placement runs:
//
//   1. `stripDeprecatedMarkers` removes legacy markers (e.g. `\s5`) so
//      they never propagate from reference to target.
//   2. `injectSkeletonVersesFromSource` adds any verse-marker SIDs the
//      reference has but the target doesn't, as empty `\v N \n` hunks.
//   3. `injectSkeletonMarkersFromSource` adds any per-verse paragraph /
//      poetry markers the reference has but the target doesn't, at the
//      tail of each target verse hunk so form mode can render them.
//
// Extracted from `useFormatMatching.tsx` to keep the algorithm pure
// and unit-testable without React surface area.
// TODO: Likely not, but this sort of low level transposition to create a skeleton USFM might be something worth living in like a rust slash wasm crate.
import type { TokenEnvelope } from "@/core/domain/usfm/tokenEnvelope.ts";

/**
 * Markers we never carry from reference to target. `\s5` is a non-standard
 * chunk marker the ecosystem is migrating away from.
 */
const DEPRECATED_MARKERS = new Set(["s5"]);

/**
 * Note-span openers. A `\f` (footnote) or `\x` (cross-reference) starts
 * a span that is closed by the matching `\f*` / `\x*` end-marker. Any
 * content inside — including caller text, reference targets, and
 * inline char markers like `\fr` `\ft` `\fk` `\fq` `\fl` `\xo` `\xt`
 * etc. — is excluded from skeleton diffing and injection.
 *
 * Rationale: notes are content that lives inside one verse, not part
 * of the structural skeleton. If reference has an `\f` and target
 * doesn't, copying it (and its inline char markers) into target would
 * spray empty `\fr`/`\ft` rows across the form, which is meaningless
 * to the editor and confusing to the user.
 */
const NOTE_SPAN_OPENERS = new Set(["f", "fe", "x", "ef", "ex"]);

function isNoteOpenerMarker(marker: string | undefined): boolean {
  return !!marker && NOTE_SPAN_OPENERS.has(marker);
}

/**
 * Strip every `\f...\f*` / `\x...\x*` span from the token stream.
 * Tokens between (inclusive of) opener and end-marker are dropped.
 * Robust to malformed input: an opener with no matching end-marker
 * drops everything after it (callers shouldn't feed that, but we
 * fail closed rather than open).
 */
function dropNoteSpans(tokens: readonly TokenEnvelope[]): TokenEnvelope[] {
  const out: TokenEnvelope[] = [];
  let inNote = false;
  for (const token of tokens) {
    if (!inNote) {
      if (token.tokenType === "marker" && isNoteOpenerMarker(token.marker)) {
        inNote = true;
        continue;
      }
      out.push(token);
      continue;
    }
    if (token.tokenType === "endMarker" && isNoteOpenerMarker(token.marker)) {
      inNote = false;
    }
  }
  return out;
}

export function stripDeprecatedMarkers(
  tokens: readonly TokenEnvelope[],
): TokenEnvelope[] {
  return tokens.filter((token) => {
    if (token.tokenType !== "marker" && token.tokenType !== "endMarker") {
      return true;
    }
    return !token.marker || !DEPRECATED_MARKERS.has(token.marker);
  });
}

type VerseGrouping = {
  prelude: TokenEnvelope[];
  verses: TokenEnvelope[][];
};

/**
 * Group a flat token stream into one slice per `\v` hunk plus an optional
 * prelude (anything before the first `\v`). Splits at every verse marker.
 */
function groupEnvelopesByVerse(
  tokens: readonly TokenEnvelope[],
): VerseGrouping {
  const verseStarts = collectVerseStartIndices(tokens);
  if (verseStarts.length === 0) {
    return { prelude: [...tokens], verses: [] };
  }
  const firstStart = verseStarts[0] as number;
  const prelude = firstStart > 0 ? tokens.slice(0, firstStart) : [];
  return {
    prelude: [...prelude],
    verses: sliceVerses(tokens, verseStarts),
  };
}

function collectVerseStartIndices(tokens: readonly TokenEnvelope[]): number[] {
  const indices: number[] = [];
  tokens.forEach((token, i) => {
    if (token.tokenType === "marker" && token.marker === "v") {
      indices.push(i);
    }
  });
  return indices;
}

function sliceVerses(
  tokens: readonly TokenEnvelope[],
  starts: readonly number[],
): TokenEnvelope[][] {
  const out: TokenEnvelope[][] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i] as number;
    const end =
      i + 1 < starts.length ? (starts[i + 1] as number) : tokens.length;
    out.push(tokens.slice(start, end));
  }
  return out;
}

/**
 * Returns the non-verse markers of a verse slice in source order. Used
 * for multiset-aware skeleton diffing (so three `\q2`s on the source
 * yield three `\q2`s on the target).
 */
function listVerseMarkers(slice: readonly TokenEnvelope[]): string[] {
  const markers: string[] = [];
  for (const token of slice) {
    if (token.tokenType !== "marker") continue;
    if (!token.marker || token.marker === "v") continue;
    markers.push(token.marker);
  }
  return markers;
}

/**
 * Multiset difference: items present in `a` but missing from `b`,
 * counting multiplicity. Order follows `a`.
 */
function multisetDiff(a: readonly string[], b: readonly string[]): string[] {
  const remaining = [...b];
  const result: string[] = [];
  for (const item of a) {
    const idx = remaining.indexOf(item);
    if (idx === -1) result.push(item);
    else remaining.splice(idx, 1);
  }
  return result;
}

/**
 * Mirror the reference's verse-list onto the target. For every reference
 * verse the target lacks (by SID), insert an empty `\v N \n` hunk at the
 * reference's position. Existing target verses keep their content
 * untouched; only the verse skeleton is filled in.
 *
 * Output verse order follows the reference's order. Any target-only
 * verses (rare — versification mismatch) are appended at the end so they
 * are never silently lost.
 */
export function injectSkeletonVersesFromSource(
  targetTokens: readonly TokenEnvelope[],
  sourceTokens: readonly TokenEnvelope[],
): TokenEnvelope[] {
  const sourceGroups = groupEnvelopesByVerse(sourceTokens);
  const targetGroups = groupEnvelopesByVerse(targetTokens);
  const targetBySid = mapVerseSlicesBySid(targetGroups.verses);

  const out: TokenEnvelope[] = [...targetGroups.prelude];
  const consumedSids = new Set<string>();

  for (const sourceSlice of sourceGroups.verses) {
    const sid = sourceSlice[0]?.sid;
    if (!sid) continue;
    const existing = targetBySid.get(sid);
    if (existing) {
      out.push(...existing);
      consumedSids.add(sid);
      continue;
    }
    out.push(...synthesizeEmptyVerse(sourceSlice));
  }

  for (const slice of targetGroups.verses) {
    const sid = slice[0]?.sid;
    if (sid && !consumedSids.has(sid)) {
      out.push(...slice);
    }
  }
  return out;
}

function mapVerseSlicesBySid(
  verses: readonly TokenEnvelope[][],
): Map<string, TokenEnvelope[]> {
  const out = new Map<string, TokenEnvelope[]>();
  for (const slice of verses) {
    const sid = slice[0]?.sid;
    if (sid) out.set(sid, slice);
  }
  return out;
}

function synthesizeEmptyVerse(
  sourceSlice: readonly TokenEnvelope[],
): TokenEnvelope[] {
  const out: TokenEnvelope[] = [];
  const verseMarker = sourceSlice[0];
  const numberRange = sourceSlice[1];
  const sid = verseMarker?.sid;
  if (verseMarker?.tokenType === "marker") {
    out.push({
      tokenType: "marker",
      text: verseMarker.text,
      marker: verseMarker.marker,
      sid,
    } as TokenEnvelope);
  }
  if (numberRange?.tokenType === "numberRange") {
    out.push({
      tokenType: "numberRange",
      text: numberRange.text,
      sid,
    } as TokenEnvelope);
  }
  out.push({ tokenType: "nl", text: "\n" } as TokenEnvelope);
  return out;
}

/**
 * Mirror the reference's per-verse marker skeleton onto the target.
 * After verse-anchor matching has placed inter-verse boundary markers,
 * any reference markers that the target verse still lacks get appended
 * at the tail of the target's verse hunk as empty marker rows. Multiset
 * comparison preserves multiplicity (three reference `\q2`s yield three
 * target `\q2`s). Existing target markers are never removed.
 */
export function injectSkeletonMarkersFromSource(
  targetTokens: readonly TokenEnvelope[],
  sourceTokens: readonly TokenEnvelope[],
): TokenEnvelope[] {
  // Notes (`\f...\f*`, `\x...\x*`) and their inline char markers
  // are content, not skeleton. Strip them from BOTH sides before
  // diffing so we don't synthesize empty `\fr` rows on the target.
  const sourceVerses = groupEnvelopesByVerse(dropNoteSpans(sourceTokens));
  const targetVerses = groupEnvelopesByVerse(targetTokens);
  const sourceMarkersBySid = mapMarkersBySid(sourceVerses.verses);

  const out: TokenEnvelope[] = [...targetVerses.prelude];
  for (const slice of targetVerses.verses) {
    out.push(...slice);
    const sid = slice[0]?.sid;
    if (!sid) continue;
    const sourceMarkers = sourceMarkersBySid.get(sid);
    if (!sourceMarkers || sourceMarkers.length === 0) continue;
    const missing = multisetDiff(
      sourceMarkers,
      listVerseMarkers(dropNoteSpans(slice)),
    );
    for (const marker of missing) {
      out.push(...synthesizeMissingMarker(marker, sid));
    }
  }
  return out;
}

function mapMarkersBySid(
  verses: readonly TokenEnvelope[][],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const slice of verses) {
    const sid = slice[0]?.sid;
    if (sid) out.set(sid, listVerseMarkers(slice));
  }
  return out;
}

function synthesizeMissingMarker(marker: string, sid: string): TokenEnvelope[] {
  return [
    {
      tokenType: "marker",
      text: `\\${marker} `,
      marker,
      sid,
    } as TokenEnvelope,
    { tokenType: "nl", text: "\n" } as TokenEnvelope,
  ];
}

/**
 * Compact one-line summary of a token stream's structural shape: every
 * marker, end-marker, and verse number in order, with text spans
 * collapsed to a single `…` placeholder between markers. Used by
 * regression tests to assert that match-formatting yields the same
 * skeleton across refactors of the surrounding UI.
 */
export function formatMarkerSkeleton(tokens: readonly TokenEnvelope[]): string {
  const parts: string[] = [];
  let sawTextSinceMarker = false;
  for (const token of tokens) {
    if (token.tokenType === "marker") {
      if (sawTextSinceMarker) parts.push("…");
      parts.push(`\\${token.marker ?? "?"}`);
      sawTextSinceMarker = false;
      continue;
    }
    if (token.tokenType === "endMarker") {
      if (sawTextSinceMarker) parts.push("…");
      parts.push(`\\${token.marker ?? "?"}*`);
      sawTextSinceMarker = false;
      continue;
    }
    if (token.tokenType === "numberRange") {
      parts.push((token.text ?? "").trim());
      sawTextSinceMarker = false;
      continue;
    }
    if (token.tokenType === "nl") {
      sawTextSinceMarker = false;
      continue;
    }
    if (token.tokenType === "text" && (token.text ?? "").trim().length > 0) {
      sawTextSinceMarker = true;
    }
  }
  return parts.join(" ");
}
