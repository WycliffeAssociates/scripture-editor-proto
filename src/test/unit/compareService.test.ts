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

describe("compareService.buildCompareResult", () => {
    it("uses current-saved baseline when selected", () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "beta",
        });
        const source = makeFiles({
            loadedText: "gamma",
            currentText: "gamma",
        });

        const result = buildCompareResult({
            currentFiles: current,
            config: config("currentSaved"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
        });

        expect(result.diffs).toHaveLength(1);
        expect(result.diffs[0]?.originalDisplayText).toContain("alpha");
        expect(result.diffs[0]?.currentDisplayText).toContain("gamma");
        expect(result.diffs[0]?.originalRenderTokens?.length).toBeGreaterThan(
            0,
        );
        expect(result.diffs[0]?.currentRenderTokens?.length).toBeGreaterThan(0);
    });

    it("uses current-dirty baseline when selected", () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "beta",
        });
        const source = makeFiles({
            loadedText: "gamma",
            currentText: "gamma",
        });

        const result = buildCompareResult({
            currentFiles: current,
            config: config("currentDirty"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
        });

        expect(result.diffs).toHaveLength(1);
        expect(result.diffs[0]?.originalDisplayText).toContain("beta");
        expect(result.diffs[0]?.currentDisplayText).toContain("gamma");
    });

    it("reports book/chapter coverage differences", () => {
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

        const result = buildCompareResult({
            currentFiles: current,
            config: config("currentSaved"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
        });

        expect(result.warnings.map((w) => w.code)).toContain(
            "book_coverage_diff",
        );
    });

    it("emits compatibility warnings for language/direction/project id mismatch", () => {
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

        const result = buildCompareResult({
            currentFiles: current,
            config: config("currentSaved"),
            sourceFiles: source,
            currentMetadata: currentMeta,
            sourceMetadata: sourceMeta,
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
    it("applies an incoming hunk to the working chapter", () => {
        const current = makeFiles({
            loadedText: "alpha",
            currentText: "alpha",
        });
        const source = makeFiles({
            loadedText: "gamma",
            currentText: "gamma",
        });
        const result = buildCompareResult({
            currentFiles: current,
            config: config("currentSaved"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
        });

        const diff = result.diffs[0];
        expect(diff).toBeDefined();
        if (!diff) return;

        applyIncomingHunk({
            workingFiles: current,
            sourceFiles: source,
            diff,
            baseline: "currentDirty",
        });

        const after = buildCompareResult({
            currentFiles: current,
            config: config("currentDirty"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
        });
        expect(after.diffs).toHaveLength(0);
    });

    it("applies full incoming chapter and resolves all chapter diffs", () => {
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

        const after = buildCompareResult({
            currentFiles: current,
            config: config("currentDirty"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
        });
        expect(after.diffs).toHaveLength(0);
    });

    it("applies all incoming chapters across coverage", () => {
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

        const after = buildCompareResult({
            currentFiles: current,
            config: config("currentDirty"),
            sourceFiles: source,
            currentMetadata: undefined,
            sourceMetadata: undefined,
        });
        expect(after.diffs).toHaveLength(0);
    });
});
