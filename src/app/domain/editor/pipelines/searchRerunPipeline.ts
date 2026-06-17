import { Duration, Effect, Stream } from "effect";

import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

const DEFAULT_SEARCH_RERUN_DEBOUNCE_MS = 250;

/**
 * Predicate for events that should trigger an auto-rerun of search.
 *
 * Always catches `undo` / `redo` (replay restores prior content),
 * `programmaticFix` (lint apply, prettify), and `import` (revert /
 * external apply). Excludes `metadataOnly`, `structuralFixup`, `load`.
 *
 * `userEdit` is conditional via `includeUserEdit`: excluded by default
 * (per-keystroke typing with the pane closed would re-tokenize the
 * project for nothing, and the replace path runs its own scoped rerun),
 * but included while the find panel is open — the docked editor lets the
 * user edit *beside* live results, so those results must refresh as the
 * underlying text changes rather than going stale.
 *
 * Exhaustive per-kind matrix lives in
 * `tests/unit/integration/searchRerunPipeline.test.ts`.
 */
export function isSearchRerunRelevant(
  event: CommitEvent,
  opts?: { includeUserEdit?: boolean },
): boolean {
  if (!event.meta.dirtyTextContent) return false;
  const kind = event.meta.kind;
  if (kind === "userEdit") return opts?.includeUserEdit ?? false;
  return (
    kind === "undo" ||
    kind === "redo" ||
    kind === "programmaticFix" ||
    kind === "import"
  );
}

/**
 * Stream pipeline that re-runs the current search query when the working-
 * files store changes programmatically (undo / redo / programmaticFix /
 * import — see `isSearchRerunRelevant`).
 *
 * Coalesces bursts with a debounce (default 250 ms; longer than the lint
 * pipeline's 100 ms because each rerun re-tokenizes the project at full
 * scope). Reads the live search term and rerun callback via getters so
 * the pipeline forks once per workspace and survives unrelated re-renders
 * — same shape as `structureMaintenancePipeline`'s `getAppSettings` /
 * `getVisibleBookCode` callbacks.
 *
 * Not gated on "search pane open." The user's workflow is "open panel →
 * search → replace → close panel → maybe undo → reopen panel," and
 * reopening must surface fresh results without a manual re-submit. Running
 * while the pane is closed costs one search per qualifying commit;
 * gating it would leave stale state for the next open.
 */
export function makeSearchRerunPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  /** Latest search term. Empty string short-circuits the rerun. */
  getSearchTerm: () => string;
  /**
   * Re-runs the search with the supplied term at project scope, no
   * auto-pick. Wired by the caller to the search hook's
   * `runSearchLogic`.
   */
  rerunSearch: (term: string) => void;
  /**
   * Whether the find panel is currently open. When true, `userEdit`
   * commits also trigger a rerun so docked-editing keeps results fresh;
   * when false (the default), typing never re-runs search. Read live so
   * the pipeline forks once and reflects the latest pane state.
   */
  isSearchActive?: () => boolean;
  debounceMs?: number;
}): Effect.Effect<void> {
  const debounceMs = args.debounceMs ?? DEFAULT_SEARCH_RERUN_DEBOUNCE_MS;
  return args.workingFilesStore.changes.pipe(
    Stream.filter((event) =>
      isSearchRerunRelevant(event, {
        includeUserEdit: args.isSearchActive?.() ?? false,
      }),
    ),
    Stream.debounce(Duration.millis(debounceMs)),
    Stream.tap(() =>
      Effect.sync(() => {
        const term = args.getSearchTerm();
        if (!term.trim()) return;
        args.rerunSearch(term);
      }),
    ),
    Stream.runDrain,
  );
}
