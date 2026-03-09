import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import {
    inferContentEditorModeFromRootChildren,
    lexicalEditorStateToOnionFlatTokens,
    lexicalEditorStateToOnionUsfmString,
    onionFlatTokensToEditorState,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

export function isChapterDirtyUsfm(chapter: ParsedChapter): boolean {
    return (
        lexicalEditorStateToOnionUsfmString(chapter.lexicalState) !==
        lexicalEditorStateToOnionUsfmString(chapter.loadedLexicalState)
    );
}

export function revertChapterToLoadedState(chapter: ParsedChapter) {
    const currentMode = inferContentEditorModeFromRootChildren(
        chapter.lexicalState.root.children as SerializedLexicalNode[],
    );
    chapter.lexicalState = onionFlatTokensToEditorState({
        tokens: lexicalEditorStateToOnionFlatTokens(chapter.loadedLexicalState),
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

export async function revertChapterDiffByBlockId(args: {
    chapter: ParsedChapter;
    diffBlockId: string;
    usfmOnionService: IUsfmOnionService;
}) {
    const baselineTokens = lexicalEditorStateToOnionFlatTokens(
        args.chapter.loadedLexicalState,
    );
    const currentTokens = lexicalEditorStateToOnionFlatTokens(
        args.chapter.lexicalState,
    );

    const nextTokens = await args.usfmOnionService.revertDiffBlock(
        baselineTokens,
        currentTokens,
        args.diffBlockId,
    );

    const direction =
        (args.chapter.lexicalState.root.direction ?? "ltr") === "rtl"
            ? "rtl"
            : "ltr";
    const currentMode = inferContentEditorModeFromRootChildren(
        args.chapter.lexicalState.root.children as SerializedLexicalNode[],
    );

    args.chapter.lexicalState = onionFlatTokensToEditorState({
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
                lexicalEditorStateToOnionUsfmString(chapter.lexicalState),
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
