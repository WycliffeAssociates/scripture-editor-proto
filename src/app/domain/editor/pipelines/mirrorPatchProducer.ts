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

import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  FullSyncBook,
  Generation,
  MirrorChapter,
  MirrorPatch,
  SyncMetaBook,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import { mirrorTrace } from "@/app/domain/mirror/mirrorTrace.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { isDirtyBufferRelevant } from "@/app/state/commitFilters.ts";
import type { DiskBaseline } from "@/app/state/DirtyBufferStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";
import type { SousAnalyzeResult } from "@/core/domain/sous/sousTypes.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

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
  for (const ref of scope.chapters) {
    const book = event.snapshot.find((b) => b.bookCode === ref.bookCode);
    if (!book) continue;
    if (!baselinePushed.has(ref.bookCode)) {
      baselinePushed.add(ref.bookCode);
      patches.push({
        kind: "pushBaseline",
        bookCode: ref.bookCode,
        diskBaseline: baselineFor(ref.bookCode),
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
  const baselineFor = (bookCode: string): DiskBaseline =>
    args.workspaceBaselineStore.getBaseline(bookCode);
  args.feed.pushPatch({
    kind: "fullSync",
    books: fullSyncBooks(args.workingFilesStore.read(), baselineFor),
    generation: args.generation,
  });
}

/**
 * The findings of an initial project-wide pass, in the RAW per-book engine
 * shapes the result router normalizes. The kernel awaits these at load and the
 * provider commits them into the FindingsStore before first paint; they ALSO
 * flow through the result router (the live path), so committing them is
 * idempotent against that.
 */
export type InitialFindings = {
  lint: Record<string, LintIssue[]>;
  sous: Record<string, SousAnalyzeResult>;
};

/** Empty initial findings — plain mode (analysis disabled) returns this. */
export const NO_INITIAL_FINDINGS: InitialFindings = { lint: {}, sous: {} };

/**
 * Run an initial project-wide lint + sous against the freshly seeded mirror AND
 * await both results. This is the load contract's "initial analyze through the
 * mirror at load": the seed `fullSync` has populated the mirror, so analyzing
 * `"all"` reads resident tokens for every book; the results flow back through
 * the same result router that handles every later pass (so live wiring is
 * unchanged) AND are correlated by `requestId` so this load-time caller can
 * await its two specific passes before the loading gate releases. Unifies the
 * old loader-lint path (`initialLintErrorsByBook`, which `commitFilters`
 * excluded `load` commits from and which only ever carried lint, never sous)
 * onto one mirror seam.
 *
 * Plain mode disables analysis, so the kernel skips this there (matching the
 * gated lint/sous pipelines) and treats findings as empty.
 */
export async function awaitInitialFindings(args: {
  feed: MirrorFeed;
  generation: Generation;
}): Promise<InitialFindings> {
  const lintRequestId = `initial-lint-${args.generation}`;
  const sousRequestId = `initial-sous-${args.generation}`;

  const lintPromise = new Promise<Record<string, LintIssue[]>>((resolve) => {
    const off = args.feed.onResult((result) => {
      if (result.kind === "lintResult" && result.requestId === lintRequestId) {
        off();
        resolve(result.byBook);
      }
    });
  });
  const sousPromise = new Promise<Record<string, SousAnalyzeResult>>(
    (resolve) => {
      const off = args.feed.onResult((result) => {
        if (
          result.kind === "sousResult" &&
          result.requestId === sousRequestId
        ) {
          off();
          resolve(result.byBook);
        }
      });
    },
  );

  args.feed.sendCommand({
    kind: "analyzeLint",
    scope: "all",
    generation: args.generation,
    requestId: lintRequestId,
  });
  args.feed.sendCommand({
    kind: "analyzeSous",
    scope: "all",
    generation: args.generation,
    requestId: sousRequestId,
  });

  const [lint, sous] = await Promise.all([lintPromise, sousPromise]);
  return { lint, sous };
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
        mirrorTrace("producer.commit", {
          gen: event.meta.generation,
          metaKind: event.meta.kind,
          dirtyText: event.meta.dirtyTextContent,
          scope:
            "project" in event.meta.scope
              ? "project"
              : event.meta.scope.chapters.map(
                  (c) => `${c.bookCode}:${c.chapterNum}`,
                ),
          patchKinds: patches.map((p) => p.kind),
        });
        for (const patch of patches) {
          args.feed.pushPatch(patch);
        }
      }),
    ),
  );
}
