import { Effect } from "effect";

import type { FindingsByChapter } from "@/app/domain/editor/annotations/finding.ts";
import {
  analyzeChapterSequence,
  analyzeChapterVerses,
  type ChapterMarker,
  chapterMarkerOf,
  type LocalLintIssue,
} from "@/app/domain/editor/annotations/localLint/numberingRules.ts";
import {
  groupFindingsByChapter,
  localLintIssuesToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
import {
  type FoldedChapterScope,
  makeFoldedChapterScopePipeline,
} from "@/app/domain/editor/pipelines/foldedChapterScopePipeline.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
  type ConsumerChapterScope,
  NO_CHAPTERS,
  touchedChapters,
} from "@/app/state/commitFilters.ts";
import type { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

const DEFAULT_LOCAL_LINT_DEBOUNCE_MS = 100;

/**
 * Which chapters local-lint reacts to for a commit — its OWN policy (chapter
 * granularity; `load` excluded because the kernel seeds the initial state). The
 * relevance guard is the first gate; `touchedChapters` reads the commit's own
 * scope. The stateful recompute decision lives in `run` below — a pure
 * function couldn't express it, which is why scope policy lives per-pipeline.
 */
function localLintCommitScope(event: CommitEvent): ConsumerChapterScope {
  if (!event.meta.dirtyTextContent) return NO_CHAPTERS;
  const kind = event.meta.kind;
  if (
    kind === "metadataOnly" ||
    kind === "structuralFixup" ||
    kind === "load"
  ) {
    return NO_CHAPTERS;
  }
  return touchedChapters(event);
}

/** A book's `\c` markers in chapter order — the input to chapter-sequence analysis. */
function chapterMarkersOf(book: ScriptureBookState): ChapterMarker[] {
  return [...book.chapters]
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((chapter) => chapterMarkerOf(chapter.currentTokens))
    .filter((marker): marker is ChapterMarker => marker !== null);
}

/**
 * The book's chapter-number sequence as a string — the fingerprint that decides
 * commit grain. Comparing it to the cached value IS the invalidation: unchanged
 * → a verse edit can't have moved the sequence, so commit per touched chapter;
 * changed → a `\c` was added/removed/renumbered, so the whole book recomputes.
 */
function signatureOf(markers: ChapterMarker[]): string {
  return markers.map((marker) => marker.number).join(",");
}

/** Every local-lint issue for a book: chapter-sequence + each chapter's verses. */
function bookIssues(
  book: ScriptureBookState,
  markers: ChapterMarker[],
): LocalLintIssue[] {
  return [
    ...analyzeChapterSequence(markers),
    ...book.chapters.flatMap((chapter) =>
      analyzeChapterVerses(chapter.currentTokens),
    ),
  ];
}

function bookByChapter(
  book: ScriptureBookState,
  markers: ChapterMarker[],
): FindingsByChapter {
  return groupFindingsByChapter(
    localLintIssuesToFindings(bookIssues(book, markers)),
  );
}

/**
 * Synchronous project-wide reduce for first-paint seeding (the kernel runs this
 * once it has the loaded tokens, before the live pipeline subscribes). Only
 * books with findings are returned — there is nothing to supersede at load, so
 * empty `{}` commits would be noise.
 */
export function reduceProjectLocalLint(
  books: readonly ScriptureBookState[],
): Record<string, FindingsByChapter> {
  const byBook: Record<string, FindingsByChapter> = {};
  for (const book of books) {
    const byChapter = bookByChapter(book, chapterMarkersOf(book));
    if (Object.keys(byChapter).length > 0) byBook[book.bookCode] = byChapter;
  }
  return byBook;
}

/**
 * The third findings producer, and the only main-thread one: a pure reduce over
 * working-files tokens for intrinsic consistency (verse/chapter monotonicity),
 * committed straight into the findings store's `local-lint` slice — no mirror
 * command, no result router, no stale-drop. It is the reference implementation
 * of a stateful scope-coordinator (the cheapest place to set the precedent the
 * off-main producers will follow): rules run at their natural scope —
 * verse-monotonicity per CHAPTER, chapter-monotonicity per BOOK — and the owner
 * recomputes the minimum.
 *
 * Per touched book it holds a `\c`-sequence signature (closure state — the same
 * flavor as Tier B's coming `\cl` tally hash, so that folds in here later):
 *   - signature UNCHANGED (common — verse text edits): recompute only the
 *     touched chapters and commit each per-chapter (`commitChapterFindings`).
 *     Each chapter's cell is the union of its verse findings and its own
 *     chapter-mono finding, so the families never clobber each other.
 *   - signature CHANGED (rare — a `\c` added/removed/renumbered): recompute the
 *     whole book and commit book-grained, which also clears the stale chapter
 *     keys a renumber leaves behind. First sight of a book is a cache miss, so
 *     its first touch this session takes this path once.
 *
 * Relevance is `localLintScopeFor` (chapter granularity); `load` is excluded
 * because the kernel seeds the initial state.
 */
export function makeLocalLintPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  findingsStore: FindingsStore;
  debounceMs?: number;
}): Effect.Effect<void> {
  // Per-book `\c`-sequence signature; the comparison is the invalidation.
  const signatures = new Map<string, string>();

  const commitWholeBook = (
    book: ScriptureBookState,
    markers: ChapterMarker[],
  ): void => {
    signatures.set(book.bookCode.toUpperCase(), signatureOf(markers));
    args.findingsStore.commitBookFindings(
      "local-lint",
      book.bookCode,
      bookByChapter(book, markers),
    );
  };

  const run = (scope: FoldedChapterScope): Effect.Effect<void> =>
    Effect.sync(() => {
      const books = args.workingFilesStore.read();

      if (scope.all) {
        for (const book of books) commitWholeBook(book, chapterMarkersOf(book));
        return;
      }

      const byCode = new Map(
        books.map((book) => [book.bookCode.toUpperCase(), book]),
      );
      const touchedByBook = new Map<string, Set<number>>();
      for (const ref of scope.chapters.values()) {
        const code = ref.bookCode.toUpperCase();
        const set = touchedByBook.get(code) ?? new Set<number>();
        set.add(ref.chapterNum);
        touchedByBook.set(code, set);
      }

      for (const [code, chapterNums] of touchedByBook) {
        const book = byCode.get(code);
        if (!book) continue;
        const markers = chapterMarkersOf(book);

        // Sequence moved (or first sight) → whole-book replace clears stale keys.
        if (signatureOf(markers) !== signatures.get(code)) {
          commitWholeBook(book, markers);
          continue;
        }

        // Sequence stable → recompute only the touched chapters. Each cell is
        // verse-mono ∪ that chapter's chapter-mono (keyed by the marker number).
        const sequenceByChapter = new Map<number, LocalLintIssue[]>();
        for (const issue of analyzeChapterSequence(markers)) {
          const bucket = sequenceByChapter.get(issue.found) ?? [];
          bucket.push(issue);
          sequenceByChapter.set(issue.found, bucket);
        }
        for (const chapterNum of chapterNums) {
          const chapter = book.chapters.find(
            (candidate) => candidate.chapterNumber === chapterNum,
          );
          const cellIssues = [
            ...(sequenceByChapter.get(chapterNum) ?? []),
            ...(chapter ? analyzeChapterVerses(chapter.currentTokens) : []),
          ];
          args.findingsStore.commitChapterFindings(
            "local-lint",
            book.bookCode,
            chapterNum,
            localLintIssuesToFindings(cellIssues),
          );
        }
      }
    });

  return makeFoldedChapterScopePipeline({
    changes: args.workingFilesStore.changes,
    scopeFor: localLintCommitScope,
    debounceMs: args.debounceMs ?? DEFAULT_LOCAL_LINT_DEBOUNCE_MS,
    run,
  });
}
