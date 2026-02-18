import type { HistoryChapterRef } from "@/app/domain/history/HistoryManager.ts";

type NotificationTargetArgs = {
    currentChapter: HistoryChapterRef;
    touchedChapters: HistoryChapterRef[];
};

export type UndoRedoNotificationTarget =
    | { kind: "none" }
    | { kind: "single-remote"; chapter: HistoryChapterRef }
    | { kind: "multiple"; count: number };

function chapterKey(chapter: HistoryChapterRef) {
    return `${chapter.bookCode}:${chapter.chapterNum}`;
}

export function getUndoRedoNotificationTarget({
    currentChapter,
    touchedChapters,
}: NotificationTargetArgs): UndoRedoNotificationTarget {
    const deduped = Array.from(
        new Map(
            touchedChapters.map((chapter) => [chapterKey(chapter), chapter]),
        ).values(),
    );
    if (deduped.length === 0) return { kind: "none" };
    if (deduped.length > 1) {
        return { kind: "multiple", count: deduped.length };
    }
    const [singleChapter] = deduped;
    if (!singleChapter) return { kind: "none" };
    if (chapterKey(singleChapter) === chapterKey(currentChapter)) {
        return { kind: "none" };
    }
    return {
        kind: "single-remote",
        chapter: singleChapter,
    };
}
