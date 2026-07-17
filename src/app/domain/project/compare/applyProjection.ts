// applyProjection.ts
//
// Commits one completed compare projection into the resident working noun.
// Projection is already complete and synchronous at this boundary; the final
// identity check prevents a frozen review from overwriting a newer workspace.

import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
import type { WorkspaceGateStore } from "@/app/state/WorkspaceInteractionGate.ts";

import type { IncomingMutationAbortReason } from "../remoteSync/commandResults.ts";
import { commitIfNotStale } from "../validatedStoreMutation.ts";
import type { ChapterRef } from "../workingFileMutations.ts";
import {
  assertApplyArtifact,
  type CompareProjectionArtifact,
  type ProjectedChapter,
} from "./projection.ts";

export type AppliedProjection = Readonly<{
  files: ScriptureBookState[];
  changedChapters: readonly ChapterRef[];
  structurallyChangedBookCodes: readonly string[];
  deletedBookCodes: readonly string[];
}>;

export type ApplyProjectionResult =
  | Readonly<{ kind: "committed"; applied: AppliedProjection }>
  | Readonly<{ kind: "aborted"; reason: IncomingMutationAbortReason }>;

/**
 * Applies the artifact that Preview read. This function never calls Onion and
 * never awaits, so Apply cannot produce a second, different merge result.
 */
export function applyCompareProjectionToStore(args: {
  workingFilesStore: WorkingFilesStore;
  interactionGate: WorkspaceGateStore;
  snapshotFiles: ScriptureBookState[];
  artifact: CompareProjectionArtifact;
  currentRevision: number;
}): ApplyProjectionResult {
  const artifact = assertApplyArtifact({
    artifact: args.artifact,
    currentRevision: args.currentRevision,
  });
  const applied = buildAppliedWorkingFiles(args.snapshotFiles, artifact);
  const outcome = commitIfNotStale({
    workingFilesStore: args.workingFilesStore,
    interactionGate: args.interactionGate,
    startState: args.snapshotFiles,
    scope: { kind: "workspace" },
    commit: () => {
      args.workingFilesStore.commit({
        patch: { kind: "bulk", files: applied.files },
        meta: {
          kind: "import",
          action: "applyIncoming",
          scope: { project: true },
          dirtyTextContent: true,
          structuralChanges: {
            deletedBookCodes: applied.deletedBookCodes,
            structurallyChangedBookCodes: applied.structurallyChangedBookCodes,
          },
        },
      });
    },
  });

  return outcome.kind === "committed"
    ? Object.freeze({ kind: "committed", applied })
    : Object.freeze({ kind: "aborted", reason: outcome.reason });
}

export function buildAppliedWorkingFiles(
  snapshotFiles: ScriptureBookState[],
  artifact: CompareProjectionArtifact,
): AppliedProjection {
  const files = snapshotFiles.map(cloneBookShell);
  const byBook = new Map(files.map((book) => [book.bookCode, book]));
  const changedChapters: ChapterRef[] = [];
  const structurallyChangedBookCodes = new Set<string>();
  const deletedBookCodes = new Set<string>();

  for (const projected of artifact.chapters) {
    if (projected.structuralAction === "unchanged") continue;
    const { bookCode, chapterNum } = projected.address;
    const existingBook = byBook.get(bookCode);
    const existingChapter = existingBook?.chapters.find(
      (chapter) => chapter.chapterNumber === chapterNum,
    );

    if (!projected.present) {
      if (!existingBook || !existingChapter) continue;
      existingBook.chapters = existingBook.chapters.filter(
        (chapter) => chapter.chapterNumber !== chapterNum,
      );
      changedChapters.push({ bookCode, chapterNum });
      if (existingBook.chapters.length === 0) {
        byBook.delete(bookCode);
        deletedBookCodes.add(bookCode);
      } else {
        // A structural deletion must remain part of the dirty/recovery model
        // until its containing book is successfully persisted. The save
        // pipeline serializes the whole book, so marking the retained
        // chapters dirty also gives crash recovery the post-deletion bytes.
        existingBook.chapters = existingBook.chapters.map((chapter) => ({
          ...chapter,
          dirty: true,
        }));
        structurallyChangedBookCodes.add(bookCode);
      }
      continue;
    }

    const book = existingBook ?? createBook(projected);
    if (!existingBook) {
      files.push(book);
      byBook.set(bookCode, book);
    }
    const nextChapter = createChapter(projected, existingChapter);
    book.chapters = [
      ...book.chapters.filter(
        (chapter) => chapter.chapterNumber !== chapterNum,
      ),
      nextChapter,
    ].sort((left, right) => left.chapterNumber - right.chapterNumber);
    changedChapters.push({ bookCode, chapterNum });
  }

  const retained = files.filter((book) => byBook.has(book.bookCode));
  return Object.freeze({
    files: retained,
    changedChapters: Object.freeze(changedChapters),
    structurallyChangedBookCodes: Object.freeze([
      ...structurallyChangedBookCodes,
    ]),
    deletedBookCodes: Object.freeze([...deletedBookCodes]),
  });
}

function cloneBookShell(book: ScriptureBookState): ScriptureBookState {
  return { ...book, chapters: [...book.chapters] };
}

function createBook(projected: ProjectedChapter): ScriptureBookState {
  const metadata = projected.book;
  if (!metadata) {
    throw new Error(
      `Cannot add ${projected.address.bookCode}: source book metadata is missing.`,
    );
  }
  return { ...metadata, chapters: [] };
}

function createChapter(
  projected: ProjectedChapter,
  existing: ScriptureChapterState | undefined,
): ScriptureChapterState {
  if (!projected.eol || !projected.direction) {
    throw new Error(
      `Cannot materialize ${projected.address.bookCode} ${projected.address.chapterNum}: chapter metadata is missing.`,
    );
  }
  const chapter: ScriptureChapterState = {
    chapterNumber: projected.address.chapterNum,
    currentTokens: structuredClone([...projected.tokens]),
    sourceTokens: existing ? existing.sourceTokens : [],
    eol: projected.eol,
    direction: projected.direction,
    dirty: true,
  };
  // Apply is a persistence event even when the chosen result byte-equals the
  // existing Saved side. Keep the committed chapter dirty until the save
  // pipeline writes/rebases it; otherwise it can skip the book and report a
  // receipt while an older crash-recovery backup still contains discarded
  // working content.
  return chapter;
}
