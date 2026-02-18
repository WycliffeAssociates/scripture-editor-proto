import type { LexicalEditor, SerializedEditorState } from "lexical";
import { EDITOR_TAGS_USED, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensFromSerialized } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";
import type { LintableToken } from "@/core/data/usfm/lint.ts";

export type LintableTokenLike = LintableToken & {
    lexicalKey?: string;
};

export function getFlattenedEditorStateAsParseTokens(
    serializedEditorState: SerializedEditorState,
): Array<LintableTokenLike> {
    const tokens: Array<LintableTokenLike> = [];
    let lastSid = "";
    let linebreakId = 0;

    const rootChildren = serializedEditorState.root.children ?? [];
    for (const node of materializeFlatTokensFromSerialized(rootChildren, {
        nested: "flatten",
    })) {
        if (node.type === "linebreak") {
            tokens.push({
                tokenType: UsfmTokenTypes.verticalWhitespace,
                text: "\n",
                id: `linebreak-${linebreakId++}`,
                sid: lastSid,
            });
            continue;
        }

        if (isSerializedUSFMTextNode(node)) {
            tokens.push(node);
            if (node.sid) lastSid = node.sid;
        }

        // Nested editors are flattened by the adapter.
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
    selectionOverride?: unknown,
    editorStateOverride?: SerializedEditorState,
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

    // Avoid wrapping setEditorState in editor.update(). Lexical treats setEditorState
    // as its own kind of update, and nesting it can interfere with history behavior.
    const baseEditorState = editorStateOverride ?? chapterState.lexicalState;
    const nextEditorState =
        selectionOverride === undefined
            ? baseEditorState
            : ({
                  ...baseEditorState,
                  selection: selectionOverride,
              } as SerializedEditorState);

    editor.setEditorState(editor.parseEditorState(nextEditorState), {
        tag: EDITOR_TAGS_USED.programaticIgnore,
    });
    if (selectionOverride !== undefined) {
        editor.focus();
    }

    // We intentionally load with `programaticIgnore` to avoid expensive maintenance work
    // running during hydration, then immediately trigger one tagged update so
    // listeners can compute derived metadata (e.g. structural-empty marker lines).
    editor.update(
        () => {
            // no-op
        },
        { tag: EDITOR_TAGS_USED.programmaticDoRunChanges },
    );
}
