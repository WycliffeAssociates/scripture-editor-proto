// dirtyBufferPipeline.ts
//
// Stage-2 pipeline that keeps per-book crash-recovery backups in sync with the
// live working-files state. While a book has any dirty chapter, it writes the
// whole book's current USFM to a backup; once the book goes clean (saved or
// reverted), it clears the backup.
//
// Per-book substreams (`groupByKey`) so a busy book never starves a quiet one.
// Each book's writes are paced by a debounce (flush ~idleMs after typing pauses)
// merged with a max-staleness ceiling (force a flush at least every ceilingMs so
// sustained typing can't outrun the safety net). Reconcile is idempotent and
// re-reads the LATEST state on every attempt, so duplicate/overlapping triggers
// from the two timers are harmless — they just re-capture current truth.
//
// This never writes to the real on-disk project files; it only touches the
// managed dirty-buffer backups via DirtyBufferStore.

import { Duration, Effect, Schedule, Stream } from "effect";
import { serializeChaptersToUsfm } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { isDirtyBufferRelevant } from "@/app/state/commitFilters.ts";
import {
    DIRTY_BUFFER_SCHEMA_VERSION,
    type DirtyBufferFile,
    type DirtyBufferStore,
} from "@/app/state/DirtyBufferStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";

const DEFAULT_IDLE_MS = 500;
const DEFAULT_CEILING_MS = 10000;
const RETRY_BASE = Duration.seconds(2);
const RETRY_TIMES = 2;

/**
 * The books a commit could have changed. Chapter-scope commits touch one book;
 * project-scope commits (bulk import, version switch, save clean-mark) fan out
 * to every book in the post-commit snapshot.
 */
function booksForEvent(event: CommitEvent): string[] {
    const scope = event.meta.scope;
    if ("bookCode" in scope) return [scope.bookCode];
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
                    // @ai? I'm still learning more advanced effect. Can you walk me through this stream primitives and hwo this all works in this function?
                    Stream.merge(
                        shared.pipe(
                            Stream.debounce(Duration.millis(idleMs)),
                            //   @ai? why this line and same one below?   Stream.map(() => undefined),
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
 * Build the dirty-buffer pipeline as a workspace-scoped fiber. Subscribe to
 * `WorkingFilesStore.changes`, fan out per book, group, pace, reconcile.
 */
export function makeDirtyBufferPipeline(args: {
    workingFilesStore: WorkingFilesStore;
    workspaceBaselineStore: WorkspaceBaselineStore;
    dirtyBufferStore: DirtyBufferStore;
    workspaceKey: string;
    appVersion: string;
    idleMs?: number;
    ceilingMs?: number;
}): Effect.Effect<void> {
    const idleMs = args.idleMs ?? DEFAULT_IDLE_MS;
    const ceilingMs = args.ceilingMs ?? DEFAULT_CEILING_MS;

    // Idempotent reconcile, re-reading latest state. Any dirty chapter → write
    // the whole book; all clean → clear the backup.
    const reconcileBook = (bookCode: string): Effect.Effect<void, unknown> =>
        // @ai? -> still learning effect. why suspend here?
        Effect.suspend(() => {
            const book = args.workingFilesStore
                .read()
                .find((file) => file.bookCode === bookCode);
            if (!book) return Effect.void;

            const isDirty = book.chapters.some((chapter) => chapter.dirty);
            if (!isDirty) {
                // Book is fully clean (saved, or all edits reverted) — drop its
                // backup. Log only when a file was actually removed, so a
                // reverted/saved book shows up but routine clean-book reconciles
                // don't spam.
                return Effect.tryPromise(() =>
                    args.dirtyBufferStore.clear(args.workspaceKey, bookCode),
                ).pipe(
                    // @ai? -> still learning. maybe just explain most of the effect in this file actually
                    Effect.tap((removed) =>
                        removed
                            ? Effect.sync(() =>
                                  console.info(
                                      `[dirtyBufferPipeline] cleared backup ${bookCode} (book is clean) @ ${new Date().toISOString()}`,
                                  ),
                              )
                            : Effect.void,
                    ),
                    Effect.asVoid,
                );
            }

            const content = serializeChaptersToUsfm(
                book.chapters,
                (chapter) => chapter.currentTokens,
            );
            return Effect.gen(function* () {
                const bodyMd5 = yield* Effect.tryPromise(() =>
                    args.workspaceBaselineStore.computeMd5(content),
                );
                const entry: DirtyBufferFile = {
                    schemaVersion: DIRTY_BUFFER_SCHEMA_VERSION,
                    diskBaseline:
                        args.workspaceBaselineStore.getBaseline(bookCode),
                    bodyMd5,
                    writtenAt: Date.now(),
                    appVersion: args.appVersion,
                    content,
                };
                yield* Effect.tryPromise(() =>
                    args.dirtyBufferStore.put(
                        args.workspaceKey,
                        bookCode,
                        entry,
                    ),
                );
                // Observability for tuning the debounce/ceiling against real
                // typing patterns — logs each actual write to the backup file.
                const dirtyChapters = book.chapters.filter(
                    (chapter) => chapter.dirty,
                ).length;
                yield* Effect.sync(() =>
                    console.info(
                        `[dirtyBufferPipeline] wrote backup ${bookCode}: ${dirtyChapters} dirty chapter(s), ${content.length} chars @ ${new Date(entry.writtenAt).toISOString()}`,
                    ),
                );
            });
        });

    // Bounded retry covers transient FS hiccups (3 attempts: immediate, +2s,
    // +4s). On exhaust we log and leave the book's net dormant until its next
    // commit re-triggers — we never let one book's failure tear down the fiber.
    const reconcileWithRetry = (bookCode: string): Effect.Effect<void> =>
        reconcileBook(bookCode).pipe(
            Effect.retry(
                Schedule.exponential(RETRY_BASE).pipe(
                    Schedule.both(Schedule.recurs(RETRY_TIMES)),
                ),
            ),
            Effect.catch((error: unknown) =>
                Effect.sync(() => {
                    console.error(
                        "[dirtyBufferPipeline] reconcile failed after retries",
                        {
                            bookCode,
                            error,
                        },
                    );
                }),
            ),
        );

    return args.workingFilesStore.changes.pipe(
        Stream.filter(isDirtyBufferRelevant),
        Stream.flatMap((event) => Stream.fromIterable(booksForEvent(event))),
        Stream.groupByKey((bookCode) => bookCode),
        Stream.flatMap(
            ([bookCode, substream]) =>
                substream.pipe(
                    debounceWithMaxWait(idleMs, ceilingMs),
                    Stream.mapEffect(() => reconcileWithRetry(bookCode)),
                ),
            { concurrency: "unbounded" },
        ),
        Stream.runDrain,
    );
}
