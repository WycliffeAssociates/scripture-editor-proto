// FindingsStore.ts
//
// THE workspace store for everything analyzers say about the project — onion
// lint and sous-chef content findings today, future producers as new slices.
// Replaces the per-producer LintStore/SousFindingsStore pair.
//
// Shape: namespace-partitioned by PRODUCER (the only true addressing — a slow
// analyzer can never clobber a fast one because it only ever writes its own
// slice), hierarchical within (`source → book → chapter → Finding[]`,
// mirroring working-files structure because writes are inherently
// book-grained). Chapter is the smallest invalidation scope; verse/sid stays
// on the Finding and is a filter. Chapter 0 is a first-class bucket (front
// matter — findings before `\c 1`).
//
// Supersession is STRUCTURAL, not procedural: a commit replaces the book node
// wholesale, so a pass that found zero issues commits `{}` and the clear
// cannot be forgotten — there is no merge rule to forget. Writes are
// path-copy (root, touched slice, touched book get new references; every
// untouched sibling keeps its reference), which IS the invalidation system:
// `useSyncExternalStore` consumers select into the tree and reference-keyed
// memos skip untouched branches.
//
// Pipelines own their cadence (debounce/switchMap per subscriber); this store
// owns none — it merges what arrives. The store holds NO display strings:
// messages are formatted at the React edge (`formatFindingMessage`).

import type {
  Finding,
  FindingsByChapter,
} from "@/app/domain/editor/annotations/finding.ts";
import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

type Listener = () => void;

/** The scope hierarchy every producer's slice satisfies: book → chapter. */
export type FindingsByScope = Record<string, FindingsByChapter>;

/**
 * One entry per producer — a closed map, extended by a deliberate type edit
 * when a producer ships (an `app` slice joins with the first real
 * app-namespaced producer, alongside its `Finding` union arm).
 */
interface SourceSliceMap {
  onion: { byBook: FindingsByScope };
  "sous-chef": {
    byBook: FindingsByScope;
    /** Sidecar: the vref segment maps findings resolve against, same book grain. */
    segmentsByBook: Record<string, SegmentsBySid>;
  };
  /**
   * Intrinsic consistency (verse/chapter monotonicity, chapter-label
   * agreement) — a pure main-thread reduce over working-files tokens, no
   * mirror round-trip. Same plain `{ byBook }` shape as onion.
   */
  "local-lint": { byBook: FindingsByScope };
}

export type FindingsState = Partial<SourceSliceMap>;
export type FindingSource = keyof SourceSliceMap;

const EMPTY_FINDINGS: Finding[] = [];

export class FindingsStore {
  private state: FindingsState = {};
  private readonly listeners = new Set<Listener>();

  read(): FindingsState {
    return this.state;
  }

  /** React-side `useSyncExternalStore` getSnapshot. */
  getSnapshot = (): FindingsState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Replace one book's findings in one producer's slice — the supersession
   * unit. Zero findings = `{}`. The caller's pipeline scope supplies
   * `bookCode` (authoritative — never inferred from sids). Serves the two
   * plain `{ byBook }` slices (onion, local-lint); sous commits through its
   * own method because it carries the segment sidecar. local-lint also has a
   * finer `commitChapterFindings` for its chapter-scope recompute; it falls
   * back to this whole-book replace when a `\c` renumber changes chapter keys.
   */
  commitBookFindings(
    source: "onion" | "local-lint",
    bookCode: string,
    byChapter: FindingsByChapter,
  ): void {
    const book = bookCode.toUpperCase();
    const slice = this.state[source];
    if (sameChapterFindings(slice?.byBook[book], byChapter)) return;
    this.state = {
      ...this.state,
      [source]: {
        ...slice,
        byBook: { ...slice?.byBook, [book]: byChapter },
      },
    };
    this.notify();
  }

  /** Replace the complete Braid lint snapshot in one transaction. */
  commitBraidSnapshot(byBook: FindingsByScope): void {
    const current = this.state.onion?.byBook;
    if (sameBookFindings(current, byBook)) return;
    this.state = {
      ...this.state,
      onion: { byBook },
    };
    this.notify();
  }

  /**
   * Replace ONE chapter's findings in a plain `{ byBook }` slice — a finer
   * supersession unit than `commitBookFindings`, path-copying at the chapter
   * level so untouched chapters of the same book keep their references. Used by
   * local-lint's chapter-scope recompute: when a verse edit can't have moved the
   * book's `\c` sequence, only the touched chapter's cell is rewritten. An empty
   * `findings` clears the chapter (its last finding was fixed).
   */
  commitChapterFindings(
    source: "onion" | "local-lint",
    bookCode: string,
    chapter: number,
    findings: Finding[],
  ): void {
    const book = bookCode.toUpperCase();
    const slice = this.state[source];
    const existingBook = slice?.byBook[book] ?? {};
    this.state = {
      ...this.state,
      [source]: {
        ...slice,
        byBook: {
          ...slice?.byBook,
          [book]: { ...existingBook, [chapter]: findings },
        },
      },
    };
    this.notify();
  }

  /** Replace the complete Galley snapshot and its projection sidecar atomically. */
  commitSousFindings(byBook: FindingsByScope, segments: SegmentsBySid): void {
    const segmentsByBook: Record<string, SegmentsBySid> = {};
    for (const [sid, value] of Object.entries(segments)) {
      const book = sid.split(" ")[0]?.toUpperCase() ?? "?";
      segmentsByBook[book] ??= {};
      segmentsByBook[book][sid] = value;
    }
    const current = this.state["sous-chef"];
    if (
      sameBookFindings(current?.byBook, byBook) &&
      sameSegments(current?.segmentsByBook, segmentsByBook)
    ) {
      return;
    }
    this.state = {
      ...this.state,
      "sous-chef": {
        byBook,
        segmentsByBook,
      },
    };
    this.notify();
  }

  /** One book+chapter's findings for one producer; stable `[]` when absent. */
  chapterFindings(
    source: FindingSource,
    bookCode: string,
    chapter: number,
  ): Finding[] {
    return (
      this.state[source]?.byBook[bookCode.toUpperCase()]?.[chapter] ??
      EMPTY_FINDINGS
    );
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function sameChapterFindings(
  left: FindingsByChapter | undefined,
  right: FindingsByChapter,
): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((key) => left[Number(key)] === right[Number(key)]);
}

function sameBookFindings(
  left: FindingsByScope | undefined,
  right: FindingsByScope,
): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((book) =>
    sameChapterFindings(left[book], right[book]),
  );
}

function sameSegments(
  left: Record<string, SegmentsBySid> | undefined,
  right: Record<string, SegmentsBySid>,
): boolean {
  if (!left) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((book) => {
    const leftSids = left[book];
    const rightSids = right[book];
    if (!leftSids || !rightSids) return false;
    const sidKeys = Object.keys(rightSids);
    if (Object.keys(leftSids).length !== sidKeys.length) return false;
    return sidKeys.every((sid) => leftSids[sid] === rightSids[sid]);
  });
}
