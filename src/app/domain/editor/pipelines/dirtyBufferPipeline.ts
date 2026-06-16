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
import { isDirtyBufferRelevant } from "@/app/state/commitFilters.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

const DEFAULT_IDLE_MS = 500;
const DEFAULT_CEILING_MS = 10000;

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
