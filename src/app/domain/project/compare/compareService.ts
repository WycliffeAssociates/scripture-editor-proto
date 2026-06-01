import { tokensToRenderTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import {
    flattenDiffMap,
    replaceChapterDiffsInMap,
} from "@/core/domain/usfm/usfmOnionDiffMap.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { CompareDiff, CompareResult, CompareWarning } from "./types.ts";

export type CompareMetadataSummary = {
    projectId?: string;
    languageId?: string;
    languageDirection?: LanguageDirection;
};

type ChapterCoverage = {
    overlap: Array<{ bookCode: string; chapterNum: number }>;
    baselineOnly: Array<{ bookCode: string; chapterNum: number }>;
    sourceOnly: Array<{ bookCode: string; chapterNum: number }>;
};

type CompareDiffMapBuildArgs = {
    baselineMap: Map<
        string,
        { bookCode: string; chapterNum: number; side: ChapterSide }
    >;
    sourceMap: Map<
        string,
        { bookCode: string; chapterNum: number; side: ChapterSide }
    >;
};

type BuildCompareResultArgs = {
    currentFiles: ScriptureBookState[];
    sourceFiles: ScriptureBookState[];
    currentMetadata?: CompareMetadataSummary;
    sourceMetadata?: CompareMetadataSummary;
    usfmOnionService: IUsfmOnionService;
    batchSize?: number;
    onBatchComplete?: () => Promise<void>;
};

type ChapterSide = {
    file: ScriptureBookState;
    chapter: ScriptureChapterState;
};

/**
 * Compares the current scripture workspace against an external or historical
 * scripture source.
 *
 * By the time code reaches this module, both sides have already been loaded into
 * `ScriptureBookState` nouns. This service stays at that workspace layer: it
 * computes metadata warnings, chapter coverage, and diff hunks. Mutation/apply
 * flows live in `compareMutations.ts` so callers can depend on either the pure
 * result builder or the workspace mutation layer independently.
 */
function getBaselineTokens(chapter: ScriptureChapterState): Token[] {
    return chapter.currentTokens;
}

function buildChapterMap(
    files: ScriptureBookState[],
): Map<string, { bookCode: string; chapterNum: number; side: ChapterSide }> {
    const out = new Map<
        string,
        { bookCode: string; chapterNum: number; side: ChapterSide }
    >();
    for (const file of files) {
        for (const chapter of file.chapters) {
            const chapterNum = chapter.chapterNumber;
            out.set(`${file.bookCode}:${chapterNum}`, {
                bookCode: file.bookCode,
                chapterNum,
                side: {
                    file,
                    chapter,
                },
            });
        }
    }
    return out;
}

function compareMetadata(args: {
    currentMetadata?: CompareMetadataSummary;
    sourceMetadata?: CompareMetadataSummary;
}): CompareWarning[] {
    const out: CompareWarning[] = [];
    const { currentMetadata, sourceMetadata } = args;
    if (!currentMetadata || !sourceMetadata) return out;

    if (
        currentMetadata.projectId &&
        sourceMetadata.projectId &&
        currentMetadata.projectId !== sourceMetadata.projectId
    ) {
        out.push({
            code: "project_id_mismatch",
            message: "Project identifiers differ between current and source.",
        });
    }

    if (
        currentMetadata.languageId &&
        sourceMetadata.languageId &&
        currentMetadata.languageId !== sourceMetadata.languageId
    ) {
        out.push({
            code: "language_id_mismatch",
            message: "Language identifiers differ between current and source.",
        });
    }

    if (
        currentMetadata.languageDirection &&
        sourceMetadata.languageDirection &&
        currentMetadata.languageDirection !== sourceMetadata.languageDirection
    ) {
        out.push({
            code: "direction_mismatch",
            message: "Language direction differs between current and source.",
        });
    }

    return out;
}

async function buildChapterDiffMapAsync(
    args: CompareDiffMapBuildArgs & {
        usfmOnionService: IUsfmOnionService;
        batchSize: number;
        onBatchComplete?: () => Promise<void>;
    },
): Promise<{
    diffsByChapter: CompareResult["diffsByChapter"];
    coverage: ChapterCoverage;
}> {
    const allChapterKeys = Array.from(
        new Set([...args.baselineMap.keys(), ...args.sourceMap.keys()]),
    );
    const overlap: Array<{ bookCode: string; chapterNum: number }> = [];
    const baselineOnly: Array<{ bookCode: string; chapterNum: number }> = [];
    const sourceOnly: Array<{ bookCode: string; chapterNum: number }> = [];
    let diffsByChapter: CompareResult["diffsByChapter"] = {};

    for (let i = 0; i < allChapterKeys.length; i += args.batchSize) {
        const batch = allChapterKeys.slice(i, i + args.batchSize);
        const batchEntries: Array<{
            bookCode: string;
            chapterNum: number;
            baselineTokens: Token[];
            sourceTokens: Token[];
        }> = [];

        for (const key of batch) {
            const baselineEntry = args.baselineMap.get(key);
            const sourceEntry = args.sourceMap.get(key);
            const bookCode =
                baselineEntry?.bookCode ?? sourceEntry?.bookCode ?? "";
            const chapterNum =
                baselineEntry?.chapterNum ??
                sourceEntry?.chapterNum ??
                Number.NaN;
            if (!bookCode || Number.isNaN(chapterNum)) continue;

            const baselineTokens = baselineEntry
                ? getBaselineTokens(baselineEntry.side.chapter)
                : [];
            const sourceTokens = sourceEntry
                ? sourceEntry.side.chapter.currentTokens
                : [];

            if (baselineEntry && sourceEntry) {
                overlap.push({ bookCode, chapterNum });
            } else if (baselineEntry && !sourceEntry) {
                baselineOnly.push({ bookCode, chapterNum });
            } else if (!baselineEntry && sourceEntry) {
                sourceOnly.push({ bookCode, chapterNum });
            }

            batchEntries.push({
                bookCode,
                chapterNum,
                baselineTokens,
                sourceTokens,
            });
        }

        const batchDiffs = await args.usfmOnionService.diffScope(
            batchEntries.map((entry) => ({
                baselineTokens: entry.baselineTokens,
                currentTokens: entry.sourceTokens,
            })),
        );

        for (let entryIdx = 0; entryIdx < batchEntries.length; entryIdx++) {
            const entry = batchEntries[entryIdx];
            const chapterDiffs = (batchDiffs[entryIdx] ?? []).map<CompareDiff>(
                (diff) => ({
                    uniqueKey: diff.blockId,
                    semanticSid: diff.semanticSid,
                    status: diff.status as CompareDiff["status"],
                    originalDisplayText: diff.originalText,
                    currentDisplayText: diff.currentText,
                    originalTextOnly: diff.originalTextOnly,
                    currentTextOnly: diff.currentTextOnly,
                    bookCode: entry.bookCode,
                    chapterNum: entry.chapterNum,
                    isWhitespaceChange: diff.isWhitespaceChange,
                    isUsfmStructureChange: diff.isUsfmStructureChange,
                    originalRenderTokens: tokensToRenderTokens(
                        diff.originalTokens,
                    ),
                    currentRenderTokens: tokensToRenderTokens(
                        diff.currentTokens,
                    ),
                    originalAlignment: diff.originalAlignment,
                    currentAlignment: diff.currentAlignment,
                    undoSide: diff.undoSide,
                }),
            );

            diffsByChapter = replaceChapterDiffsInMap({
                previousMap: diffsByChapter,
                bookCode: entry.bookCode,
                chapterNum: entry.chapterNum,
                chapterDiffs,
            });
        }

        if (
            args.onBatchComplete &&
            i + args.batchSize < allChapterKeys.length
        ) {
            await args.onBatchComplete();
        }
    }

    return {
        diffsByChapter,
        coverage: {
            overlap,
            baselineOnly,
            sourceOnly,
        },
    };
}

export async function buildCompareResultAsync(
    args: BuildCompareResultArgs,
): Promise<CompareResult> {
    const baselineMap = buildChapterMap(args.currentFiles);
    const sourceMap = buildChapterMap(args.sourceFiles);
    const { diffsByChapter, coverage } = await buildChapterDiffMapAsync({
        baselineMap,
        sourceMap,
        usfmOnionService: args.usfmOnionService,
        batchSize: args.batchSize ?? 8,
        onBatchComplete: args.onBatchComplete,
    });

    const warnings = compareMetadata({
        currentMetadata: args.currentMetadata,
        sourceMetadata: args.sourceMetadata,
    });
    if (coverage.baselineOnly.length > 0 || coverage.sourceOnly.length > 0) {
        warnings.push({
            code: "book_coverage_diff",
            message:
                "Book/chapter coverage differs between current project and source.",
        });
    }

    const diffs = flattenDiffMap({
        diffsByChapter,
        include: (diff) => diff.status !== "unchanged",
    });

    return {
        diffsByChapter,
        diffs,
        warnings,
        coverage: {
            baselineOnly: coverage.baselineOnly,
            sourceOnly: coverage.sourceOnly,
            overlapping: coverage.overlap,
        },
    };
}
