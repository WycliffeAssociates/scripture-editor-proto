import { Effect } from "effect";
import type { SousConfig } from "scripture-sous-chef-web";

import {
  type FoldedBookScope,
  makeFoldedScopePipeline,
} from "@/app/domain/editor/pipelines/foldedScopePipeline.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import { endDevTimer } from "@/app/domain/mirror/performanceTiming.ts";
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
const DEFAULT_SOUS_DEBOUNCE_MS = 30;

/**
 * Which books sous re-analyzes for a commit — sous's OWN policy (same relevance
 * class as lint today, but owned here so it can diverge). Action-keyed widening
 * belongs here: a verb whose effects are cross-book statistical maps to `"all"`
 * once a sous rule consumes corpus-level state.
 */
export function sousCommitScope(event: CommitEvent): ConsumerBookScope {
  if (!event.meta.dirtyTextContent) return NO_BOOKS;
  // Exhaustive over CommitKind: a new kind won't compile until it picks a side.
  switch (event.meta.kind) {
    case "userEdit":
    case "programmaticFix":
    case "import":
    case "undo":
    case "redo":
      return touchedBooks(event);
    case "load":
    case "structuralFixup":
    case "metadataOnly":
      return NO_BOOKS;
  }
}

/**
 * Stream pipeline that drives sous content analysis in response to working-
 * files commits — a PARALLEL subscriber to the same store the lint pipeline
 * rides, on its own calmer debounce.
 *
 * `sousCommitScope` fuses relevance (empty set = skip) and expansion into one
 * function — for a scoped consumer "relevant" just means "non-empty scope", so
 * there's no separate relevance predicate. The folded scope drains as one
 * whole-corpus `analyzeGalley` command; the edited books only determine when
 * the pass runs. The result router commits the complete snapshot and segment
 * map after main-thread materialization.
 */
export function makeSousPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  feed: MirrorFeed;
  debounceMs?: number;
  config?: () => SousConfig;
}): Effect.Effect<void> {
  const sousPass = (scope: FoldedBookScope): Effect.Effect<void> =>
    Effect.sync(() => {
      const generation = args.workingFilesStore.generation();
      const config = args.config?.();
      if (import.meta.env.DEV && !scope.all) {
        endDevTimer(`sous:chapter-to-command:${generation}`);
      }
      args.feed.sendCommand({
        kind: "analyzeGalley",
        generation,
        config,
        cachePolicy: "none",
      });
    });

  return makeFoldedScopePipeline({
    changes: args.workingFilesStore.changes,
    scopeFor: sousCommitScope,
    debounceMs: args.debounceMs ?? DEFAULT_SOUS_DEBOUNCE_MS,
    run: sousPass,
  });
}
