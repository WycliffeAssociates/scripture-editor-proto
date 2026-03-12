import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    applyIncomingChapter,
    applyIncomingChapterAll,
    applyIncomingHunk,
    buildCompareResult,
    type CompareMetadataSummary,
} from "@/app/domain/project/compare/compareService.ts";
import type {
    CompareBaseline,
    CompareSessionConfig,
} from "@/app/domain/project/compare/types.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Diff, FlatToken } from "@/core/domain/usfm/usfmOnionTypes.ts";

function makeFlatTokens(text: string, sid: string, id: string): FlatToken[] {
    return [
        {
            id,
            kind: "text",
            span: { start: 0, end: text.length },
            sid,
            marker: null,
            text,
        },
    ];
}

function makeEditorState(
    text: string,
    sid: string,
    id: string,
): SerializedEditorState<SerializedLexicalNode> {
    return {
        root: {
            type: "root",
            version: 1,
            direction: "ltr",
            format: "start",
            indent: 0,
            children: [
                {
                    type: "paragraph",
                    version: 1,
                    direction: "ltr",
                    format: "",
                    indent: 0,
                    textFormat: 0,
                    textStyle: "",
                    children: [
                        createSerializedUSFMTextNode({
                            text,
                            sid,
                            id,
                            tokenType: UsfmTokenTypes.text,
                        }),
                    ],
                } as unknown as SerializedLexicalNode,
            ],
        },
    };
}

function makeFiles(args: {
    loadedText: string;
    currentText: string;
    bookCode?: string;
    chapterNum?: number;
}): ParsedFile[] {
    const bookCode = args.bookCode ?? "GEN";
    const chapterNum = args.chapterNum ?? 1;
    return [
        {
            path: `/tmp/${bookCode}.usfm`,
            title: bookCode,
            bookCode,
            nextBookId: null,
            prevBookId: null,
            chapters: [
                {
                    chapNumber: chapterNum,
                    dirty: args.loadedText !== args.currentText,
                    sourceTokens: makeFlatTokens(
                        args.loadedText,
                        `${bookCode} ${chapterNum}:1`,
                        `${bookCode}-loaded`,
                    ),
                    currentTokens: makeFlatTokens(
                        args.currentText,
                        `${bookCode} ${chapterNum}:1`,
                        `${bookCode}-current`,
                    ),
                    loadedLexicalState: makeEditorState(
                        args.loadedText,
                        `${bookCode} ${chapterNum}:1`,
                        `${bookCode}-tok`,
                    ),
                    lexicalState: makeEditorState(
                        args.currentText,
                        `${bookCode} ${chapterNum}:1`,
                        `${bookCode}-tok`,
                    ),
                },
            ],
        },
    ];
}

function config(baseline: CompareBaseline): CompareSessionConfig {
    return {
        mode: "external",
        baseline,
        source: {
            kind: "existingProject",
            projectId: "source",
        },
    };
}

function makeDiffs(
    baselineTokens: FlatToken[],
    currentTokens: FlatToken[],
): Diff[] {
    const originalText = baselineTokens.map((token) => token.text).join("");
    const currentText = currentTokens.map((token) => token.text).join("");
    if (originalText === currentText) {
        return [];
    }

    return [
        {
            blockId:
                baselineTokens[0]?.sid ?? currentTokens[0]?.sid ?? "block-0",
            semanticSid:
                baselineTokens[0]?.sid ?? currentTokens[0]?.sid ?? "unknown",
            status: "modified",
            originalText,
            currentText,
            originalTextOnly: originalText,
            currentTextOnly: currentText,
            isWhitespaceChange: false,
            isUsfmStructureChange: false,
            originalTokens: baselineTokens,
            currentTokens,
            originalAlignment: [],
            currentAlignment: [],
            undoSide: "current",
        },
    ];
}

function createStubUsfmOnionService(): IUsfmOnionService {
    return {
        supportsPathIo: false,
        async diffScope(scope): Promise<Diff[][]> {
            return scope.map((item) =>
                makeDiffs(item.baselineTokens ?? [], item.currentTokens ?? []),
            );
        },
        async diffTokens(
            baselineTokens: FlatToken[],
            currentTokens: FlatToken[],
        ): Promise<Diff[]> {
            return makeDiffs(baselineTokens, currentTokens);
        },
        async revertDiffBlock(
            baselineTokens: FlatToken[],
            _currentTokens: FlatToken[],
            _blockId: string,
        ): Promise<FlatToken[]> {
            return structuredClone(baselineTokens);
        },
    } as IUsfmOnionService;
}

const usfmOnionService = createStubUsfmOnionService();

describe("compareService.buildCompareResult", () => {
    it("uses current-saved baseline when selected", async () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "beta",
        });
        const source = makeFiles({
            loadedText: "gamma",
            currentText: "gamma",
        });

        const result = await buildCompareResult({
            currentFiles: current,
            config: config("currentSaved"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
            usfmOnionService,
        });

        expect(result.diffs).toHaveLength(1);
        expect(result.diffs[0]?.originalDisplayText).toContain("alpha");
        expect(result.diffs[0]?.currentDisplayText).toContain("gamma");
        expect(result.diffs[0]?.originalRenderTokens?.length).toBeGreaterThan(
            0,
        );
        expect(result.diffs[0]?.currentRenderTokens?.length).toBeGreaterThan(0);
    });

    it("uses current-dirty baseline when selected", async () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "beta",
        });
        const source = makeFiles({
            loadedText: "gamma",
            currentText: "gamma",
        });

        const result = await buildCompareResult({
            currentFiles: current,
            config: config("currentDirty"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
            usfmOnionService,
        });

        expect(result.diffs).toHaveLength(1);
        expect(result.diffs[0]?.originalDisplayText).toContain("beta");
        expect(result.diffs[0]?.currentDisplayText).toContain("gamma");
    });

    it("reports book/chapter coverage differences", async () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "alpha",
            bookCode: "GEN",
        });
        const source = makeFiles({
            loadedText: "gamma",
            currentText: "gamma",
            bookCode: "EXO",
        });

        const result = await buildCompareResult({
            currentFiles: current,
            config: config("currentSaved"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
            usfmOnionService,
        });

        expect(result.warnings.map((w) => w.code)).toContain(
            "book_coverage_diff",
        );
    });

    it("emits compatibility warnings for language/direction/project id mismatch", async () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "alpha",
        });
        const source = makeFiles({
            loadedText: "alpha",
            currentText: "alpha",
        });

        const currentMeta: CompareMetadataSummary = {
            projectId: "p1",
            languageId: "en",
            languageDirection: "ltr",
        };
        const sourceMeta: CompareMetadataSummary = {
            projectId: "p2",
            languageId: "es",
            languageDirection: "rtl",
        };

        const result = await buildCompareResult({
            currentFiles: current,
            config: config("currentSaved"),
            sourceFiles: source,
            currentMetadata: currentMeta,
            sourceMetadata: sourceMeta,
            usfmOnionService,
        });

        expect(result.warnings.map((w) => w.code)).toEqual(
            expect.arrayContaining([
                "project_id_mismatch",
                "language_id_mismatch",
                "direction_mismatch",
            ]),
        );
    });
});

describe("compareService apply incoming", () => {
    it("applies an incoming hunk to the working chapter", async () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "alpha",
        });
        const source = makeFiles({
            loadedText: "gamma",
            currentText: "gamma",
        });
        const result = await buildCompareResult({
            currentFiles: current,
            config: config("currentSaved"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
            usfmOnionService,
        });

        const diff = result.diffs[0];
        expect(diff).toBeDefined();
        if (!diff) return;

        await applyIncomingHunk({
            workingFiles: current,
            sourceFiles: source,
            diff,
            usfmOnionService,
        });

        const after = await buildCompareResult({
            currentFiles: current,
            config: config("currentDirty"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
            usfmOnionService,
        });
        expect(after.diffs).toHaveLength(0);
    });

    it("applies full incoming chapter and resolves all chapter diffs", async () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "alpha",
            chapterNum: 1,
        });
        const source = makeFiles({
            loadedText: "gamma",
            currentText: "gamma",
            chapterNum: 1,
        });

        applyIncomingChapter({
            workingFiles: current,
            sourceFiles: source,
            bookCode: "GEN",
            chapterNum: 1,
        });

        const after = await buildCompareResult({
            currentFiles: current,
            config: config("currentDirty"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
            usfmOnionService,
        });
        expect(after.diffs).toHaveLength(0);
    });

    it("applies all incoming chapters across coverage", async () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "alpha",
            bookCode: "GEN",
            chapterNum: 1,
        });
        const source = [
            ...makeFiles({
                loadedText: "gamma",
                currentText: "gamma",
                bookCode: "GEN",
                chapterNum: 1,
            }),
            ...makeFiles({
                loadedText: "delta",
                currentText: "delta",
                bookCode: "EXO",
                chapterNum: 2,
            }),
        ];

        applyIncomingChapterAll({
            workingFiles: current,
            sourceFiles: source,
        });

        const after = await buildCompareResult({
            currentFiles: current,
            config: config("currentDirty"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
            usfmOnionService,
        });
        expect(after.diffs).toHaveLength(0);
    });
});
