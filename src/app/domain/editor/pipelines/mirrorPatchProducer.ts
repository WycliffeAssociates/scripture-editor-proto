// mirrorPatchProducer.ts
//
// The single writer of the mirror feed. Subscribes to working-files commits
// and, per relevant commit, reads the canonical `currentTokens` of ONLY the
// changed chapters and fans the token delta to every registered sink. The
// mirror holds the result; the engines and the backup serializer read it
// locally.
//
// A content-bearing `project: true` commit (import, version revert, mode
// switch, accept-incoming) becomes a `fullSync` so mirrors drop state for books
// that vanished (a chapter-delta list can't express removal) — at the cost of
// re-tokenizing every chapter. A project commit that moved only metadata
// (`dirtyTextContent === false`, e.g. the save clean-mark: flags clear and disk
// baselines advance, tokens unchanged) takes the cheap `syncMeta` path instead,
// which carries flags + baselines but no tokens. Chapter-scope commits become
// per-chapter `pushChapter` patches. Baselines ride alongside so the mirror's
// backup envelope always has the book's current `diskBaseline`.

import { Effect, Stream } from "effect";
import type { SousConfig } from "scripture-sous-chef-web";
import type { LintSnapshot } from "usfm-onion-web";

import { decodeGalleyAnalysis } from "@/app/domain/editor/annotations/decodeGalleyFindings.ts";
import type { FindingsByChapter } from "@/app/domain/editor/annotations/finding.ts";
import { isDirtyBufferRelevant } from "@/app/domain/editor/pipelines/dirtyBufferPipeline.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  FullSyncBook,
  Generation,
  MirrorChapter,
  MirrorPatch,
  SyncMetaBook,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import { startDevTimer } from "@/app/domain/mirror/performanceTiming.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { DiskBaseline } from "@/app/state/DirtyBufferStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import type { GalleyAnalysis } from "@/core/domain/sous/galleyTypes.ts";

function tokenizeChapter(chapter: ScriptureChapterState): MirrorChapter {
  return {
    // The canonical flat token stream IS the mirror's view — token space is the
    // truth, independent of the visible editor's shape.
    tokens: chapter.currentTokens,
    eol: chapter.eol,
    dirty: chapter.dirty,
  };
}

function fullSyncBooks(
  snapshot: ReadonlyArray<ScriptureBookState>,
  baselineFor: (bookCode: string) => DiskBaseline,
): FullSyncBook[] {
  return snapshot.map((book) => ({
    bookCode: book.bookCode,
    diskBaseline: baselineFor(book.bookCode),
    baselineTokens: book.chapters.flatMap((chapter) => chapter.sourceTokens),
    chapters: book.chapters.map((chapter) => ({
      chapterNum: chapter.chapterNumber,
      chapter: tokenizeChapter(chapter),
    })),
  }));
}

function syncMetaBooks(
  snapshot: ReadonlyArray<ScriptureBookState>,
  baselineFor: (bookCode: string) => DiskBaseline,
): SyncMetaBook[] {
  return snapshot.map((book) => ({
    bookCode: book.bookCode,
    diskBaseline: baselineFor(book.bookCode),
    baselineTokens: book.chapters.flatMap((chapter) => chapter.sourceTokens),
    chapterDirty: book.chapters.map((chapter) => ({
      chapterNum: chapter.chapterNumber,
      dirty: chapter.dirty,
    })),
  }));
}

/**
 * Build the full set of patches a commit implies. Pure given the post-commit
 * snapshot + baselines; reads each changed chapter's resident `currentTokens`.
 */
export function patchesForCommit(
  event: CommitEvent,
  baselineFor: (bookCode: string) => DiskBaseline,
): MirrorPatch[] {
  const generation: Generation = event.meta.generation;
  const scope = event.meta.scope;

  if ("project" in scope) {
    if (!event.meta.dirtyTextContent) {
      return [
        {
          kind: "syncMeta",
          books: syncMetaBooks(event.snapshot, baselineFor),
          generation,
        },
      ];
    }
    return [
      {
        kind: "fullSync",
        books: fullSyncBooks(event.snapshot, baselineFor),
        generation,
      },
    ];
  }

  const patches: MirrorPatch[] = [];
  const baselinePushed = new Set<string>();
  const structuralBooks = new Set(
    event.meta.structuralChanges?.structurallyChangedBookCodes ?? [],
  );
  const deletedBooks = new Set(
    event.meta.structuralChanges?.deletedBookCodes ?? [],
  );
  for (const bookCode of structuralBooks) {
    const book = event.snapshot.find(
      (candidate) => candidate.bookCode === bookCode,
    );
    if (!book) {
      deletedBooks.add(bookCode);
      continue;
    }
    patches.push({
      kind: "updateBook",
      book: {
        bookCode: book.bookCode,
        diskBaseline: baselineFor(book.bookCode),
        baselineTokens: book.chapters.flatMap(
          (chapter) => chapter.sourceTokens,
        ),
        chapters: book.chapters.map((chapter) => ({
          chapterNum: chapter.chapterNumber,
          chapter: tokenizeChapter(chapter),
        })),
      },
      generation,
    });
  }
  for (const bookCode of deletedBooks) {
    if (!structuralBooks.has(bookCode)) {
      patches.push({ kind: "removeBook", bookCode, generation });
    }
  }
  for (const ref of scope.chapters) {
    if (structuralBooks.has(ref.bookCode) || deletedBooks.has(ref.bookCode)) {
      continue;
    }
    const book = event.snapshot.find((b) => b.bookCode === ref.bookCode);
    if (!book) {
      // A deletion that empties a book removes its resident book as well. The
      // deleted chapter is still the precise identity the mirror needs to drop.
      patches.push({ kind: "deleteChapter", ref, generation });
      continue;
    }
    if (!baselinePushed.has(ref.bookCode)) {
      baselinePushed.add(ref.bookCode);
      patches.push({
        kind: "pushBaseline",
        bookCode: ref.bookCode,
        diskBaseline: baselineFor(ref.bookCode),
        baselineTokens: book.chapters.flatMap(
          (chapter) => chapter.sourceTokens,
        ),
        generation,
      });
    }
    const chapter = book.chapters.find(
      (c) => c.chapterNumber === ref.chapterNum,
    );
    if (!chapter) {
      patches.push({ kind: "deleteChapter", ref, generation });
      continue;
    }
    patches.push({
      kind: "pushChapter",
      ref,
      chapter: tokenizeChapter(chapter),
      generation,
    });
  }
  return patches;
}

/**
 * Seed the mirror with the current store state as one `fullSync`. Web pays this
 * one fan-out at project load (behind the loading flow); generation is the
 * store's current generation so later patches order correctly against it.
 */
export function seedMirror(args: {
  workingFilesStore: WorkingFilesStore;
  workspaceBaselineStore: WorkspaceBaselineStore;
  feed: MirrorFeed;
  generation: Generation;
}): void {
  // Per-book disk baseline (md5 of the on-disk bytes, or "absent") — rides the
  // seed so the mirror can later tell "disk moved under this backup" from
  // "backup still matches disk" when it writes a crash-recovery envelope.
  const baselineFor = (bookCode: string): DiskBaseline =>
    args.workspaceBaselineStore.getBaseline(bookCode);
  args.feed.pushPatch({
    kind: "fullSync",
    books: fullSyncBooks(args.workingFilesStore.read(), baselineFor),
    generation: args.generation,
  });
}

/** The one complete Galley snapshot awaited before first paint. */
export type InitialFindings = {
  /** Complete resident Braid snapshot; null means no analysis result. */
  lint: LintSnapshot | null;
  sous: GalleyAnalysis | null;
  /**
   * Already-normalized per-book findings from the main-thread `local-lint`
   * reduce — not a mirror engine shape (it never round-trips off-main), so the
   * kernel computes it synchronously and the provider commits it as-is.
   */
  localLint: Record<string, FindingsByChapter>;
};

/** The mirror-awaited subset of {@link InitialFindings} (lint + sous). */
export type MirrorInitialFindings = Pick<InitialFindings, "lint" | "sous">;

/** Empty initial findings — plain mode (analysis disabled) returns this. */
export const NO_INITIAL_FINDINGS: InitialFindings = {
  lint: null,
  sous: null,
  localLint: {},
};

// Backstop for the load-time resync recovery below: if a re-seed still doesn't
// let the analyses land, resolve with whatever findings arrived (empty for the
// stragglers) rather than block the loading gate forever. Generous against the
// session's own behind-retry budget (a couple hundred ms per analyze) so a
// merely-slow seed isn't cut short, but bounded so load can't hang.
const INITIAL_FINDINGS_GIVE_UP_MS = 2_000;

/**
 * Run an initial project-wide lint + sous against the freshly seeded mirror AND
 * await both results. This is the load contract's "initial analyze through the
 * mirror at load": the seed `fullSync` has populated the mirror, so analyzing
 * `"all"` reads resident tokens for every book; the results flow back through
 * the same result router that handles every later pass (so live wiring is
 * unchanged) AND are correlated by `requestId` so this load-time caller can
 * await its two specific passes before the loading gate releases. This is the
 * single source of first-paint findings — lint AND sous — so no separate
 * parse-time lint pass runs on the main thread.
 *
 * Plain mode disables analysis, so the kernel skips this there (matching the
 * gated lint/sous pipelines) and treats findings as empty.
 *
 * Resync recovery: a session can answer an analyze with a `resyncRequest`
 * instead of a result when the seed patch hasn't landed yet (the mirror is
 * `behind` past its retries). The live `mirrorResultRouter` services that by
 * re-seeding — but at load the router isn't mounted, so this awaiter would
 * otherwise hang on the loading gate forever. We service it here the same way:
 * re-seed once (coalesced by generation, matching the router) and re-issue the
 * still-pending analyses, with `INITIAL_FINDINGS_GIVE_UP_MS` as the backstop so
 * a seed that refuses to land degrades to empty findings (the live router
 * re-analyzes on the next commit) instead of a hung load.
 */
export async function awaitInitialFindings(args: {
  feed: MirrorFeed;
  generation: Generation;
  /** Re-push the seed `fullSync` — caller-supplied so this stays decoupled from the store. */
  reseed: () => void;
  config?: SousConfig;
}): Promise<MirrorInitialFindings> {
  const lintRequestId = `initial-lint-${args.generation}`;
  const sousRequestId = `initial-sous-${args.generation}`;

  return new Promise<MirrorInitialFindings>((resolveAll) => {
    let lint: LintSnapshot | null = null;
    let sous: GalleyAnalysis | null = null;
    let cacheRejected = false;
    // Coalesce the resync burst (one per analyze class, same trailing
    // generation) into a single re-seed, exactly as the router does.
    let resyncHighWater = -1;
    let giveUpTimer: ReturnType<typeof setTimeout> | null = null;
    // The `onResult` unsubscribe handle: assigned when we subscribe below and
    // invoked by `finish()` so the awaiter stops listening once it resolves.
    let off = (): void => {};

    const finish = (): void => {
      off();
      if (giveUpTimer !== null) clearTimeout(giveUpTimer);
      resolveAll({ lint, sous });
    };
    const settleIfBothIn = (): void => {
      if (lint !== null && sous !== null) finish();
    };
    const sendPending = (): void => {
      if (lint === null) {
        args.feed.sendCommand({
          kind: "analyzeLint",
          generation: args.generation,
          requestId: lintRequestId,
        });
      }
      if (sous === null) {
        args.feed.sendCommand({
          kind: "analyzeGalley",
          generation: args.generation,
          requestId: sousRequestId,
          config: args.config,
          cachePolicy: cacheRejected ? "none" : "restore",
        });
      }
    };

    off = args.feed.onResult((result) => {
      if (result.kind === "lintResult" && result.requestId === lintRequestId) {
        lint = result.snapshot;
        settleIfBothIn();
      } else if (
        result.kind === "galleyResult" &&
        result.requestId === sousRequestId
      ) {
        if (result.cacheState === "persisted") {
          try {
            // The persisted candidate is not readiness proof until the
            // official decoder validates its identity and wire shape.
            decodeGalleyAnalysis(result);
          } catch (error: unknown) {
            cacheRejected = true;
            console.warn(
              "[mirror] persisted Galley cache rejected; using fresh analysis",
              {
                error,
              },
            );
            sendPending();
            return;
          }
        }
        sous = result;
        settleIfBothIn();
      } else if (
        result.kind === "resyncRequest" &&
        result.lastGeneration > resyncHighWater
      ) {
        resyncHighWater = result.lastGeneration;
        args.reseed();
        sendPending();
        // Arm the backstop on the first re-seed; a still-stuck seed resolves
        // empty here rather than hanging (no router exists to recover further).
        // `sendPending` may have already settled both (synchronous transport) —
        // don't arm a dangling timer in that case.
        if (giveUpTimer === null && (lint === null || sous === null)) {
          giveUpTimer = setTimeout(finish, INITIAL_FINDINGS_GIVE_UP_MS);
        }
      }
    });

    sendPending();
  });
}

/**
 * Effect subscriber that forks beside the analysis pipelines. Relevance is the
 * dirty-buffer policy (the widest — the mirror serves lint, sous AND backup, so
 * it must track every commit that changes content or flips dirty/clean).
 */
export function makeMirrorPatchProducer(args: {
  workingFilesStore: WorkingFilesStore;
  workspaceBaselineStore: WorkspaceBaselineStore;
  feed: MirrorFeed;
}): Effect.Effect<void> {
  const baselineFor = (bookCode: string): DiskBaseline =>
    args.workspaceBaselineStore.getBaseline(bookCode);

  return args.workingFilesStore.changes.pipe(
    Stream.filter(isDirtyBufferRelevant),
    Stream.runForEach((event) =>
      Effect.sync(() => {
        const patches = patchesForCommit(event, baselineFor);
        if (import.meta.env.DEV && event.meta.dirtyTextContent) {
          startDevTimer(`sous:chapter-to-findings:${event.meta.generation}`);
          startDevTimer(`sous:chapter-to-command:${event.meta.generation}`);
        }
        for (const patch of patches) {
          args.feed.pushPatch(patch);
        }
      }),
    ),
  );
}
