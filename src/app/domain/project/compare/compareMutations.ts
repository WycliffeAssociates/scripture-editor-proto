import { isChapterDirtyUsfm } from "@/app/domain/project/saveAndRevertService.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type {
  CompareProjectionArtifact,
  ProjectedChapter,
} from "./projection.ts";

function cloneBookShell(chapter: ProjectedChapter): ScriptureBookState {
  const book = chapter.book;
  if (!book) {
    throw new Error(
      `Cannot add ${chapter.address.bookCode} without frozen book metadata.`,
    );
  }
  return {
    path: book.path,
    title: book.title,
    bookCode: book.bookCode,
    nextBookId: book.nextBookId,
    prevBookId: book.prevBookId,
    ...(book.sort === undefined ? {} : { sort: book.sort }),
    chapters: [],
  };
}

/**
 * Materialize one already-projected compare artifact into a private working
 * draft. No Onion operation happens here: Preview and Apply consume the exact
 * same token artifact.
 */
export function applyCompareProjectionToWorkingFiles(args: {
  workingFiles: ScriptureBookState[];
  artifact: CompareProjectionArtifact;
}) {
  if (!args.artifact.complete) {
    throw new Error("Cannot apply an incomplete compare projection.");
  }

  for (const projected of args.artifact.chapters) {
    if (projected.structuralAction === "unchanged") continue;
    const { bookCode, chapterNum } = projected.address;
    let book = args.workingFiles.find((file) => file.bookCode === bookCode);
    const chapterIndex =
      book?.chapters.findIndex(
        (chapter) => chapter.chapterNumber === chapterNum,
      ) ?? -1;

    if (!projected.present) {
      if (!book || chapterIndex < 0) continue;
      book.chapters.splice(chapterIndex, 1);
      if (book.chapters.length === 0) {
        args.workingFiles.splice(args.workingFiles.indexOf(book), 1);
      }
      continue;
    }

    if (!book) {
      book = cloneBookShell(projected);
      args.workingFiles.push(book);
    }
    const currentChapter = book.chapters.find(
      (chapter) => chapter.chapterNumber === chapterNum,
    );
    if (!currentChapter) {
      book.chapters.push({
        chapterNumber: chapterNum,
        sourceTokens: [],
        currentTokens: structuredClone(projected.tokens) as Token[],
        direction: projected.direction ?? "ltr",
        dirty: true,
        eol: projected.eol ?? "\n",
      });
      book.chapters.sort(
        (left, right) => left.chapterNumber - right.chapterNumber,
      );
      continue;
    }

    currentChapter.currentTokens = structuredClone(projected.tokens) as Token[];
    currentChapter.direction = projected.direction ?? currentChapter.direction;
    currentChapter.eol = projected.eol ?? currentChapter.eol;
    currentChapter.dirty = isChapterDirtyUsfm(currentChapter);
  }
}

/**
 * Replace the non-excluded portion of the workspace with a saved snapshot.
 * This path is used by version navigation and clean behind-only fast-forward;
 * unlike a decision projection, the incoming bytes become the clean baseline.
 */
export function applyIncomingChapterAll(args: {
  workingFiles: ScriptureBookState[];
  sourceFiles: ScriptureBookState[];
  excludeBookCodes?: ReadonlySet<string>;
}) {
  const excluded = args.excludeBookCodes ?? new Set<string>();
  const retained = args.workingFiles.filter((file) =>
    excluded.has(file.bookCode),
  );
  const replacements = args.sourceFiles
    .filter((file) => !excluded.has(file.bookCode))
    .map((file) => structuredClone(file));
  args.workingFiles.splice(
    0,
    args.workingFiles.length,
    ...retained,
    ...replacements,
  );
}
