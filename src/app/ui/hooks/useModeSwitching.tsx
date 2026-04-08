import type { LexicalEditor, SerializedLexicalNode } from "lexical";
import { useEffect, useRef } from "react";
import { EDITOR_MODES, type EditorModeSetting } from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import {
    isRegularModeRootChildren,
    transformToMode,
} from "@/app/domain/editor/utils/modeTransforms.ts";
import { walkChapters } from "@/app/domain/editor/utils/serializedTraversal.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import { updateDomForEditorMode } from "./utils/domUtils.ts";

export type SetEditorModeOptions = {
    onComplete?: () => void;
};

/**
 * Coordinate editor-mode transitions for the scripture workspace.
 *
 * Switching modes is more than flipping a setting: the current chapter must be
 * saved, every chapter may need its serialized structure rematerialized, and
 * the mounted editor plus DOM styling need to be updated in sync.
 */
export function useModeSwitching({
    mutWorkingFilesRef,
    currentFileBibleIdentifier,
    currentChapter,
    appSettings,
    updateAppSettings,
    setEditorContent,
    saveCurrentDirtyLexical,
}: {
    mutWorkingFilesRef: ScriptureBookState[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    appSettings: Partial<Settings>;
    updateAppSettings: (newSettings: Partial<Settings>) => void;
    setEditorContent: (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
        editor?: LexicalEditor,
    ) => void;
    saveCurrentDirtyLexical: () => ScriptureBookState[] | undefined;
}) {
    const initializationRef = useRef(false);
    const pendingModeCompleteRef = useRef<{
        mode: EditorModeSetting;
        onComplete: () => void;
    } | null>(null);
    const resolvedEditorMode =
        (appSettings.editorMode as EditorModeSetting) ?? EDITOR_MODES.regular;

    useEffect(() => {
        const pending = pendingModeCompleteRef.current;
        if (!pending) return;
        if (pending.mode !== resolvedEditorMode) return;
        pendingModeCompleteRef.current = null;
        const frame = window.requestAnimationFrame(() => {
            pending.onComplete();
        });
        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [resolvedEditorMode]);

    /**
     * Mount the current chapter into the Lexical editor the first time the
     * editor instance becomes available.
     */
    function initializeEditor(editor: LexicalEditor) {
        if (initializationRef.current) return;
        initializationRef.current = true;

        const currentChapterData = mutWorkingFilesRef
            .find((f) => f.bookCode === currentFileBibleIdentifier)
            ?.chapters.find((c) => c.chapterNumber === currentChapter);

        if (currentChapterData) {
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                currentChapterData,
                editor,
            );
        }

        updateDomForEditorMode({ editorMode: resolvedEditorMode });
    }

    /**
     * Switch editor mode and rematerialize chapter state as needed.
     *
     * This is intentionally explicit and relatively expensive. We only do it
     * when the user asks to change how the scripture workspace is presented,
     * not during ordinary editing.
     */
    function setEditorMode(
        next: EditorModeSetting,
        editor?: LexicalEditor,
        options?: SetEditorModeOptions,
    ) {
        if (options?.onComplete) {
            if (next === resolvedEditorMode) {
                window.requestAnimationFrame(() => {
                    options.onComplete?.();
                });
            } else {
                pendingModeCompleteRef.current = {
                    mode: next,
                    onComplete: options.onComplete,
                };
            }
        } else {
            pendingModeCompleteRef.current = null;
        }

        const inProgress = saveCurrentDirtyLexical();
        const filesToUse = inProgress || mutWorkingFilesRef;
        let thisChapterUpdated: ScriptureChapterState | undefined;

        for (const { file, chapter } of walkChapters(filesToUse)) {
            const rootChildren = chapter.lexicalState.root
                .children as SerializedLexicalNode[];

            const isCurrentlyParagraphMode =
                isRegularModeRootChildren(rootChildren);
            const wantsParagraphMode =
                next === EDITOR_MODES.regular || next === EDITOR_MODES.view;

            if (isCurrentlyParagraphMode === wantsParagraphMode) {
                // Already in correct format, skip transformation
                if (
                    chapter.chapterNumber === currentChapter &&
                    file.bookCode === currentFileBibleIdentifier
                ) {
                    thisChapterUpdated = chapter;
                }
                continue;
            }

            chapter.lexicalState = transformToMode(
                chapter.lexicalState,
                wantsParagraphMode ? EDITOR_MODES.regular : EDITOR_MODES.usfm,
            );

            if (
                chapter.chapterNumber === currentChapter &&
                file.bookCode === currentFileBibleIdentifier
            ) {
                thisChapterUpdated = chapter;
            }
        }

        if (thisChapterUpdated) {
            setEditorContent(
                currentFileBibleIdentifier,
                currentChapter,
                thisChapterUpdated,
                editor,
            );
        }

        updateAppSettings({
            editorMode: next,
        });
        updateDomForEditorMode({ editorMode: next });
    }

    return {
        setEditorMode,
        initializeEditor,
    };
}
