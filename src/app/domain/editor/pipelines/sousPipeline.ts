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

// sous work is more expensive than lint and wants its own clock — a calmer
// cadence than lint's ~100ms. A superseded pass is still cancelled, so this
// is "lint at typing cadence + sous at a calmer cadence", not 2x traffic.
const DEFAULT_SOUS_DEBOUNCE_MS = 100;

/**
 * Which books sous re-analyzes for a commit — sous's OWN policy (same relevance
 * class as lint today, but owned here so it can diverge). Action-keyed widening
 * belongs here: a verb whose effects are cross-book statistical maps to `"all"`
 * once a sous rule consumes corpus-level state.
 */
export function sousCommitScope(event: CommitEvent): ConsumerBookScope {
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
 * Stream pipeline that drives sous content analysis in response to working-
 * files commits — a PARALLEL subscriber to the same store the lint pipeline
 * rides, on its own calmer debounce.
 *
 * Relevance + expansion live in `sousCommitScope` (book granularity). The folded
 * scope drains as one `analyzeSous` command; the mirror assembles each book's
 * tokens from resident state (the vref build + sous run happen mirror-side) and
 * returns the per-book result. The result router commits findings + the segment
 * map into the sous slice — same downstream shape as the old inline analyze.
 */
export function makeSousPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  feed: MirrorFeed;
  debounceMs?: number;
}): Effect.Effect<void> {
  const sousPass = (scope: FoldedBookScope): Effect.Effect<void> =>
    Effect.sync(() => {
      const analyzeScope: AnalyzeScope = scope.all
        ? "all"
        : { books: Array.from(scope.books) };
      const generation = args.workingFilesStore.generation();
      mirrorTrace("pipeline.sous.send", {
        scope: analyzeScope === "all" ? "all" : analyzeScope.books,
        gen: generation,
      });
      args.feed.sendCommand({
        kind: "analyzeSous",
        scope: analyzeScope,
        generation,
      });
    });

  return makeFoldedScopePipeline({
    changes: args.workingFilesStore.changes,
    scopeFor: sousCommitScope,
    debounceMs: args.debounceMs ?? DEFAULT_SOUS_DEBOUNCE_MS,
    run: sousPass,
  });
}
