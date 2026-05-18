import { useCallback, useSyncExternalStore } from "react";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import type { SerializedLexicalChapterState } from "./types.ts";

/**
 * Subscribe to the full working-files array. Re-renders on any commit.
 *
 * Most consumers want a narrower hook; reach for `useCurrentChapter` for the
 * per-chapter case. This exists for components that genuinely need the whole
 * project view (search across all chapters, version diff, etc).
 */
export function useWorkingFiles(): ScriptureBookState[] {
    const { workingFilesStore } = useWorkspaceContext();
    return useSyncExternalStore(
        workingFilesStore.subscribe.bind(workingFilesStore),
        workingFilesStore.getSnapshot.bind(workingFilesStore),
    );
}

/**
 * Subscribe to a single chapter's lexical state. Re-renders on every commit,
 * but the returned reference is stable across selection-only commits (selection
 * commits are dropped at the bridge in Stage 1A).
 */
export function useCurrentChapter(
    bookCode: string,
    chapter: number,
): SerializedLexicalChapterState | undefined {
    const { workingFilesStore } = useWorkspaceContext();
    const getSnapshot = useCallback(
        () => workingFilesStore.readChapter(bookCode, chapter),
        [workingFilesStore, bookCode, chapter],
    );
    return useSyncExternalStore(
        workingFilesStore.subscribe.bind(workingFilesStore),
        getSnapshot,
    );
}
