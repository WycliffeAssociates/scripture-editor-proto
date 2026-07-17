import { normalizeTokenSids } from "usfm-onion-web/token-sids";

import type {
  ScriptureBookState,
  ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

import type {
  ChapterAddress,
  CompareChaptersByBook,
  CompareMetadataSummary,
  CompareResult,
  CompareSourcePair,
  CompareWarning,
  FrozenChapterComparison,
} from "./types.ts";

export type { CompareMetadataSummary } from "./types.ts";

type ChapterSide = {
  file: ScriptureBookState;
  chapter: ScriptureChapterState;
};

type ChapterMapEntry = ChapterAddress & { side: ChapterSide };

type BuildCompareResultArgs = {
  leftFiles: ScriptureBookState[];
  rightFiles: ScriptureBookState[];
  sources: CompareSourcePair;
  leftMetadata?: CompareMetadataSummary;
  rightMetadata?: CompareMetadataSummary;
  usfmOnionService: IUsfmOnionService;
  batchSize?: number;
  onBatchComplete?: () => Promise<void>;
};

function buildChapterMap(
  files: ScriptureBookState[],
): Map<string, ChapterMapEntry> {
  const out = new Map<string, ChapterMapEntry>();
  for (const file of files) {
    for (const chapter of file.chapters) {
      const chapterNum = chapter.chapterNumber;
      out.set(chapterKey(file.bookCode, chapterNum), {
        bookCode: file.bookCode,
        chapterNum,
        side: { file, chapter },
      });
    }
  }
  return out;
}

function compareMetadata(args: {
  leftMetadata?: CompareMetadataSummary;
  rightMetadata?: CompareMetadataSummary;
}): CompareWarning[] {
  const out: CompareWarning[] = [];
  const { leftMetadata: left, rightMetadata: right } = args;
  if (!left || !right) return out;

  if (left.projectId && right.projectId && left.projectId !== right.projectId) {
    out.push({
      code: "project_id_mismatch",
      message: "Project identifiers differ between the selected sources.",
    });
  }
  if (
    left.languageId &&
    right.languageId &&
    left.languageId !== right.languageId
  ) {
    out.push({
      code: "language_id_mismatch",
      message: "Language identifiers differ between the selected sources.",
    });
  }
  if (
    left.languageDirection &&
    right.languageDirection &&
    left.languageDirection !== right.languageDirection
  ) {
    out.push({
      code: "direction_mismatch",
      message: "Language direction differs between the selected sources.",
    });
  }
  return out;
}

/**
 * Creates the frozen comparison boundary. Both complete chapter arrays are
 * canonically SID-normalized and frozen before Onion sees them; those same
 * array identities are retained for all later merge projections.
 */
export async function buildCompareResultAsync(
  args: BuildCompareResultArgs,
): Promise<CompareResult> {
  const leftMap = buildChapterMap(args.leftFiles);
  const rightMap = buildChapterMap(args.rightFiles);
  const allKeys = Array.from(
    new Set([...leftMap.keys(), ...rightMap.keys()]),
  ).sort(compareChapterKeys);
  const leftOnly: ChapterAddress[] = [];
  const rightOnly: ChapterAddress[] = [];
  const overlapping: ChapterAddress[] = [];
  const chapters: Record<string, Record<number, FrozenChapterComparison>> = {};
  let changedUnitCount = 0;
  const batchSize = Math.max(1, args.batchSize ?? 8);

  for (let offset = 0; offset < allKeys.length; offset += batchSize) {
    const batch = allKeys.slice(offset, offset + batchSize).map((key) => {
      const left = leftMap.get(key);
      const right = rightMap.get(key);
      const address = Object.freeze({
        bookCode: left?.bookCode ?? right?.bookCode ?? "",
        chapterNum: left?.chapterNum ?? right?.chapterNum ?? Number.NaN,
      });
      if (!address.bookCode || Number.isNaN(address.chapterNum)) {
        throw new Error(`Invalid comparison chapter key: ${key}`);
      }

      const leftTokens = freezeNormalizedTokens(
        left?.side.chapter.currentTokens ?? [],
        address.bookCode,
      );
      const rightTokens = freezeNormalizedTokens(
        right?.side.chapter.currentTokens ?? [],
        address.bookCode,
      );
      if (left && right) overlapping.push(address);
      else if (left) leftOnly.push(address);
      else rightOnly.push(address);
      return { address, leftTokens, rightTokens };
    });

    const skeletons = await args.usfmOnionService.diffScope(
      batch.map((entry) => ({
        baselineTokens: entry.leftTokens,
        currentTokens: entry.rightTokens,
      })),
    );
    if (skeletons.length !== batch.length) {
      throw new Error(
        `Onion returned ${skeletons.length} chapter skeletons for ${batch.length} inputs.`,
      );
    }

    batch.forEach((entry, index) => {
      const skeleton = skeletons[index];
      if (!skeleton)
        throw new Error(
          `Missing diff skeleton for ${chapterKey(entry.address.bookCode, entry.address.chapterNum)}`,
        );
      const frozenSkeleton = deepFreeze(skeleton);
      const actionableUnitCount = frozenSkeleton.units.filter(
        (unit) => unit.status !== "unchanged",
      ).length;
      const key = chapterKey(entry.address.bookCode, entry.address.chapterNum);
      const leftPresent = leftMap.has(key);
      const rightPresent = rightMap.has(key);
      changedUnitCount +=
        actionableUnitCount +
        (actionableUnitCount === 0 && leftPresent !== rightPresent ? 1 : 0);
      (chapters[entry.address.bookCode] ??= {})[entry.address.chapterNum] =
        Object.freeze({
          address: entry.address,
          left: Object.freeze({
            present: leftPresent,
            dirty:
              leftMap.get(
                chapterKey(entry.address.bookCode, entry.address.chapterNum),
              )?.side.chapter.dirty ?? false,
            eol:
              leftMap.get(
                chapterKey(entry.address.bookCode, entry.address.chapterNum),
              )?.side.chapter.eol ?? null,
            direction:
              leftMap.get(
                chapterKey(entry.address.bookCode, entry.address.chapterNum),
              )?.side.chapter.direction ?? null,
            book: toBookMetadata(
              leftMap.get(
                chapterKey(entry.address.bookCode, entry.address.chapterNum),
              )?.side.file,
            ),
            tokens: entry.leftTokens,
          }),
          right: Object.freeze({
            present: rightPresent,
            dirty:
              rightMap.get(
                chapterKey(entry.address.bookCode, entry.address.chapterNum),
              )?.side.chapter.dirty ?? false,
            eol:
              rightMap.get(
                chapterKey(entry.address.bookCode, entry.address.chapterNum),
              )?.side.chapter.eol ?? null,
            direction:
              rightMap.get(
                chapterKey(entry.address.bookCode, entry.address.chapterNum),
              )?.side.chapter.direction ?? null,
            book: toBookMetadata(
              rightMap.get(
                chapterKey(entry.address.bookCode, entry.address.chapterNum),
              )?.side.file,
            ),
            tokens: entry.rightTokens,
          }),
          skeleton: frozenSkeleton,
        });
    });

    if (args.onBatchComplete && offset + batchSize < allKeys.length) {
      await args.onBatchComplete();
    }
  }

  const warnings = compareMetadata({
    leftMetadata: args.leftMetadata,
    rightMetadata: args.rightMetadata,
  });
  if (leftOnly.length > 0 || rightOnly.length > 0) {
    warnings.push({
      code: "book_coverage_diff",
      message: "Book/chapter coverage differs between the selected sources.",
    });
  }

  return Object.freeze({
    sources: args.sources,
    chapters: freezeChapterTree(chapters),
    warnings: Object.freeze(warnings),
    coverage: Object.freeze({
      leftOnly: Object.freeze(leftOnly),
      rightOnly: Object.freeze(rightOnly),
      overlapping: Object.freeze(overlapping),
    }),
    changedUnitCount,
  });
}

function toBookMetadata(file: ScriptureBookState | undefined) {
  if (!file) return null;
  return Object.freeze({
    path: file.path,
    title: file.title,
    bookCode: file.bookCode,
    nextBookId: file.nextBookId,
    prevBookId: file.prevBookId,
    ...(file.sort === undefined ? {} : { sort: file.sort }),
  });
}

function freezeNormalizedTokens(
  tokens: readonly Token[],
  bookCode: string,
): readonly Token[] {
  return deepFreeze(normalizeTokenSids(tokens, bookCode) as Token[]);
}

function freezeChapterTree(
  chapters: Record<string, Record<number, FrozenChapterComparison>>,
): CompareChaptersByBook {
  for (const byChapter of Object.values(chapters)) Object.freeze(byChapter);
  return Object.freeze(chapters);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function chapterKey(bookCode: string, chapterNum: number): string {
  return `${bookCode}:${chapterNum}`;
}

function compareChapterKeys(left: string, right: string): number {
  const [leftBook, leftChapter = "0"] = left.split(":");
  const [rightBook, rightChapter = "0"] = right.split(":");
  return (
    leftBook.localeCompare(rightBook) ||
    Number(leftChapter) - Number(rightChapter)
  );
}
