// mirrorPatchProducer.ts
//
// The single writer of the mirror feed. Subscribes to working-files commits
// and, per relevant commit, tokenizes ONLY the changed chapters once
// (`lexicalToTokens`, matching the options the analysis pipelines tokenize
// with) and fans the token delta to every registered sink. Token serialization
// happens here exactly once per commit and never again — the mirror holds the
// result, the engines and the backup serializer read it locally.
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

import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { MirrorFeed } from "@/app/domain/mirror/MirrorFeed.ts";
import type {
  FullSyncBook,
  Generation,
  MirrorChapter,
  MirrorPatch,
  SyncMetaBook,
} from "@/app/domain/mirror/mirrorProtocol.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { isDirtyBufferRelevant } from "@/app/state/commitFilters.ts";
import type { DiskBaseline } from "@/app/state/DirtyBufferStore.ts";
import type { CommitEvent } from "@/app/state/types.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceBaselineStore } from "@/app/state/WorkspaceBaselineStore.ts";

// Match the tokenization the lint/sous pipelines use so mirror-side analysis
// sees the same token stream the single-thread path did.
const TOKENIZE_OPTIONS = { structuralParagraphBreaks: true } as const;

function tokenizeChapter(
  bookCode: string,
  chapter: ScriptureChapterState,
): MirrorChapter {
  return {
    tokens: lexicalToTokens(chapter.lexicalState, {
      ...TOKENIZE_OPTIONS,
      bookCode,
    }),
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
      chapter: tokenizeChapter(book.bookCode, chapter),
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
 * snapshot + baselines; the only cost is the per-chapter `lexicalToTokens`,
 * paid once here.
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
      chapter: tokenizeChapter(ref.bookCode, chapter),
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
        for (const patch of patchesForCommit(event, baselineFor)) {
          args.feed.pushPatch(patch);
        }
      }),
    ),
  );
}
