import type { SerializedLexicalNode } from "lexical";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
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
    for (const { chapter } of walkChapters(files)) {
        revertChapterToLoadedState(chapter);
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
    const entriesToSave = walkChapters(files);
    for (const { file, chapter } of entriesToSave) {
        if (!chapter.dirty) continue;
        if (!toSave[file.bookCode]) toSave[file.bookCode] = "";
        toSave[file.bookCode] += serializeToUsfmString(
            chapter.lexicalState.root.children,
        );
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
