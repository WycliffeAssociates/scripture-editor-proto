import { Duration, Effect, Stream } from "effect";

import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

const DEFAULT_LINT_DEBOUNCE_MS = 100;

/**
 * Whether a commit should trigger the resident Braid's complete lint snapshot.
 * Braid owns dirty-book narrowing internally; the editor only decides whether
 * text changed and whether this commit class is eligible for a pass.
 */
export function shouldLintCommit(event: CommitEvent): boolean {
  if (!event.meta.dirtyTextContent) return false;
  // Exhaustive over CommitKind: a new kind won't compile until it picks a side.
  switch (event.meta.kind) {
    case "userEdit":
    case "programmaticFix":
    case "import":
    case "undo":
    case "redo":
      return true;
    case "load": // initial state is mirror-seeded
    case "structuralFixup": // writebacks fix structure, don't surface issues
    case "metadataOnly": // no text change
      return false;
  }
}

/**
 * Stream pipeline that drives lint in response to working-files commits.
 *
 * The resident Braid host always lints and publishes the complete corpus; no
 * editor-owned book scope is folded into the command.
 */
export function makeLintPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  feed: MirrorFeed;
  debounceMs?: number;
}): Effect.Effect<void> {
  return args.workingFilesStore.changes.pipe(
    Stream.map(shouldLintCommit),
    Stream.filter(Boolean),
    Stream.debounce(
      Duration.millis(args.debounceMs ?? DEFAULT_LINT_DEBOUNCE_MS),
    ),
    Stream.mapEffect(() =>
      Effect.sync(() => {
        args.feed.sendCommand({
          kind: "analyzeLint",
          generation: args.workingFilesStore.generation(),
        });
      }),
    ),
    Stream.runDrain,
  );
}
