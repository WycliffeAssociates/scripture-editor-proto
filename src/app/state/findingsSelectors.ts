// findingsSelectors.ts
//
// Pure selectors over `FindingsState`. The hierarchical maps are the ONE
// truth; the flat view is derived here and memoized by the caller on the
// root snapshot reference (a new root IS the dirty bit — no proxies, no
// dual-write). Policy filtering composes on top (`presentFinding`); these
// selectors are raw by design and are the ONLY place raw reads are expected
// (consumers go through the policy-filtered `useFindings` views).

import type { Finding } from "@/app/domain/editor/annotations/finding.ts";
import type {
  FindingsState,
  FindingSource,
} from "@/app/state/FindingsStore.ts";
import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

/**
 * Every producer slice, enumerated so the selectors below stay exhaustive: the
 * `satisfies` makes adding a `FindingSource` (a new producer) a COMPILE error
 * here until it's listed, instead of silently invisible in the overlay/panel
 * (the bug local-lint hit). Every slice exposes `byBook`.
 */
const FINDING_SOURCES = {
  onion: true,
  "sous-chef": true,
  "local-lint": true,
} satisfies Record<FindingSource, true>;

const ALL_FINDING_SOURCES = Object.keys(FINDING_SOURCES) as FindingSource[];

/**
 * A finding plus its store address. Book/chapter come from the tree's keys —
 * the commit's authoritative scope — not from re-parsing sids.
 */
export type FlatFinding = {
  bookCode: string;
  chapter: number;
  finding: Finding;
};

/** Every finding from every producer slice, with its store address. */
export function flattenFindings(state: FindingsState): FlatFinding[] {
  const out: FlatFinding[] = [];
  for (const source of ALL_FINDING_SOURCES) {
    const slice = state[source];
    if (!slice) continue;
    for (const [bookCode, byChapter] of Object.entries(slice.byBook)) {
      for (const [chapterKey, findings] of Object.entries(byChapter)) {
        const chapter = Number(chapterKey);
        for (const finding of findings) {
          out.push({ bookCode, chapter, finding });
        }
      }
    }
  }
  return out;
}

/** One book+chapter across every producer slice (onion, sous, local-lint). */
export function chapterFindingsAcrossSources(
  state: FindingsState,
  bookCode: string,
  chapter: number,
): Finding[] {
  const book = bookCode.toUpperCase();
  return ALL_FINDING_SOURCES.flatMap(
    (source) => state[source]?.byBook[book]?.[chapter] ?? [],
  );
}

const EMPTY_SEGMENTS: SegmentsBySid = {};

/** The sous segment sidecar a book's content anchors resolve against. */
export function sousSegmentsForBook(
  state: FindingsState,
  bookCode: string,
): SegmentsBySid {
  return (
    state["sous-chef"]?.segmentsByBook[bookCode.toUpperCase()] ?? EMPTY_SEGMENTS
  );
}
