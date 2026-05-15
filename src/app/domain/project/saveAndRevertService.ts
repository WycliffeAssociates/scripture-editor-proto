import type { SerializedLexicalNode } from "lexical";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import {
    inferContentEditorModeFromRootChildren,
    tokensToLexical,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { BookRef } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Save/revert operations work on the scripture workspace noun after editing has
 * already happened. This module is the boundary where dirty chapter state is
 * compared against its loaded baseline and converted back into save payloads or
 * reverted lexical state.
 */
export function isChapterDirtyUsfm(chapter: ScriptureChapterState): boolean {
    // TODO(usfm-onion): this token-based dirty check is pure USFM logic and is a
    // candidate to move behind the crate boundary in a later pass.
    return (
        chapter.currentTokens.map((token) => token.source).join("") !==
        chapter.sourceTokens.map((token) => token.source).join("")
    );
}

export function revertChapterToLoadedState(chapter: ScriptureChapterState) {
    const currentMode = inferContentEditorModeFromRootChildren(
        chapter.lexicalState.root.children as SerializedLexicalNode[],
    );
    chapter.lexicalState = tokensToLexical({
        tokens: chapter.sourceTokens,
        direction:
            (chapter.lexicalState.root.direction ?? "ltr") === "rtl"
                ? "rtl"
                : "ltr",
        mode: currentMode === EDITOR_MODES.regular ? "regular" : "flat",
    });
    chapter.currentTokens = structuredClone(chapter.sourceTokens);
    chapter.dirty = false;
}

export function revertAllChaptersToLoadedState(files: ScriptureBookState[]) {
    for (const file of files) {
        for (const chapter of file.chapters) {
            revertChapterToLoadedState(chapter);
        }
    }
}

export async function revertChapterDiffByBlockId(args: {
    chapter: ScriptureChapterState;
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

    args.chapter.lexicalState = tokensToLexical({
        tokens: nextTokens,
        direction,
        mode: currentMode === EDITOR_MODES.regular ? "regular" : "flat",
    });
    args.chapter.currentTokens = nextTokens;
    args.chapter.dirty = isChapterDirtyUsfm(args.chapter);
}

export function buildBooksSavePayload(
    files: ScriptureBookState[],
): Record<string, string> {
    // TODO(usfm-onion): token-to-USFM serialization here is another future
    // crate candidate once the app/UI orchestration is fully separated.
    const toSave: Record<string, string> = {};
    for (const file of files) {
        const shouldSaveBook = file.chapters.some((chapter) => chapter.dirty);
        if (!shouldSaveBook) continue;

        const orderedChapters = [...file.chapters].sort(
            (a, b) => a.chapterNumber - b.chapterNumber,
        );

        toSave[file.bookCode] = orderedChapters
            .map((chapter) =>
                chapter.currentTokens.map((token) => token.source).join(""),
            )
            .join("");
    }
    return toSave;
}

const BOOK_PERSISTENCE_ACTION_VALUES = ["saveExisting", "addNew"] as const;

export const [
    BOOK_PERSISTENCE_ACTION_SAVE_EXISTING,
    BOOK_PERSISTENCE_ACTION_ADD_NEW,
] = BOOK_PERSISTENCE_ACTION_VALUES;

export type BookPersistenceAction =
    | {
          kind: typeof BOOK_PERSISTENCE_ACTION_SAVE_EXISTING;
          bookCode: string;
          storageKey: string;
          contents: string;
      }
    | {
          kind: typeof BOOK_PERSISTENCE_ACTION_ADD_NEW;
          bookCode: string;
          contents: string;
      };

export function buildBookPersistencePlan(args: {
    existingBooks: Pick<BookRef, "bookCode" | "storageKey">[];
    payload: Record<string, string>;
}): BookPersistenceAction[] {
    const existingByBookCode = new Map(
        args.existingBooks.map((book) => [book.bookCode, book.storageKey]),
    );

    return Object.entries(args.payload).map(([bookCode, contents]) => {
        const storageKey = existingByBookCode.get(bookCode);
        if (storageKey) {
            return {
                kind: BOOK_PERSISTENCE_ACTION_SAVE_EXISTING,
                bookCode,
                storageKey,
                contents,
            };
        }

        return {
            kind: BOOK_PERSISTENCE_ACTION_ADD_NEW,
            bookCode,
            contents,
        };
    });
}

export function markFilesAsSaved(files: ScriptureBookState[]) {
    for (const file of files) {
        for (const chapter of file.chapters) {
            const direction =
                (chapter.loadedLexicalState.root.direction ??
                    chapter.lexicalState.root.direction ??
                    LanguageDirection.LTR) === LanguageDirection.RTL
                    ? LanguageDirection.RTL
                    : LanguageDirection.LTR;
            chapter.sourceTokens = structuredClone(chapter.currentTokens);
            chapter.loadedLexicalState = tokensToLexical({
                tokens: chapter.sourceTokens,
                direction,
                mode: "flat",
            });
            chapter.dirty = false;
        }
    }
}
