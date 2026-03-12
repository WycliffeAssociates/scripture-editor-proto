import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import { describe, expect, it } from "vitest";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { createSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { applyVersionSnapshotToWorkingFiles } from "@/app/domain/project/versionNavigationService.ts";
import type { FlatToken } from "@/core/domain/usfm/usfmOnionTypes.ts";
import { serializeToUsfmString } from "@/test/helpers/serializeToUsfmString.ts";

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
                        `${bookCode}-loaded`,
                    ),
                    lexicalState: makeEditorState(
                        args.currentText,
                        `${bookCode} ${chapterNum}:1`,
                        `${bookCode}-current`,
                    ),
                },
            ],
        },
    ];
}

function chapterUsfm(
    state: SerializedEditorState<SerializedLexicalNode>,
): string {
    return serializeToUsfmString(state.root.children);
}

describe("versionNavigationService.applyVersionSnapshotToWorkingFiles", () => {
    it("re-baselines loaded state to selected snapshot", () => {
        const working = makeFiles({
            loadedText: "latest",
            currentText: "latest",
        });
        const older = makeFiles({
            loadedText: "older",
            currentText: "older",
        });

        applyVersionSnapshotToWorkingFiles({
            workingFiles: working,
            sourceFiles: older,
        });

        const chapter = working[0]?.chapters[0];
        expect(chapterUsfm(chapter.lexicalState)).toContain("older");
        expect(chapterUsfm(chapter.loadedLexicalState)).toContain("older");
        expect(chapter.dirty).toBe(false);
    });

    it("stays clean across repeated version hops", () => {
        const working = makeFiles({
            loadedText: "latest",
            currentText: "latest",
        });
        const olderOne = makeFiles({
            loadedText: "older-1",
            currentText: "older-1",
        });
        const olderTwo = makeFiles({
            loadedText: "older-2",
            currentText: "older-2",
        });

        applyVersionSnapshotToWorkingFiles({
            workingFiles: working,
            sourceFiles: olderOne,
        });
        applyVersionSnapshotToWorkingFiles({
            workingFiles: working,
            sourceFiles: olderTwo,
        });

        const chapter = working[0]?.chapters[0];
        expect(chapterUsfm(chapter.lexicalState)).toContain("older-2");
        expect(chapterUsfm(chapter.loadedLexicalState)).toContain("older-2");
        expect(chapter.dirty).toBe(false);
    });
});
