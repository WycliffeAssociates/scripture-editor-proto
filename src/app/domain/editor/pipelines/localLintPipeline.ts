import { Effect } from "effect";

import {
  findChapterLabelEntries,
  tallyChapterLabels,
} from "@/app/domain/editor/annotations/chapterLabelTally.ts";
import type { FindingsByChapter } from "@/app/domain/editor/annotations/finding.ts";
import {
  analyzeChapterSequence,
  analyzeChapterVerses,
  type ChapterMarker,
  chapterMarkerOf,
  type LocalLintIssue,
} from "@/app/domain/editor/annotations/localLint/numberingRules.ts";
import {
  type ChapterLabelIssue,
  localLintChapterLabelFindings,
  localLintIssuesToFindings,
} from "@/app/domain/editor/annotations/normalizeFindings.ts";
import {
  type FoldedChapterScope,
  makeFoldedChapterScopePipeline,
} from "@/app/domain/editor/pipelines/foldedChapterScopePipeline.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
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
  // Exhaustive over CommitKind: a new kind won't compile until it picks a side.
  switch (event.meta.kind) {
    case "userEdit":
    case "programmaticFix":
    case "import":
    case "undo":
    case "redo":
      return touchedChapters(event);
    case "load": // initial state is kernel-seeded
    case "structuralFixup":
    case "metadataOnly":
      return NO_CHAPTERS;
  }
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

/**
 * The project's dominant `\cl` stem — the SECOND signature this owner holds.
 * Off-dominant labels are the Tier-B findings, so the dominant is the only
 * cross-book input: when it flips, `\cl` findings can move in books no commit
 * touched (the fan-out below); when it holds, only touched chapters change.
 * `\cl` is rare (most books 0–1), so the project scan is near-free.
 */
function projectDominantStem(
  books: readonly ScriptureBookState[],
): string | null {
  const entries = books.flatMap((book) =>
    book.chapters.flatMap((chapter) =>
      findChapterLabelEntries(chapter.currentTokens),
    ),
  );
  return tallyChapterLabels(entries).dominant;
}

/** Off-dominant `\cl` issues for one chapter, anchored to the label text token. */
export function chapterLabelIssuesFor(
  chapter: ScriptureChapterState,
  dominant: string | null,
): ChapterLabelIssue[] {
  if (dominant == null) return [];
  const issues: ChapterLabelIssue[] = [];
  for (const entry of findChapterLabelEntries(chapter.currentTokens)) {
    if (entry.textTokenId == null || entry.stem === dominant) continue;
    issues.push({
      textTokenId: entry.textTokenId,
      label: entry.stem,
      dominant,
    });
  }
  return issues;
}

function pushTo<T>(map: Map<number, T[]>, key: number, value: T): void {
  const bucket = map.get(key) ?? [];
  bucket.push(value);
  map.set(key, bucket);
}

/**
 * A whole book's findings, bucketed by chapter — built by EXPLICIT chapter
 * number, not `groupFindingsByChapter` (canonical tokens carry no sid to derive
 * it from). Chapter-mono buckets by the offending `\c`'s number; verse-mono and
 * `\cl` bucket by the chapter the owner is iterating.
 */
function bookByChapter(
  book: ScriptureBookState,
  markers: ChapterMarker[],
  dominant: string | null,
): FindingsByChapter {
  const numberingByChapter = new Map<number, LocalLintIssue[]>();
  const labelsByChapter = new Map<number, ChapterLabelIssue[]>();

  for (const issue of analyzeChapterSequence(markers)) {
    pushTo(numberingByChapter, issue.found, issue);
  }
  for (const chapter of book.chapters) {
    for (const issue of analyzeChapterVerses(chapter.currentTokens)) {
      pushTo(numberingByChapter, chapter.chapterNumber, issue);
    }
    for (const issue of chapterLabelIssuesFor(chapter, dominant)) {
      pushTo(labelsByChapter, chapter.chapterNumber, issue);
    }
  }

  const byChapter: FindingsByChapter = {};
  for (const chapter of new Set([
    ...numberingByChapter.keys(),
    ...labelsByChapter.keys(),
  ])) {
    byChapter[chapter] = [
      ...localLintIssuesToFindings(numberingByChapter.get(chapter) ?? []),
      ...localLintChapterLabelFindings(labelsByChapter.get(chapter) ?? []),
    ];
  }
  return byChapter;
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
  const dominant = projectDominantStem(books);
  const byBook: Record<string, FindingsByChapter> = {};
  for (const book of books) {
    const byChapter = bookByChapter(book, chapterMarkersOf(book), dominant);
    if (Object.keys(byChapter).length > 0) byBook[book.bookCode] = byChapter;
  }
  return byBook;
}

/**
 * The third findings producer, and the only main-thread one: a pure reduce over
 * working-files tokens for intrinsic consistency, committed straight into the
 * findings store's `local-lint` slice — no mirror command, no result router, no
 * stale-drop. It is the reference implementation of a stateful scope-coordinator
 * (the cheapest place to set the precedent the off-main producers will follow):
 * rules run at their natural scope — verse-monotonicity per CHAPTER,
 * chapter-monotonicity per BOOK, `\cl` agreement per PROJECT — and the owner
 * recomputes the minimum off two cached signatures (the comparison IS the
 * invalidation):
 *   - per-book `\c`-sequence signature → numbering commit grain:
 *       UNCHANGED (common — verse edits): recompute only the touched chapters,
 *       commit each per-chapter (`commitChapterFindings`).
 *       CHANGED (rare — a `\c` added/removed/renumbered): recompute the whole
 *       book, book-grain commit (also clears stale chapter keys a renumber leaves).
 *   - project `\cl` dominant signature → Tier-B fan-out:
 *       UNCHANGED: off-dominant labels can only have moved in a TOUCHED book
 *       (handled by its own path), so no extra work.
 *       CHANGED (dominant flipped): every book's `\cl` findings may move, so
 *       recommit all books whole.
 * Each chapter cell is the union of its numbering findings and its `\cl`
 * findings, so the families never clobber each other. First sight of the
 * project (cache miss) fans out once; first touch of a book recomputes it once.
 *
 * Relevance is `localLintCommitScope` (chapter granularity); `load` is excluded
 * because the kernel seeds the initial state.
 */
export function makeLocalLintPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  findingsStore: FindingsStore;
  debounceMs?: number;
}): Effect.Effect<void> {
  // Per-book `\c`-sequence signatures + the project `\cl` dominant; comparing
  // each to its cached value is the invalidation.
  const signatures = new Map<string, string>();
  let dominantCache: string | null | undefined;

  const commitWholeBook = (
    book: ScriptureBookState,
    markers: ChapterMarker[],
    dominant: string | null,
  ): void => {
    signatures.set(book.bookCode.toUpperCase(), signatureOf(markers));
    args.findingsStore.commitBookFindings(
      "local-lint",
      book.bookCode,
      bookByChapter(book, markers, dominant),
    );
  };

  const run = (scope: FoldedChapterScope): Effect.Effect<void> =>
    Effect.sync(() => {
      const books = args.workingFilesStore.read();
      const dominant = projectDominantStem(books);
      const dominantChanged = dominant !== dominantCache;
      dominantCache = dominant;

      // Project-wide commit, or a dominant flip that can move `\cl` findings in
      // untouched books → recommit every book whole.
      if (scope.all || dominantChanged) {
        for (const book of books) {
          commitWholeBook(book, chapterMarkersOf(book), dominant);
        }
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
          commitWholeBook(book, markers, dominant);
          continue;
        }

        // Sequence stable → recompute only the touched chapters. Each cell is
        // verse-mono ∪ that chapter's chapter-mono ∪ its off-dominant `\cl`.
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
          const numbering = [
            ...(sequenceByChapter.get(chapterNum) ?? []),
            ...(chapter ? analyzeChapterVerses(chapter.currentTokens) : []),
          ];
          const cell = [
            ...localLintIssuesToFindings(numbering),
            ...localLintChapterLabelFindings(
              chapter ? chapterLabelIssuesFor(chapter, dominant) : [],
            ),
          ];
          args.findingsStore.commitChapterFindings(
            "local-lint",
            book.bookCode,
            chapterNum,
            cell,
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
