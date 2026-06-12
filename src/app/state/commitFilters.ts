import type { CommitChapterRef, CommitEvent } from "./types.ts";

/**
 * Per-subscriber commit policies. Single source of truth: if a new
 * `CommitKind` lands or a subscriber's policy shifts, change it here, not at
 * near-identical call sites in each pipeline.
 *
 * Two shapes live here:
 *
 * - **Scope policies** (`lintScopeFor`, `sousScopeFor`): fuse "is this commit
 *   relevant to me?" and "at what scope do I react?" into one return value —
 *   the consumer's work-unit set, where EMPTY means skip. Producers state
 *   facts (`scope`, `kind`, `action`); each consumer owns its own expansion.
 *   The `"all"` sentinel mirrors `CommitScope`'s: it means "reconcile against
 *   the whole snapshot, including books that no longer exist" (which no
 *   enumerated set can express) and it folds cheaply across a debounce
 *   window (`anything ∪ all = all`).
 *
 * - **Boolean predicates** (save status, structure maintenance, dirty
 *   buffer): subscribers whose reaction has no meaningful scope axis.
 *
 * `metadataOnly` events (selection-only commits from the bridge) are
 * excluded everywhere — no current subscriber materializes them.
 */

/** A consumer's book-granular reaction scope. Empty set = not relevant. */
export type ConsumerBookScope = ReadonlySet<string> | "all";

const NO_BOOKS: ReadonlySet<string> = new Set();

function scopeBooks(event: CommitEvent): ConsumerBookScope {
  const scope = event.meta.scope;
  if ("project" in scope) return "all";
  return new Set(scope.chapters.map((ref) => ref.bookCode));
}

/**
 * Which books lint reacts to for a commit. Floor: never less than a book —
 * the USFM linter's structure checks span chapters within a book, so chapter
 * scopes widen to their books.
 *
 * Excluded kinds: `metadataOnly` (no text change), `structuralFixup` (its
 * writebacks fix structure, not surface new issues), `load` (initial lint
 * state is loader-seeded). `undo`/`redo` are NOT excluded — replay commits
 * carry precise chapter scope, so the pipeline re-lints exactly the touched
 * books.
 */
export function lintScopeFor(event: CommitEvent): ConsumerBookScope {
  if (!event.meta.dirtyTextContent) return NO_BOOKS;
  const kind = event.meta.kind;
  if (
    kind === "metadataOnly" ||
    kind === "structuralFixup" ||
    kind === "load"
  ) {
    return NO_BOOKS;
  }
  return scopeBooks(event);
}

/**
 * Which books sous re-analyzes for a commit. Same relevance class as lint
 * today. Action-keyed widening belongs here: a verb whose effects are
 * cross-book statistical (e.g. chapter-label consistency) maps its `action`
 * to `"all"` once a sous rule actually consumes corpus-level state.
 */
export function sousScopeFor(event: CommitEvent): ConsumerBookScope {
  if (!event.meta.dirtyTextContent) return NO_BOOKS;
  const kind = event.meta.kind;
  if (
    kind === "metadataOnly" ||
    kind === "structuralFixup" ||
    kind === "load"
  ) {
    return NO_BOOKS;
  }
  return scopeBooks(event);
}

/** A consumer's chapter-granular reaction scope. Empty array = not relevant. */
export type ConsumerChapterScope = ReadonlyArray<CommitChapterRef> | "all";

const NO_CHAPTERS: ReadonlyArray<CommitChapterRef> = [];

/**
 * Which chapters the unsaved-diff view refreshes for a commit. Chapter
 * granularity — diffs are per-chapter (`sourceTokens` vs `currentTokens`).
 * Only consumed while the diff modal is OPEN; when closed there is no
 * subscription at all and `open()` rebuilds from the dirty set.
 */
export function diffScopeFor(event: CommitEvent): ConsumerChapterScope {
  if (!event.meta.dirtyTextContent) return NO_CHAPTERS;
  const kind = event.meta.kind;
  if (
    kind === "metadataOnly" ||
    kind === "structuralFixup" ||
    kind === "load"
  ) {
    return NO_CHAPTERS;
  }
  const scope = event.meta.scope;
  if ("project" in scope) return "all";
  return scope.chapters;
}

/**
 * Which chapters the editor-sync pipeline considers for a commit. Only
 * programmatic content mutations sync back into the visible editor:
 * `userEdit` originates FROM the editor (writing back would clobber
 * selection/IME), and `undo`/`redo` replay restores its own content and
 * selection. The pipeline intersects the result with the visible chapter at
 * fire time.
 */
export function editorSyncScopeFor(event: CommitEvent): ConsumerChapterScope {
  if (!event.meta.dirtyTextContent) return NO_CHAPTERS;
  const kind = event.meta.kind;
  if (kind !== "programmaticFix" && kind !== "import") return NO_CHAPTERS;
  const scope = event.meta.scope;
  if ("project" in scope) return "all";
  return scope.chapters;
}

export function isSaveStatusRelevant(event: CommitEvent): boolean {
  if (!event.meta.dirtyTextContent) return false;
  const kind = event.meta.kind;
  return (
    kind !== "metadataOnly" && kind !== "structuralFixup" && kind !== "load"
  );
}

export function isStructureMaintenanceRelevant(event: CommitEvent): boolean {
  return event.meta.kind === "userEdit" && event.meta.dirtyTextContent;
}

/**
 * Which commits the crash-recovery dirty-buffer pipeline reconciles against.
 *
 * Widest policy of the four: the pipeline must react to anything that could make
 * a book dirty (so it writes a backup) OR clean (so it clears one). That means
 * it cannot filter on `dirtyTextContent` — the save flow's clean-marking commit
 * is `metadataOnly` with `dirtyTextContent: false`, and that is exactly the
 * event that should clear a book's backup.
 *
 * Only two exclusions:
 *  - `load` — initial project/chapter population. Any backup that should exist is
 *    already on disk; the loader handles restoration, not the pipeline.
 *  - `selectionOnly` *patches* — pure cursor/selection moves change no state
 *    (`applyPatch` returns the same array), so there is nothing to reconcile.
 *    (Note this keys off the patch kind, not `meta.kind`: a `metadataOnly` meta
 *    carrying a `bulk`/`metadata` patch — e.g. the save clean-mark — DOES flip
 *    dirty flags and must be reconciled.)
 */
export function isDirtyBufferRelevant(event: CommitEvent): boolean {
  if (event.meta.kind === "load") return false;
  if (event.patch.kind === "selectionOnly") return false;
  return true;
}
