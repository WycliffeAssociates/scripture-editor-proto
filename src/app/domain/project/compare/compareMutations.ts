import { isChapterDirtyUsfm } from "@/app/domain/project/saveAndRevertService.ts";
import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type { CompareDiff } from "./types.ts";

function findWorkingChapter(
  workingFiles: ScriptureBookState[],
  bookCode: string,
  chapterNum: number,
) {
  const file = workingFiles.find(
    (candidate) => candidate.bookCode === bookCode,
  );
  const chapter = file?.chapters.find((c) => c.chapterNumber === chapterNum);
  return { file, chapter };
}

function ensureWorkingChapterFromSource(args: {
  workingFiles: ScriptureBookState[];
  sourceFiles: ScriptureBookState[];
  bookCode: string;
  chapterNum: number;
}) {
  const existing = findWorkingChapter(
    args.workingFiles,
    args.bookCode,
    args.chapterNum,
  );
  if (existing.file && existing.chapter) return existing;

  const sourceFile = args.sourceFiles.find((f) => f.bookCode === args.bookCode);
  const sourceChapter = sourceFile?.chapters.find(
    (c) => c.chapterNumber === args.chapterNum,
  );
  if (!sourceFile || !sourceChapter) return existing;

  if (!existing.file) {
    const newFile: ScriptureBookState = {
      path: sourceFile.path,
      title: sourceFile.title,
      bookCode: sourceFile.bookCode,
      nextBookId: sourceFile.nextBookId,
      prevBookId: sourceFile.prevBookId,
      sort: sourceFile.sort,
      chapters: [],
    };
    args.workingFiles.push(newFile);
    existing.file = newFile;
  }

  if (!existing.chapter) {
    // Clone from source: this seeds an editable working chapter. Aliasing
    // the source's state would let edits mutate the read-only baseline the
    // compare is measured against.
    const newChapter: ScriptureChapterState = {
      chapterNumber: args.chapterNum,
      sourceTokens: structuredClone(sourceChapter.sourceTokens),
      currentTokens: structuredClone(sourceChapter.currentTokens),
      direction: sourceChapter.direction,
      dirty: false,
      eol: sourceChapter.eol,
    };
    existing.file.chapters.push(newChapter);
    existing.chapter = newChapter;
  }

  return existing;
}

function applyTokensToWorkingChapter(args: {
  chapter: ScriptureChapterState;
  nextTokens: Token[];
}) {
  args.chapter.currentTokens = args.nextTokens;
  args.chapter.dirty = isChapterDirtyUsfm(args.chapter);
}

/**
 * Apply one incoming diff hunk from the compare source onto the working scripture
 * workspace.
 *
 * This mutation layer assumes compare result building has already located the
 * source material and diff block. Its job is to update the live workspace nouns,
 * not to compute compare coverage or warnings.
 */
export async function applyIncomingHunk(args: {
  workingFiles: ScriptureBookState[];
  sourceFiles: ScriptureBookState[];
  diff: CompareDiff;
  usfmOnionService: IUsfmOnionService;
}): Promise<void> {
  const sourceChapter = findWorkingChapter(
    args.sourceFiles,
    args.diff.bookCode,
    args.diff.chapterNum,
  ).chapter;
  if (!sourceChapter) return;

  const ensured = ensureWorkingChapterFromSource({
    workingFiles: args.workingFiles,
    sourceFiles: args.sourceFiles,
    bookCode: args.diff.bookCode,
    chapterNum: args.diff.chapterNum,
  });
  const workingChapter = ensured.chapter;
  if (!workingChapter) return;

  const sourceTokens = sourceChapter.currentTokens;
  const workingTokens = workingChapter.currentTokens;

  const nextTokens = await args.usfmOnionService.revertDiffBlock(
    sourceTokens,
    workingTokens,
    args.diff.uniqueKey,
  );

  applyTokensToWorkingChapter({
    chapter: workingChapter,
    nextTokens,
  });
}

/**
 * Replace one chapter in the working scripture workspace with the incoming
 * chapter from the compare source.
 */
export function applyIncomingChapter(args: {
  workingFiles: ScriptureBookState[];
  sourceFiles: ScriptureBookState[];
  bookCode: string;
  chapterNum: number;
}) {
  const sourceChapter = findWorkingChapter(
    args.sourceFiles,
    args.bookCode,
    args.chapterNum,
  ).chapter;
  const ensured = ensureWorkingChapterFromSource({
    workingFiles: args.workingFiles,
    sourceFiles: args.sourceFiles,
    bookCode: args.bookCode,
    chapterNum: args.chapterNum,
  });
  const workingChapter = ensured.chapter;
  if (!workingChapter) return;

  if (!sourceChapter) {
    applyTokensToWorkingChapter({
      chapter: workingChapter,
      nextTokens: [],
    });
    return;
  }

  applyTokensToWorkingChapter({
    chapter: workingChapter,
    nextTokens: sourceChapter.currentTokens,
  });
}

/**
 * Replace the full current working workspace with the incoming compare source
 * chapter-by-chapter.
 */
export function applyIncomingChapterAll(args: {
  workingFiles: ScriptureBookState[];
  sourceFiles: ScriptureBookState[];
  /** Books to leave untouched (e.g. locally-protected during reconciliation). */
  excludeBookCodes?: ReadonlySet<string>;
}) {
  const chapterKeys = new Set<string>();
  for (const file of args.workingFiles) {
    if (args.excludeBookCodes?.has(file.bookCode)) continue;
    for (const chapter of file.chapters) {
      chapterKeys.add(`${file.bookCode}:${chapter.chapterNumber}`);
    }
  }
  for (const file of args.sourceFiles) {
    if (args.excludeBookCodes?.has(file.bookCode)) continue;
    for (const chapter of file.chapters) {
      chapterKeys.add(`${file.bookCode}:${chapter.chapterNumber}`);
    }
  }

  for (const key of chapterKeys) {
    const [bookCode, chapterPart] = key.split(":");
    const chapterNum = Number(chapterPart);
    if (!bookCode || Number.isNaN(chapterNum)) continue;
    applyIncomingChapter({
      workingFiles: args.workingFiles,
      sourceFiles: args.sourceFiles,
      bookCode,
      chapterNum,
    });
  }
}
