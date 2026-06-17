import type { CommitChapterRef, CommitEvent } from "./types.ts";

// Shared, NON-POLICY commit-scope utilities: the scope TYPES a consumer's
// reaction is expressed in, the empty sentinels, and pure extractors that read
// a commit's own `meta.scope`.
//
// Relevance and widen/narrow POLICY does NOT live here — each consumer owns
// that in its own module (`<x>CommitScope` / `is<x>Relevant`), so policies can
// evolve independently. lint's and sous's reaction scopes looking identical
// today is incidental, not essential; co-located duplication keeps that obvious
// and lets them diverge without a shared function fighting back.

/** A consumer's book-granular reaction scope. Empty set = not relevant. */
export type ConsumerBookScope = ReadonlySet<string> | "all";

/** A consumer's chapter-granular reaction scope. Empty array = not relevant. */
export type ConsumerChapterScope = ReadonlyArray<CommitChapterRef> | "all";

export const NO_BOOKS: ReadonlySet<string> = new Set();
export const NO_CHAPTERS: ReadonlyArray<CommitChapterRef> = [];

/**
 * The books a commit touched, read from its own `meta.scope`. `"all"` for a
 * project-wide commit (reconcile against the whole snapshot, including books
 * that no longer exist — no enumerated set can express that). Pure: reads the
 * commit shape, makes no relevance decision.
 */
export function touchedBooks(event: CommitEvent): ConsumerBookScope {
  const scope = event.meta.scope;
  if ("project" in scope) return "all";
  return new Set(scope.chapters.map((ref) => ref.bookCode));
}

/**
 * The chapters a commit touched, read from its own `meta.scope`. `"all"` for a
 * project-wide commit. Pure: reads the commit shape, makes no relevance
 * decision.
 */
export function touchedChapters(event: CommitEvent): ConsumerChapterScope {
  const scope = event.meta.scope;
  if ("project" in scope) return "all";
  return scope.chapters;
}
