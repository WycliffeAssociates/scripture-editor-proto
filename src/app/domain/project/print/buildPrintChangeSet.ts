import { diffWordsWithSpace } from "diff";

import { buildCompareResultAsync } from "@/app/domain/project/compare/compareService.ts";
import type { CompareSourcePair } from "@/app/domain/project/compare/types.ts";
import { buildCompareListRows } from "@/app/domain/project/compare/viewModels.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
  DecisionStatus,
  DecisionUnit,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Builds the data model for the "Print changes" document — a terse,
 * verse-by-verse record of what changed between two scripture sides, ready to
 * render as a monochrome printable page.
 *
 * Both sides and their source identities are explicit. This module never reads
 * the resident working-files store, so the same projection supports checkpoint,
 * ZIP/folder, existing-project, and other read-only source pairs.
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
  /** Named, addressable source identities for this read-only comparison. */
  sources: CompareSourcePair;
  usfmOnionService: IUsfmOnionService;
  scope: PrintScope;
  granularity: PrintGranularity;
  includeUsfm: boolean;
};

type PrintUnitChange = Readonly<{
  semanticSid: string;
  status: DecisionStatus;
  baselineTokens: readonly Token[];
  currentTokens: readonly Token[];
}>;

function tokensToPrintText(
  tokens: readonly Token[],
  includeUsfm: boolean,
): string {
  return tokens
    .filter((token) => includeUsfm || token.kind === "text")
    .map((token) => token.source)
    .join("");
}

type PrintSides = { oldRuns: PrintWordRun[]; newRuns: PrintWordRun[] };

/**
 * Split one diff block into its before/after sides. The before side carries the
 * old text with removed words marked; the after side carries the new text with
 * added words marked. A word diff drives both so the two columns line up.
 */
function buildSides(change: PrintUnitChange, includeUsfm: boolean): PrintSides {
  const oldText = tokensToPrintText(change.baselineTokens, includeUsfm).trim();
  const newText = tokensToPrintText(change.currentTokens, includeUsfm).trim();

  if (change.status === "added") {
    return {
      oldRuns: [],
      newRuns: newText ? [{ text: newText, mark: "added" }] : [],
    };
  }
  if (change.status === "deleted") {
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

function toEntryStatus(status: DecisionStatus): PrintEntryStatus {
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
  blocks: PrintUnitChange[],
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
  if (args.sources.writableSide !== null) {
    throw new Error("Print comparisons must use two read-only sources.");
  }
  const result = await buildCompareResultAsync({
    // old side is the baseline so "added" means "added since then".
    leftFiles: args.oldFiles,
    rightFiles: args.newFiles,
    sources: args.sources,
    usfmOnionService: args.usfmOnionService,
  });

  const scope = args.scope;
  // book -> chapter -> ordered blocks
  const byBook = new Map<string, Map<number, PrintUnitChange[]>>();
  for (const [bookCode, resultChapters] of Object.entries(result.chapters)) {
    if (scope.kind === "books" && !scope.bookCodes.includes(bookCode)) continue;
    const chapters = new Map<number, PrintUnitChange[]>();
    for (const [chapterKey, chapter] of Object.entries(resultChapters)) {
      const blocks = buildCompareListRows({
        skeleton: chapter.skeleton,
        decisions: {},
        filters: { hideUnchanged: true },
      }).map(({ unit }) => toPrintUnitChange(unit));
      if (blocks.length > 0) chapters.set(Number(chapterKey), blocks);
    }
    if (chapters.size > 0) byBook.set(bookCode, chapters);
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
        const byVerse = new Map<string, PrintUnitChange[]>();
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

function toPrintUnitChange(unit: DecisionUnit): PrintUnitChange {
  return {
    semanticSid: unit.currentSid ?? unit.baselineSid ?? unit.id,
    status: unit.status,
    baselineTokens: unit.baselineTokens,
    currentTokens: unit.currentTokens,
  };
}
