import type { LexicalEditor, SerializedEditorState } from "lexical";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function collectChapterTokens(
    serializedEditorState: SerializedEditorState,
    options?: { structuralParagraphBreaks?: boolean },
): Token[] {
    return lexicalToTokens(serializedEditorState, options);
}

export function collectFileTokens(
    file: ParsedFile | null,
    options?: { structuralParagraphBreaks?: boolean },
): Token[] {
    if (!file) return [];

    const tokens: Token[] = [];
    for (const chapter of file.chapters) {
        const flattened = collectChapterTokens(chapter.lexicalState, options);
        if (flattened?.length) {
            tokens.push(...flattened);
        }
    }

    return tokens;
}

export function collectWorkingFileTokens(args: {
    files: ParsedFile[];
    options?: { structuralParagraphBreaks?: boolean };
}): Array<{ file: ParsedFile; tokens: Token[] }> {
    return args.files.map((file) => ({
        file,
        tokens: collectFileTokens(file, args.options),
    }));
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
