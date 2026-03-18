import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import {
    inferContentEditorModeFromRootChildren,
    tokensToLexical,
    tokensToRenderTokens,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { isChapterDirtyUsfm } from "@/app/domain/project/saveAndRevertService.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import {
    flattenDiffMap,
    replaceChapterDiffsInMap,
} from "@/core/domain/usfm/usfmOnionDiffMap.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type {
    CompareBaseline,
    CompareDiff,
    CompareResult,
    CompareSessionConfig,
    CompareWarning,
} from "./types.ts";

export type CompareMetadataSummary = {
    projectId?: string;
    languageId?: string;
    languageDirection?: "ltr" | "rtl";
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
    baseline: CompareBaseline;
};

type BuildCompareResultArgs = {
    currentFiles: ParsedFile[];
    config: CompareSessionConfig;
    sourceFiles: ParsedFile[];
    currentMetadata?: CompareMetadataSummary;
    sourceMetadata?: CompareMetadataSummary;
    usfmOnionService: IUsfmOnionService;
    batchSize?: number;
    onBatchComplete?: () => Promise<void>;
};

type ChapterSide = {
    file: ParsedFile;
    chapter: ParsedChapter;
};

function getBaselineTokens(
    chapter: ParsedChapter,
    baseline: CompareBaseline,
): Token[] {
    return baseline === "currentSaved"
        ? chapter.sourceTokens
        : chapter.currentTokens;
}

function buildChapterMap(
    files: ParsedFile[],
): Map<string, { bookCode: string; chapterNum: number; side: ChapterSide }> {
    const out = new Map<
        string,
        { bookCode: string; chapterNum: number; side: ChapterSide }
    >();
    for (const file of files) {
        for (const chapter of file.chapters) {
            const chapterNum = chapter.chapNumber;
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
                ? getBaselineTokens(baselineEntry.side.chapter, args.baseline)
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

export async function buildCompareResult(
    args: BuildCompareResultArgs,
): Promise<CompareResult> {
    return buildCompareResultAsync(args);
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
        baseline: args.config.baseline,
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

function findWorkingChapter(
    workingFiles: ParsedFile[],
    bookCode: string,
    chapterNum: number,
) {
    const file = workingFiles.find(
        (candidate) => candidate.bookCode === bookCode,
    );
    const chapter = file?.chapters.find((c) => c.chapNumber === chapterNum);
    return { file, chapter };
}

function ensureWorkingChapterFromSource(args: {
    workingFiles: ParsedFile[];
    sourceFiles: ParsedFile[];
    bookCode: string;
    chapterNum: number;
}) {
    const existing = findWorkingChapter(
        args.workingFiles,
        args.bookCode,
        args.chapterNum,
    );
    if (existing.file && existing.chapter) return existing;

    const sourceFile = args.sourceFiles.find(
        (f) => f.bookCode === args.bookCode,
    );
    const sourceChapter = sourceFile?.chapters.find(
        (c) => c.chapNumber === args.chapterNum,
    );
    if (!sourceFile || !sourceChapter) return existing;

    if (!existing.file) {
        const newFile: ParsedFile = {
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
        const newChapter: ParsedChapter = {
            chapNumber: args.chapterNum,
            lexicalState: structuredClone(sourceChapter.lexicalState),
            loadedLexicalState: structuredClone(
                sourceChapter.loadedLexicalState,
            ),
            sourceTokens: structuredClone(sourceChapter.sourceTokens),
            currentTokens: structuredClone(sourceChapter.currentTokens),
            dirty: false,
        };
        existing.file.chapters.push(newChapter);
        existing.chapter = newChapter;
    }

    return existing;
}

function applyTokensToWorkingChapter(args: {
    chapter: ParsedChapter;
    nextTokens: Token[];
}) {
    const direction =
        (args.chapter.lexicalState.root.direction ?? "ltr") === "rtl"
            ? "rtl"
            : "ltr";
    const currentMode = inferContentEditorModeFromRootChildren(
        args.chapter.lexicalState.root.children,
    );
    args.chapter.lexicalState = tokensToLexical({
        tokens: args.nextTokens,
        direction,
        mode: currentMode === "regular" ? "regular" : "flat",
    });
    args.chapter.currentTokens = args.nextTokens;
    args.chapter.dirty = isChapterDirtyUsfm(args.chapter);
}

export async function applyIncomingHunk(args: {
    workingFiles: ParsedFile[];
    sourceFiles: ParsedFile[];
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

    // Take-incoming = treat source as baseline and revert the current working
    // side for this block back to source semantics.
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

export function applyIncomingChapter(args: {
    workingFiles: ParsedFile[];
    sourceFiles: ParsedFile[];
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

    const incomingTokens = sourceChapter.currentTokens;
    applyTokensToWorkingChapter({
        chapter: workingChapter,
        nextTokens: incomingTokens,
    });
}

export function applyIncomingChapterAll(args: {
    workingFiles: ParsedFile[];
    sourceFiles: ParsedFile[];
}) {
    const chapterKeys = new Set<string>();
    for (const file of args.workingFiles) {
        for (const chapter of file.chapters) {
            chapterKeys.add(`${file.bookCode}:${chapter.chapNumber}`);
        }
    }
    for (const file of args.sourceFiles) {
        for (const chapter of file.chapters) {
            chapterKeys.add(`${file.bookCode}:${chapter.chapNumber}`);
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
