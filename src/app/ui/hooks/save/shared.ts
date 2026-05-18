import type { LexicalEditor } from "lexical";
import type { RefObject } from "react";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import type { CompareMetadataSummary } from "@/app/domain/project/compare/compareService.ts";
import type { DiffsByChapter } from "@/app/domain/project/diffTypes.ts";
import { revertAllChaptersToLoadedState } from "@/app/domain/project/saveAndRevertService.ts";
import { findChapter } from "@/app/domain/project/workingFileMutations.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * Shared helpers used by save/revert/version/compare hooks.
 *
 * These utilities sit above the core project services and below the UI-facing
 * hooks. Their job is to keep the scripture workspace state, diff state, and
 * live editor selection in sync after save-like mutations.
 */
export type ChapterRef = { bookCode: string; chapterNum: number };

export function selectScriptureBookStatesForChapterRefs(
    files: ScriptureBookState[],
    chapters: ChapterRef[],
): ScriptureBookState[] {
    const wantedByBook = new Map<string, Set<number>>();
    for (const chapter of chapters) {
        const wanted = wantedByBook.get(chapter.bookCode) ?? new Set<number>();
        wanted.add(chapter.chapterNum);
        wantedByBook.set(chapter.bookCode, wanted);
    }

    return files
        .map((file) => {
            const wanted = wantedByBook.get(file.bookCode);
            if (!wanted) return null;

            const matchingChapters = file.chapters.filter((chapter) =>
                wanted.has(chapter.chapterNumber),
            );
            if (matchingChapters.length === 0) return null;

            return {
                ...file,
                chapters: matchingChapters,
            };
        })
        .filter((file): file is ScriptureBookState => Boolean(file));
}

export function syncEditorToChapter(args: {
    editorRef: RefObject<LexicalEditor | null>;
    workingFiles: ScriptureBookState[];
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
    bookCode: string;
    chapterNum: number;
}) {
    // Only push state into Lexical when the mutation touched the chapter the
    // user is currently looking at; off-screen chapters can stay in workspace
    // memory until navigated to.
    if (
        args.bookCode !== args.pickedFile?.bookCode ||
        args.chapterNum !== args.pickedChapter?.chapterNumber ||
        !args.editorRef.current
    ) {
        return;
    }

    const changedChapter = findChapter(
        args.workingFiles,
        args.bookCode,
        args.chapterNum,
    );
    if (!changedChapter) return;

    args.editorRef.current.setEditorState(
        args.editorRef.current.parseEditorState(changedChapter.lexicalState),
        {
            tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
        },
    );
}

export function syncEditorToPickedChapter(args: {
    editorRef: RefObject<LexicalEditor | null>;
    workingFiles: ScriptureBookState[];
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
}) {
    if (!args.pickedFile || !args.pickedChapter || !args.editorRef.current) {
        return;
    }

    const changedChapter = findChapter(
        args.workingFiles,
        args.pickedFile.bookCode,
        args.pickedChapter.chapterNumber,
    );
    if (!changedChapter) return;

    args.editorRef.current.setEditorState(
        args.editorRef.current.parseEditorState(changedChapter.lexicalState),
        {
            tag: EDITOR_TAGS_USED.programmaticDoRunChanges,
        },
    );
}

/**
 * Notify the workspace after mutating the in-memory scripture nouns.
 *
 * The compare/save flows intentionally mutate the shared working files in place
 * so expensive editor state can stay stable. React still needs an explicit
 * invalidation signal for derived workspace state to catch up.
 */
export async function invalidateWorkingScriptureChanges(args: {
    chapters: ChapterRef[];
    bumpDirtyVersion: () => void;
    refreshUnsavedChapters?: (chapters: ChapterRef[]) => Promise<void>;
    editorRef: RefObject<LexicalEditor | null>;
    workingFiles: ScriptureBookState[];
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
}) {
    if (args.refreshUnsavedChapters && args.chapters.length > 0) {
        await args.refreshUnsavedChapters(args.chapters);
    } else {
        args.bumpDirtyVersion();
    }

    for (const { bookCode, chapterNum } of args.chapters) {
        syncEditorToChapter({
            editorRef: args.editorRef,
            workingFiles: args.workingFiles,
            pickedFile: args.pickedFile,
            pickedChapter: args.pickedChapter,
            bookCode,
            chapterNum,
        });
    }
}

/**
 * Metadata the compare UI uses to label the current loaded scripture workspace.
 */
export function buildCurrentProjectCompareMetadata(
    loadedProject: Project,
): CompareMetadataSummary {
    return {
        projectId: loadedProject.projectId ?? loadedProject.folderName,
        languageId: loadedProject.language.code,
        languageDirection: loadedProject.language.direction,
    };
}

/**
 * Revert the in-memory workspace and the visible editor back to the loaded
 * scripture snapshot, clearing any unsaved diff UI at the same time.
 */
export function revertAllChanges(args: {
    workingFiles: ScriptureBookState[];
    setDiffsByChapter: (next: DiffsByChapter) => void;
    bumpDirtyVersion: () => void;
    pickedFile: ScriptureBookState | null;
    pickedChapter: ScriptureChapterState | null;
    editorRef: RefObject<LexicalEditor | null>;
}) {
    revertAllChaptersToLoadedState(args.workingFiles);
    args.setDiffsByChapter({});
    args.bumpDirtyVersion();
    syncEditorToPickedChapter({
        editorRef: args.editorRef,
        workingFiles: args.workingFiles,
        pickedFile: args.pickedFile,
        pickedChapter: args.pickedChapter,
    });
}
