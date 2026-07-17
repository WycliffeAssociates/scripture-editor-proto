import { sortListBySidCanonical } from "@/core/data/bible/bible.ts";

import type { StetTerm } from "./stetCatalog.ts";

// Pure derivation over a validated catalog. No I/O, no React, no workspace
// access — the panel passes in the target (HL) lookup. SIDs arriving here are
// already normalized + deduped by the catalog parser.

export type StetVerseSet = {
  curatedSids: string[];
  /** Valid exhaustive SIDs not already curated (the additive expansion). */
  addedExhaustiveSids: string[];
  /** Curated (collapsed) or the deduped union (expanded), canonical order. */
  visibleSids: string[];
  designatedCount: number;
  /** Whether expanding would add at least one SID (drives the toggle). */
  hasExhaustiveExtra: boolean;
};

function sortSidsCanonical(sids: string[]): string[] {
  return sortListBySidCanonical(sids.map((sid) => ({ sid }))).map((x) => x.sid);
}

/**
 * Resolve the visible verse set for a term. Expansion is a deduped union of
 * curated + exhaustive, never a replacement; both modes render in canonical SID
 * order.
 */
export function resolveTermVerseSet(
  term: StetTerm,
  showExhaustive: boolean,
): StetVerseSet {
  const curatedSids = term.subsetVerses.map((verse) => verse.ref);
  const curatedSet = new Set(curatedSids);
  const addedExhaustiveSids = term.exhaustiveVerses.filter(
    (sid) => !curatedSet.has(sid),
  );
  const visibleSids = sortSidsCanonical(
    showExhaustive ? [...curatedSids, ...addedExhaustiveSids] : curatedSids,
  );
  return {
    curatedSids,
    addedExhaustiveSids,
    visibleSids,
    designatedCount: visibleSids.length,
    hasExhaustiveExtra: addedExhaustiveSids.length > 0,
  };
}

export type StetVerseRow = {
  sid: string;
  /** Frozen GL text for this SID, or null when the snapshot lacks it. */
  sourceText: string | null;
  /** Gloss marks; only populated when `sourceText` is present. */
  ranges: Array<[number, number]>;
  /** Current HL project text for this SID (may be empty). */
  targetText: string;
  /** GL text present in the snapshot. */
  hasSource: boolean;
  /** HL text present (nonblank) in the current project. */
  hasTarget: boolean;
};

/**
 * Build the ordered verse rows for a selected term. A visible SID is never
 * dropped for missing GL or HL text — absence is surfaced via `hasSource` /
 * `hasTarget` so the panel can show explicit fallbacks and count coverage.
 */
export function buildStetRows(args: {
  term: StetTerm;
  showExhaustive: boolean;
  referenceVerses: Record<string, string>;
  targetLookup: Map<string, string>;
}): StetVerseRow[] {
  const { visibleSids } = resolveTermVerseSet(args.term, args.showExhaustive);
  return visibleSids.map((sid) => {
    const frozen = args.referenceVerses[sid];
    const sourceText = typeof frozen === "string" ? frozen : null;
    const targetText = args.targetLookup.get(sid) ?? "";
    return {
      sid,
      sourceText,
      ranges: sourceText !== null ? (args.term.glossRanges[sid] ?? []) : [],
      targetText,
      hasSource: sourceText !== null && sourceText.trim().length > 0,
      hasTarget: targetText.trim().length > 0,
    };
  });
}

export type StetCoverage = {
  presentTargetCount: number;
  designatedCount: number;
};

/** Coverage over the visible rows: HL verses present / designated verses. */
export function computeCoverage(rows: StetVerseRow[]): StetCoverage {
  return {
    presentTargetCount: rows.filter((row) => row.hasTarget).length,
    designatedCount: rows.length,
  };
}

/**
 * Split a definition into display paragraphs on newline boundaries, trimmed,
 * with empties omitted. Rendered as plain text — never HTML.
 */
export function formatStetDefinition(definition: string): string[] {
  return definition
    .split(/(?:\r?\n)+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
