import { Effect } from "effect";

import {
  type FoldedBookScope,
  makeFoldedScopePipeline,
} from "@/app/domain/editor/pipelines/foldedScopePipeline.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { AnalyzeScope } from "@/app/domain/mirror/mirrorProtocol.ts";
import { sousScopeFor } from "@/app/state/commitFilters.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

// sous work is more expensive than lint and wants its own clock — a calmer
// cadence than lint's ~100ms. A superseded pass is still cancelled, so this
// is "lint at typing cadence + sous at a calmer cadence", not 2x traffic.
const DEFAULT_SOUS_DEBOUNCE_MS = 200;

/**
 * Stream pipeline that drives sous content analysis in response to working-
 * files commits — a PARALLEL subscriber to the same store the lint pipeline
 * rides, on its own calmer debounce.
 *
 * Relevance + expansion live in `sousScopeFor` (book granularity). The folded
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
      args.feed.sendCommand({
        kind: "analyzeSous",
        scope: analyzeScope,
        generation: args.workingFilesStore.generation(),
      });
    });

  return makeFoldedScopePipeline({
    changes: args.workingFilesStore.changes,
    scopeFor: sousScopeFor,
    debounceMs: args.debounceMs ?? DEFAULT_SOUS_DEBOUNCE_MS,
    run: sousPass,
  });
}
