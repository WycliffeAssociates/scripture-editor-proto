import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import {
    diffTokensToEditorState,
    inferContentEditorModeFromRootChildren,
    lexicalEditorStateToDiffTokens,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { applyRevertByBlockId } from "@/core/domain/usfm/sidBlockRevert.ts";

export function isChapterDirtyUsfm(chapter: ParsedChapter): boolean {
    return (
        serializeToUsfmString(chapter.lexicalState.root.children) !==
        serializeToUsfmString(chapter.loadedLexicalState.root.children)
    );
}

export function revertChapterToLoadedState(chapter: ParsedChapter) {
    const currentMode = inferContentEditorModeFromRootChildren(
        chapter.lexicalState.root.children as SerializedLexicalNode[],
    );
    chapter.lexicalState = diffTokensToEditorState({
        tokens: lexicalEditorStateToDiffTokens(chapter.loadedLexicalState),
        direction:
            (chapter.lexicalState.root.direction ?? "ltr") === "rtl"
                ? "rtl"
                : "ltr",
        targetMode: currentMode,
    });
    chapter.dirty = false;
}

export function revertAllChaptersToLoadedState(files: ParsedFile[]) {
    for (const file of files) {
        for (const chapter of file.chapters) {
            revertChapterToLoadedState(chapter);
        }
    }
}

export function revertChapterDiffByBlockId(args: {
    chapter: ParsedChapter;
    diffBlockId: string;
}) {
    const baselineTokens = lexicalEditorStateToDiffTokens(
        args.chapter.loadedLexicalState,
    );
    const currentTokens = lexicalEditorStateToDiffTokens(
        args.chapter.lexicalState,
    );

    const nextTokens = applyRevertByBlockId({
        diffBlockId: args.diffBlockId,
        baselineTokens,
        currentTokens,
    });

    const direction =
        (args.chapter.lexicalState.root.direction ?? "ltr") === "rtl"
            ? "rtl"
            : "ltr";
    const currentMode = inferContentEditorModeFromRootChildren(
        args.chapter.lexicalState.root.children as SerializedLexicalNode[],
    );

    args.chapter.lexicalState = diffTokensToEditorState({
        tokens: nextTokens,
        direction,
        targetMode: currentMode,
    });
    args.chapter.dirty = isChapterDirtyUsfm(args.chapter);
}

export function buildBooksSavePayload(
    files: ParsedFile[],
): Record<string, string> {
    const toSave: Record<string, string> = {};
    for (const file of files) {
        const shouldSaveBook = file.chapters.some((chapter) => chapter.dirty);
        if (!shouldSaveBook) continue;

        const orderedChapters = [...file.chapters].sort(
            (a, b) => a.chapNumber - b.chapNumber,
        );

        toSave[file.bookCode] = orderedChapters
            .map((chapter) =>
                serializeToUsfmString(chapter.lexicalState.root.children),
            )
            .join("");
    }
    return toSave;
}

export function markFilesAsSaved(files: ParsedFile[]) {
    for (const file of files) {
        for (const chapter of file.chapters) {
            chapter.loadedLexicalState = structuredClone(chapter.lexicalState);
            chapter.dirty = false;
        }
    }
}
