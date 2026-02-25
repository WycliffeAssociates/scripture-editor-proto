import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import {
    diffTokensToEditorState,
    inferContentEditorModeFromRootChildren,
    lexicalEditorStateToDiffTokens,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { isChapterDirtyUsfm } from "@/app/domain/project/saveAndRevertService.ts";
import {
    diffChapterTokenStreams,
    flattenDiffMap,
    replaceChapterDiffsInMap,
} from "@/core/domain/usfm/chapterDiffOperation.ts";
import { buildSidBlocks } from "@/core/domain/usfm/sidBlocks.ts";
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

type BuildCompareResultArgs = {
    currentFiles: ParsedFile[];
    config: CompareSessionConfig;
    sourceFiles: ParsedFile[];
    currentMetadata?: CompareMetadataSummary;
    sourceMetadata?: CompareMetadataSummary;
};

type ChapterSide = {
    file: ParsedFile;
    chapter: ParsedChapter;
};

function getBaselineState(
    chapter: ParsedChapter,
    baseline: CompareBaseline,
): ParsedChapter["lexicalState"] {
    return baseline === "currentSaved"
        ? chapter.loadedLexicalState
        : chapter.lexicalState;
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

export function buildCompareResult(
    args: BuildCompareResultArgs,
): CompareResult {
    const baselineMap = buildChapterMap(args.currentFiles);
    const sourceMap = buildChapterMap(args.sourceFiles);

    const allChapterKeys = new Set([
        ...baselineMap.keys(),
        ...sourceMap.keys(),
    ]);
    const overlap: Array<{ bookCode: string; chapterNum: number }> = [];
    const baselineOnly: Array<{ bookCode: string; chapterNum: number }> = [];
    const sourceOnly: Array<{ bookCode: string; chapterNum: number }> = [];

    let diffsByChapter: CompareResult["diffsByChapter"] = {};

    for (const key of allChapterKeys) {
        const baselineEntry = baselineMap.get(key);
        const sourceEntry = sourceMap.get(key);
        const bookCode = baselineEntry?.bookCode ?? sourceEntry?.bookCode ?? "";
        const chapterNum =
            baselineEntry?.chapterNum ?? sourceEntry?.chapterNum ?? Number.NaN;
        if (!bookCode || Number.isNaN(chapterNum)) continue;

        const baselineTokens = baselineEntry
            ? lexicalEditorStateToDiffTokens(
                  getBaselineState(
                      baselineEntry.side.chapter,
                      args.config.baseline,
                  ),
              )
            : [];
        const sourceTokens = sourceEntry
            ? lexicalEditorStateToDiffTokens(
                  sourceEntry.side.chapter.lexicalState,
              )
            : [];

        if (baselineEntry && sourceEntry) {
            overlap.push({ bookCode, chapterNum });
        } else if (baselineEntry && !sourceEntry) {
            baselineOnly.push({ bookCode, chapterNum });
        } else if (!baselineEntry && sourceEntry) {
            sourceOnly.push({ bookCode, chapterNum });
        }

        const chapterDiffs = diffChapterTokenStreams({
            baselineTokens,
            currentTokens: sourceTokens,
        }).map<CompareDiff>((diff) => ({
            uniqueKey: diff.blockId,
            semanticSid: diff.semanticSid,
            status: diff.status,
            originalDisplayText: diff.originalText,
            currentDisplayText: diff.currentText,
            originalTextOnly: diff.originalTextOnly,
            currentTextOnly: diff.currentTextOnly,
            bookCode,
            chapterNum,
            isWhitespaceChange: diff.isWhitespaceChange,
            isUsfmStructureChange: diff.isUsfmStructureChange,
        }));

        diffsByChapter = replaceChapterDiffsInMap({
            previousMap: diffsByChapter,
            bookCode,
            chapterNum,
            chapterDiffs,
        });
    }

    const warnings = compareMetadata({
        currentMetadata: args.currentMetadata,
        sourceMetadata: args.sourceMetadata,
    });
    if (baselineOnly.length > 0 || sourceOnly.length > 0) {
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
            baselineOnly,
            sourceOnly,
            overlapping: overlap,
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
            dirty: false,
        };
        existing.file.chapters.push(newChapter);
        existing.chapter = newChapter;
    }

    return existing;
}

function applyTokensToWorkingChapter(args: {
    chapter: ParsedChapter;
    nextTokens: ReturnType<typeof lexicalEditorStateToDiffTokens>;
}) {
    const direction =
        (args.chapter.lexicalState.root.direction ?? "ltr") === "rtl"
            ? "rtl"
            : "ltr";
    const currentMode = inferContentEditorModeFromRootChildren(
        args.chapter.lexicalState.root.children,
    );
    args.chapter.lexicalState = diffTokensToEditorState({
        tokens: args.nextTokens,
        direction,
        targetMode: currentMode,
    });
    args.chapter.dirty = isChapterDirtyUsfm(args.chapter);
}

export function applyIncomingHunk(args: {
    workingFiles: ParsedFile[];
    sourceFiles: ParsedFile[];
    diff: CompareDiff;
    baseline: CompareBaseline;
}) {
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

    const sourceTokens = lexicalEditorStateToDiffTokens(
        sourceChapter.lexicalState,
    );
    const sourceBlocks = buildSidBlocks(sourceTokens);
    const sourceById = new Map(
        sourceBlocks.map((block) => [block.blockId, block]),
    );
    const incomingBlock = sourceById.get(args.diff.uniqueKey);

    const baselineTokens = lexicalEditorStateToDiffTokens(
        getBaselineState(workingChapter, args.baseline),
    );
    const baselineBlocks = buildSidBlocks(baselineTokens);
    const baselineById = new Map(
        baselineBlocks.map((block) => [block.blockId, block]),
    );
    const baselineBlock = baselineById.get(args.diff.uniqueKey);

    const workingTokens = lexicalEditorStateToDiffTokens(
        workingChapter.lexicalState,
    );
    const workingBlocks = buildSidBlocks(workingTokens);
    const workingById = new Map(
        workingBlocks.map((block) => [block.blockId, block]),
    );

    // Already applied in a previous step.
    if (
        !baselineBlock &&
        incomingBlock &&
        workingById.has(incomingBlock.blockId)
    ) {
        return;
    }

    const next = [...workingTokens];

    // Deleted on source side -> remove baseline-aligned block from working.
    if (baselineBlock && !incomingBlock) {
        const currentBlock = workingById.get(baselineBlock.blockId);
        if (currentBlock) {
            next.splice(
                currentBlock.start,
                currentBlock.endExclusive - currentBlock.start,
            );
            applyTokensToWorkingChapter({
                chapter: workingChapter,
                nextTokens: next,
            });
        }
        return;
    }

    // Added on source side -> insert source block at best-effort anchor.
    if (!baselineBlock && incomingBlock) {
        const incomingSlice = sourceTokens.slice(
            incomingBlock.start,
            incomingBlock.endExclusive,
        );
        let insertionIndex = 0;
        let anchorId = incomingBlock.prevBlockId;
        while (anchorId) {
            const anchor = workingById.get(anchorId);
            if (anchor) {
                insertionIndex = anchor.endExclusive;
                break;
            }
            const prevInSource = sourceById.get(anchorId);
            anchorId = prevInSource?.prevBlockId ?? null;
        }
        next.splice(insertionIndex, 0, ...structuredClone(incomingSlice));
        applyTokensToWorkingChapter({
            chapter: workingChapter,
            nextTokens: next,
        });
        return;
    }

    // Modified -> replace baseline-aligned block with source block.
    if (baselineBlock && incomingBlock) {
        const currentBlock = workingById.get(baselineBlock.blockId);
        const incomingSlice = sourceTokens.slice(
            incomingBlock.start,
            incomingBlock.endExclusive,
        );
        if (currentBlock) {
            next.splice(
                currentBlock.start,
                currentBlock.endExclusive - currentBlock.start,
                ...structuredClone(incomingSlice),
            );
            applyTokensToWorkingChapter({
                chapter: workingChapter,
                nextTokens: next,
            });
        }
    }
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

    const incomingTokens = lexicalEditorStateToDiffTokens(
        sourceChapter.lexicalState,
    );
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
