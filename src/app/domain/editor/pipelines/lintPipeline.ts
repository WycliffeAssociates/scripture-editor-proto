import { Effect } from "effect";

import {
  type FoldedBookScope,
  makeFoldedScopePipeline,
} from "@/app/domain/editor/pipelines/foldedScopePipeline.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { AnalyzeScope } from "@/app/domain/mirror/mirrorProtocol.ts";
import { mirrorTrace } from "@/app/domain/mirror/mirrorTrace.ts";
import {
  type ConsumerBookScope,
  NO_BOOKS,
  touchedBooks,
} from "@/app/state/commitFilters.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

const DEFAULT_LINT_DEBOUNCE_MS = 100;

/**
 * Which books lint reacts to for a commit — lint's OWN policy. Floor: never less
 * than a book (the USFM linter's structure checks span chapters within a book,
 * so chapter scopes widen to their books). Excludes `metadataOnly` (no text),
 * `structuralFixup` (writebacks fix structure, don't surface issues), and `load`
 * (initial state is mirror-seeded). `undo`/`redo` are NOT excluded — replay
 * commits carry precise scope, so the touched books re-lint.
 */
export function lintCommitScope(event: CommitEvent): ConsumerBookScope {
  if (!event.meta.dirtyTextContent) return NO_BOOKS;
  const kind = event.meta.kind;
  if (
    kind === "metadataOnly" ||
    kind === "structuralFixup" ||
    kind === "load"
  ) {
    return NO_BOOKS;
  }
  return touchedBooks(event);
}

/**
 * Stream pipeline that drives lint in response to working-files commits.
 *
 * Relevance + expansion live in `lintCommitScope` (book granularity); scopes
 * accumulated across the debounce window are drained as ONE `analyzeLint`
 * command carrying the folded book set + the commit generation. The mirror
 * reads its resident tokens for those books and returns the raw issues per
 * book; the result router (see `makeMirrorResultRouter`) normalizes and commits
 * them into the findings store's onion slice — same supersession-per-book
 * shape as before, just sourced from the mirror instead of an inline service
 * call. The Effect debounce/fold/cancel shell is unchanged.
 */
export function makeLintPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  feed: MirrorFeed;
  debounceMs?: number;
}): Effect.Effect<void> {
  const lintPass = (scope: FoldedBookScope): Effect.Effect<void> =>
    Effect.sync(() => {
      const analyzeScope: AnalyzeScope = scope.all
        ? "all"
        : { books: Array.from(scope.books) };
      const generation = args.workingFilesStore.generation();
      mirrorTrace("pipeline.lint.send", {
        scope: analyzeScope === "all" ? "all" : analyzeScope.books,
        gen: generation,
      });
      args.feed.sendCommand({
        kind: "analyzeLint",
        scope: analyzeScope,
        generation,
      });
    });

  return makeFoldedScopePipeline({
    changes: args.workingFilesStore.changes,
    scopeFor: lintCommitScope,
    debounceMs: args.debounceMs ?? DEFAULT_LINT_DEBOUNCE_MS,
    run: lintPass,
  });
}
