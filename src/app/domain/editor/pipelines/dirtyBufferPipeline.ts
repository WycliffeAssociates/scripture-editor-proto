// dirtyBufferPipeline.ts
//
// Paces per-book crash-recovery backup commands against the live working-files
// state. Serialization (which chapters, what bytes) and the FS write live in
// the mirror, not here; this pipeline owns only the per-book pacing policy —
// the part that belongs on the main thread beside the other commit pipelines —
// and turns each fire into a `writeBackup` command. The mirror reads its
// resident tokens, makes the dirty/clean decision (any dirty chapter → write
// the whole book; all clean → clear), serializes byte-identically to a real
// save, and persists (web) or ships the bytes back for main to write (desktop,
// via the result router).
//
// Per-book substreams (`groupByKey`) so a busy book never starves a quiet one.
// Each book's commands are paced by a debounce (flush ~idleMs after typing
// pauses) merged with a max-staleness ceiling (force a flush at least every
// ceilingMs so sustained typing can't outrun the safety net). The command is
// idempotent — the mirror re-reads its own latest truth on every one — so
// duplicate/overlapping triggers from the two timers are harmless.

import { Duration, Effect, Stream } from "effect";

import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";

const DEFAULT_IDLE_MS = 500;
const DEFAULT_CEILING_MS = 10000;

/**
 * Which commits the crash-recovery backup reconciles against — owned here, the
 * backup subsystem's policy. Shared (by import) with `mirrorPatchProducer`'s
 * backup fan-out because that's ESSENTIAL identity: both are the same backup
 * path and must react identically — not the incidental sameness that would call
 * for independent copies.
 *
 * Widest policy of the pipelines: it must react to anything that could make a
 * book dirty (write a backup) OR clean (clear one), so it canNOT filter on
 * `dirtyTextContent` — the save flow's clean-mark is `metadataOnly` with
 * `dirtyTextContent: false`, and that is exactly what should clear a backup.
 * Only two exclusions:
 *  - `load` — initial population; restoration is the loader's job, not this.
 *  - `selectionOnly` *patches* — pure cursor moves change no state. (Keys off the
 *    patch kind, not `meta.kind`: a `metadataOnly` meta carrying a `bulk`/
 *    `metadata` patch — the save clean-mark — DOES flip flags and is reconciled.)
 */
export function isDirtyBufferRelevant(event: CommitEvent): boolean {
  // Pure cursor/selection moves change no state — nothing to reconcile.
  if (event.patch.kind === "selectionOnly") return false;
  // Exhaustive over CommitKind: a new kind won't compile until it picks a side.
  switch (event.meta.kind) {
    case "load": // initial population; the loader handles restoration
      return false;
    case "userEdit":
    case "programmaticFix":
    case "import":
    case "undo":
    case "redo":
    case "structuralFixup":
    case "metadataOnly": // e.g. the save clean-mark — must clear a backup
      return true;
  }
}

/**
 * The books a commit could have changed. Chapter-scope commits touch their
 * chapters' books; project-scope commits (bulk import, version switch, save
 * clean-mark) fan out to every book in the post-commit snapshot.
 */
function booksForEvent(event: CommitEvent): string[] {
  const scope = event.meta.scope;
  if ("chapters" in scope) {
    return Array.from(new Set(scope.chapters.map((ref) => ref.bookCode)));
  }
  return event.snapshot.map((file) => file.bookCode);
}

/**
 * Per-substream pacing: emit a flush trigger `idleMs` after the last event
 * (debounce, the pause case) OR at least every `ceilingMs` while events keep
 * arriving (max-staleness, the sustained-typing backstop). The two views are
 * merged off a broadcast of the substream; `replay: 1` covers the subscribe-time
 * race so a lone event can't slip past both timers.
 */
function debounceWithMaxWait(idleMs: number, ceilingMs: number) {
  return <A, E, R>(self: Stream.Stream<A, E, R>): Stream.Stream<void, E, R> =>
    Stream.unwrap(
      Stream.broadcast(self, { capacity: "unbounded", replay: 1 }).pipe(
        Effect.map((shared) =>
          Stream.merge(
            shared.pipe(
              Stream.debounce(Duration.millis(idleMs)),
              Stream.map(() => undefined),
            ),
            shared.pipe(
              Stream.groupedWithin(
                Number.MAX_SAFE_INTEGER,
                Duration.millis(ceilingMs),
              ),
              Stream.filter((chunk) => chunk.length > 0),
              Stream.map(() => undefined),
            ),
          ),
        ),
      ),
    );
}

/**
 * Build the dirty-buffer pacing pipeline as a workspace-scoped fiber.
 * Subscribe to `WorkingFilesStore.changes`, fan out per book, group, pace, and
 * command the mirror to reconcile that book's backup.
 */
export function makeDirtyBufferPipeline(args: {
  workingFilesStore: WorkingFilesStore;
  workspaceBaselineStore: WorkspaceBaselineStore;
  feed: MirrorFeed;
  appVersion: string;
  idleMs?: number;
  ceilingMs?: number;
}): Effect.Effect<void> {
  const idleMs = args.idleMs ?? DEFAULT_IDLE_MS;
  const ceilingMs = args.ceilingMs ?? DEFAULT_CEILING_MS;

  const reconcileBook = (bookCode: string): Effect.Effect<void> =>
    Effect.sync(() => {
      args.feed.sendCommand({
        kind: "writeBackup",
        bookCode,
        diskBaseline: args.workspaceBaselineStore.getBaseline(bookCode),
        appVersion: args.appVersion,
        generation: args.workingFilesStore.generation(),
      });
    });

  return args.workingFilesStore.changes.pipe(
    Stream.filter(isDirtyBufferRelevant),
    Stream.flatMap((event) => Stream.fromIterable(booksForEvent(event))),
    Stream.groupByKey((bookCode) => bookCode),
    Stream.flatMap(
      ([bookCode, substream]) =>
        substream.pipe(
          debounceWithMaxWait(idleMs, ceilingMs),
          Stream.mapEffect(() => reconcileBook(bookCode)),
        ),
      { concurrency: "unbounded" },
    ),
    Stream.runDrain,
  );
}
