// historyChapterRefs.ts
//
// Pure chapter-ref helpers for the undo/redo history layer. Kept out of the
// hook so they stay testable without a mounted editor.

import type { HistoryChapterRef } from "@/app/domain/history/HistoryManager.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";

export type HistoryChapterRecord = {
    file: ScriptureBookState;
    chapter: ScriptureChapterState;
};

export function chapterKey(chapter: HistoryChapterRef) {
    return `${chapter.bookCode}:${chapter.chapterNum}`;
}

export function dedupeChapterRefs(candidates: HistoryChapterRef[]) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
        const key = chapterKey(candidate);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function findChapterRecordIn(
    files: ScriptureBookState[],
    chapterRef: HistoryChapterRef,
): HistoryChapterRecord | null {
    const file = files.find(
        (candidate) => candidate.bookCode === chapterRef.bookCode,
    );
    if (!file) return null;
    const chapter = file.chapters.find(
        (candidate) => candidate.chapterNumber === chapterRef.chapterNum,
    );
    if (!chapter) return null;
    return { file, chapter };
}
