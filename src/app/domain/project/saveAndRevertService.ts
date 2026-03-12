import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import {
    inferContentEditorModeFromRootChildren,
    onionFlatTokensToEditorState,
    onionFlatTokensToLoadedEditorState,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

export function isChapterDirtyUsfm(chapter: ParsedChapter): boolean {
    return (
        chapter.currentTokens.map((token) => token.text).join("") !==
        chapter.sourceTokens.map((token) => token.text).join("")
    );
}

export function revertChapterToLoadedState(chapter: ParsedChapter) {
    const currentMode = inferContentEditorModeFromRootChildren(
        chapter.lexicalState.root.children as SerializedLexicalNode[],
    );
    chapter.lexicalState = onionFlatTokensToEditorState({
        tokens: chapter.sourceTokens,
        direction:
            (chapter.lexicalState.root.direction ?? "ltr") === "rtl"
                ? "rtl"
                : "ltr",
        targetMode: currentMode,
    });
    chapter.currentTokens = structuredClone(chapter.sourceTokens);
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
    const baselineTokens = args.chapter.sourceTokens;
    const currentTokens = args.chapter.currentTokens;

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
    args.chapter.currentTokens = nextTokens;
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
                chapter.currentTokens.map((token) => token.text).join(""),
            )
            .join("");
    }
    return toSave;
}

export function markFilesAsSaved(files: ParsedFile[]) {
    for (const file of files) {
        for (const chapter of file.chapters) {
            const direction =
                (chapter.loadedLexicalState.root.direction ??
                    chapter.lexicalState.root.direction ??
                    "ltr") === "rtl"
                    ? "rtl"
                    : "ltr";
            chapter.sourceTokens = structuredClone(chapter.currentTokens);
            chapter.loadedLexicalState = onionFlatTokensToLoadedEditorState({
                tokens: chapter.sourceTokens,
                direction,
            });
            chapter.dirty = false;
        }
    }
}
