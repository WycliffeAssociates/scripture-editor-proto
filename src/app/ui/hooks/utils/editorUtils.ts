import type { LexicalEditor, SerializedEditorState } from "lexical";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { lexicalToTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Utilities for moving between the visible Lexical editor instance and the
 * scripture workspace noun held in React state.
 */
function collectChapterTokens(
    bookCode: string,
    serializedEditorState: SerializedEditorState,
    options?: { structuralParagraphBreaks?: boolean },
): Token[] {
    return lexicalToTokens(serializedEditorState, {
        ...options,
        bookCode,
    });
}

export function collectFileTokens(
    file: ScriptureBookState | null,
    options?: { structuralParagraphBreaks?: boolean },
): Token[] {
    if (!file) return [];

    const tokens: Token[] = [];
    for (const chapter of file.chapters) {
        const flattened = collectChapterTokens(
            file.bookCode,
            chapter.lexicalState,
            options,
        );
        if (flattened?.length) {
            tokens.push(...flattened);
        }
    }

    return tokens;
}

export function collectWorkingFileTokens(args: {
    files: ScriptureBookState[];
    options?: { structuralParagraphBreaks?: boolean };
}): Array<{ file: ScriptureBookState; tokens: Token[] }> {
    return args.files.map((file) => ({
        file,
        tokens: collectFileTokens(file, args.options),
    }));
}

/**
 * Push one chapter's current lexical state into the mounted editor instance. This
 * is the final handoff point after navigation, undo/redo, compare apply, or other
 * workspace-level mutations decide what chapter should be visible.
 */
export function setEditorContent(
    editor: LexicalEditor,
    fileBibleIdentifier: string,
    chapter: number,
    chapterContent: ScriptureChapterState | undefined,
    mutWorkingFilesRef: ScriptureBookState[],
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
        targetFile?.chapters.find((c) => c.chapterNumber === chapter);
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
