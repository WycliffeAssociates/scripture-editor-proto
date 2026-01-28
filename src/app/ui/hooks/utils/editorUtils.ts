import {
    CLEAR_HISTORY_COMMAND,
    type LexicalEditor,
    type SerializedEditorState,
} from "lexical";
import { EDITOR_TAGS_USED, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { isSerializedUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { isSerializedParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { walkNodes } from "@/app/domain/editor/utils/serializedTraversal.ts";
import type { LintableToken } from "@/core/data/usfm/lint.ts";

export type LintableTokenLike = LintableToken & {
    lexicalKey?: string;
};

export function getFlattenedEditorStateAsParseTokens(
    serializedEditorState: SerializedEditorState,
): Array<LintableTokenLike> {
    const root = serializedEditorState.root;
    const firstChild = root.children?.[0];
    if (!isSerializedParagraphNode(firstChild)) return [];

    const tokens: Array<LintableTokenLike> = [];
    let _lastSid = "";

    for (const node of walkNodes(firstChild.children ?? [])) {
        if (node.type === "linebreak") {
            tokens.push({
                tokenType: UsfmTokenTypes.verticalWhitespace,
                text: "\n",
                id: "",
                sid: _lastSid,
            });
            continue;
        }
        if (isSerializedUSFMTextNode(node)) {
            tokens.push(node);
            if (node.sid) _lastSid = node.sid;
            continue;
        }

        if (isSerializedUSFMNestedEditorNode(node)) {
            const sid = (node as unknown as { sid?: string }).sid;
            if (sid) _lastSid = sid;
            tokens.push(node as unknown as LintableTokenLike);
        }
    }

    return tokens;
}

export function getFlattenedFileTokens(
    pickedFile: ParsedFile | null,
    currentEditorState: SerializedEditorState,
    currentChapter: number,
): Array<LintableTokenLike> {
    if (!pickedFile) return [];

    const tokens: Array<LintableTokenLike> = [];

    for (const chapter of pickedFile.chapters) {
        const serializedState =
            chapter.chapNumber === currentChapter
                ? currentEditorState
                : chapter.lexicalState;

        const flattened = getFlattenedEditorStateAsParseTokens(serializedState);
        if (flattened?.length) {
            tokens.push(...flattened);
        }
    }

    return tokens;
}

export function setEditorContent(
    editor: LexicalEditor,
    fileBibleIdentifier: string,
    chapter: number,
    chapterContent: ParsedChapter | undefined,
    mutWorkingFilesRef: ParsedFile[],
) {
    if (!editor) {
        console.error(
            "setEditorContent called before editor was ready",
            fileBibleIdentifier,
            chapter,
        );
        return;
    }

    const targetFile = chapterContent
        ? null
        : mutWorkingFilesRef.find((f) => f.bookCode === fileBibleIdentifier);
    const chapterState =
        chapterContent ||
        targetFile?.chapters.find((c) => c.chapNumber === chapter);
    if (!chapterState) return;

    editor.update(
        () => {
            editor.setEditorState(
                editor.parseEditorState(chapterState.lexicalState),
            );
        },
        {
            tag: [
                EDITOR_TAGS_USED.historyMerge,
                EDITOR_TAGS_USED.programaticIgnore,
            ],
        },
    );
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
}
