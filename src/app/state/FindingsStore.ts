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
   * `bookCode` (authoritative — never inferred from sids).
   */
  commitBookFindings(
    source: "onion",
    bookCode: string,
    byChapter: FindingsByChapter,
  ): void {
    const book = bookCode.toUpperCase();
    const slice = this.state[source];
    this.state = {
      ...this.state,
      [source]: {
        ...slice,
        byBook: { ...slice?.byBook, [book]: byChapter },
      },
    };
    this.notify();
  }

  /**
   * The sous variant carries the segment-map sidecar in the same commit, so
   * findings and the projection they resolve against can never be observed
   * out of step.
   */
  commitSousBookFindings(
    bookCode: string,
    byChapter: FindingsByChapter,
    segments: SegmentsBySid,
  ): void {
    const book = bookCode.toUpperCase();
    const slice = this.state["sous-chef"];
    this.state = {
      ...this.state,
      "sous-chef": {
        byBook: { ...slice?.byBook, [book]: byChapter },
        segmentsByBook: { ...slice?.segmentsByBook, [book]: segments },
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
