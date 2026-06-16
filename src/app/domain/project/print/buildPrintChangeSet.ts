import { diffWordsWithSpace } from "diff";

import { buildCompareResultAsync } from "@/app/domain/project/compare/compareService.ts";
import type { ProjectDiff } from "@/app/domain/project/diffTypes.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

/**
 * Builds the data model for the "Print changes" document — a terse,
 * verse-by-verse record of what changed between two scripture sides, ready to
 * render as a monochrome printable page.
 *
 * NOTE ON SIDES (read before changing the call site): this function takes BOTH
 * sides as explicit parameters — `oldFiles` (the earlier baseline) and
 * `newFiles` (the later state). It deliberately does NOT reach for the working
 * files store. Today the only caller passes `newFiles = working store` and
 * `oldFiles = a historical commit`, but that is the caller's choice, not this
 * module's assumption. `buildCompareResultAsync` is likewise general over both
 * sides; the existing wrongness is only in its *other* callers
 * (computeExternalDiffs / loadFromRemoteLatest / loadFromVersion in
 * useExternalCompare.ts), which bake `currentFiles = workingFilesStore.read()`
 * into themselves. Even if one-date-vs-working-store is all we ever ship,
 * hardcoding either side into the working store is not what we should have
 * done — both sides are data. Keep them parameters here.
 */

export type PrintWordMark = "added" | "removed" | "unchanged";

export type PrintWordRun = {
  text: string;
  mark: PrintWordMark;
};

export type PrintEntryStatus = "added" | "deleted" | "modified";

/**
 * One printed verse, rendered as a before/after row. `oldRuns` is what the verse
 * was at the baseline (removed words struck through); `newRuns` is what it is now
 * (added words underlined). Either side may be empty (a pure add has no old side,
 * a pure delete has no new side).
 */
export type PrintVerseEntry = {
  semanticSid: string;
  status: PrintEntryStatus;
  oldRuns: PrintWordRun[];
  newRuns: PrintWordRun[];
};

export type PrintChapter = {
  chapterNum: number;
  entries: PrintVerseEntry[];
};

export type PrintBook = {
  bookCode: string;
  chapters: PrintChapter[];
};

export type PrintChangeSet = {
  books: PrintBook[];
  totalChanges: number;
};

/** Whole project, or a chosen set of books. */
export type PrintScope =
  | { kind: "all" }
  | { kind: "books"; bookCodes: string[] };

/**
 * `verses`: one line per changed verse (blocks sharing a verse are merged).
 * `chunks`: one line per raw change block (finer than a verse).
 */
export type PrintGranularity = "verses" | "chunks";

export type BuildPrintChangeSetArgs = {
  /** The earlier baseline side (e.g. a saved version at the chosen date). */
  oldFiles: ScriptureBookState[];
  /** The later side (e.g. the current working files). */
  newFiles: ScriptureBookState[];
  usfmOnionService: IUsfmOnionService;
  scope: PrintScope;
  granularity: PrintGranularity;
  includeUsfm: boolean;
};

function oldSideText(diff: ProjectDiff, includeUsfm: boolean): string {
  return includeUsfm
    ? diff.originalDisplayText
    : (diff.originalTextOnly ?? diff.originalDisplayText);
}

function newSideText(diff: ProjectDiff, includeUsfm: boolean): string {
  return includeUsfm
    ? diff.currentDisplayText
    : (diff.currentTextOnly ?? diff.currentDisplayText);
}

type PrintSides = { oldRuns: PrintWordRun[]; newRuns: PrintWordRun[] };

/**
 * Split one diff block into its before/after sides. The before side carries the
 * old text with removed words marked; the after side carries the new text with
 * added words marked. A word diff drives both so the two columns line up.
 */
function buildSides(diff: ProjectDiff, includeUsfm: boolean): PrintSides {
  const oldText = oldSideText(diff, includeUsfm).trim();
  const newText = newSideText(diff, includeUsfm).trim();

  if (diff.status === "added") {
    return {
      oldRuns: [],
      newRuns: newText ? [{ text: newText, mark: "added" }] : [],
    };
  }
  if (diff.status === "deleted") {
    return {
      oldRuns: oldText ? [{ text: oldText, mark: "removed" }] : [],
      newRuns: [],
    };
  }

  const changes = diffWordsWithSpace(oldText, newText);
  const oldRuns = changes
    .filter((change) => !change.added)
    .map<PrintWordRun>((change) => ({
      text: change.value,
      mark: change.removed ? "removed" : "unchanged",
    }));
  const newRuns = changes
    .filter((change) => !change.removed)
    .map<PrintWordRun>((change) => ({
      text: change.value,
      mark: change.added ? "added" : "unchanged",
    }));
  return { oldRuns, newRuns };
}

function toEntryStatus(status: ProjectDiff["status"]): PrintEntryStatus {
  // `unchanged` never reaches here — buildCompareResultAsync drops it.
  return status === "added" || status === "deleted" ? status : "modified";
}

/**
 * Merge several blocks that fall in the same verse into one entry, concatenating
 * their runs. A verse that mixes additions and deletions reads as "modified".
 */
function statusForSides(
  sides: PrintSides,
  fallback: PrintEntryStatus,
): PrintEntryStatus {
  const sawAdded = sides.newRuns.some((run) => run.mark === "added");
  const sawRemoved = sides.oldRuns.some((run) => run.mark === "removed");
  if (sawAdded && sawRemoved) return "modified";
  if (sawAdded) return "added";
  if (sawRemoved) return "deleted";
  return fallback;
}

/**
 * Merge several blocks that fall in the same verse into one before/after entry,
 * concatenating each side's runs (a space between blocks).
 */
function mergeBlocksToVerseEntry(
  blocks: ProjectDiff[],
  includeUsfm: boolean,
): PrintVerseEntry {
  const first = blocks[0];
  const oldRuns: PrintWordRun[] = [];
  const newRuns: PrintWordRun[] = [];

  for (const block of blocks) {
    const sides = buildSides(block, includeUsfm);
    if (sides.oldRuns.length > 0) {
      if (oldRuns.length > 0) oldRuns.push({ text: " ", mark: "unchanged" });
      oldRuns.push(...sides.oldRuns);
    }
    if (sides.newRuns.length > 0) {
      if (newRuns.length > 0) newRuns.push({ text: " ", mark: "unchanged" });
      newRuns.push(...sides.newRuns);
    }
  }

  return {
    semanticSid: first.semanticSid,
    status: statusForSides({ oldRuns, newRuns }, toEntryStatus(first.status)),
    oldRuns,
    newRuns,
  };
}

export async function buildPrintChangeSet(
  args: BuildPrintChangeSetArgs,
): Promise<PrintChangeSet> {
  const result = await buildCompareResultAsync({
    // old side is the baseline so "added" means "added since then".
    currentFiles: args.oldFiles,
    sourceFiles: args.newFiles,
    usfmOnionService: args.usfmOnionService,
  });

  const scope = args.scope;
  const scoped = result.diffs.filter((diff) =>
    scope.kind === "books" ? scope.bookCodes.includes(diff.bookCode) : true,
  );

  // book -> chapter -> ordered blocks
  const byBook = new Map<string, Map<number, ProjectDiff[]>>();
  for (const diff of scoped) {
    let chapters = byBook.get(diff.bookCode);
    if (!chapters) {
      chapters = new Map();
      byBook.set(diff.bookCode, chapters);
    }
    const blocks = chapters.get(diff.chapterNum) ?? [];
    blocks.push(diff);
    chapters.set(diff.chapterNum, blocks);
  }

  let totalChanges = 0;
  const books: PrintBook[] = [];

  for (const [bookCode, chapters] of byBook) {
    const printChapters: PrintChapter[] = [];
    for (const [chapterNum, blocks] of chapters) {
      const entries: PrintVerseEntry[] = [];

      if (args.granularity === "chunks") {
        for (const block of blocks) {
          const sides = buildSides(block, args.includeUsfm);
          if (sides.oldRuns.length === 0 && sides.newRuns.length === 0)
            continue;
          entries.push({
            semanticSid: block.semanticSid,
            status: statusForSides(sides, toEntryStatus(block.status)),
            oldRuns: sides.oldRuns,
            newRuns: sides.newRuns,
          });
        }
      } else {
        // verses — merge blocks sharing a verse, preserving order
        const byVerse = new Map<string, ProjectDiff[]>();
        const order: string[] = [];
        for (const block of blocks) {
          if (!byVerse.has(block.semanticSid)) order.push(block.semanticSid);
          const group = byVerse.get(block.semanticSid) ?? [];
          group.push(block);
          byVerse.set(block.semanticSid, group);
        }
        for (const sid of order) {
          const entry = mergeBlocksToVerseEntry(
            byVerse.get(sid) ?? [],
            args.includeUsfm,
          );
          if (entry.oldRuns.length === 0 && entry.newRuns.length === 0)
            continue;
          entries.push(entry);
        }
      }

      if (entries.length === 0) continue;
      totalChanges += entries.length;
      printChapters.push({ chapterNum, entries });
    }

    if (printChapters.length === 0) continue;
    printChapters.sort((a, b) => a.chapterNum - b.chapterNum);
    books.push({ bookCode, chapters: printChapters });
  }

  books.sort((a, b) => a.bookCode.localeCompare(b.bookCode));

  return { books, totalChanges };
}
