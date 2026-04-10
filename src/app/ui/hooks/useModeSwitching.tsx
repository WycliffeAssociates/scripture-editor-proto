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

type VisibleEditorTarget = {
    bookCode: string;
    chapterNumber: number;
    editorMode: EditorModeSetting;
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
    const appliedVisibleTargetRef = useRef<VisibleEditorTarget | null>(null);
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
     * Resolve the exact chapter state the main editor should be showing.
     */
    function getVisibleChapterState() {
        return mutWorkingFilesRef
            .find((f) => f.bookCode === currentFileBibleIdentifier)
            ?.chapters.find((c) => c.chapterNumber === currentChapter);
    }

    function getVisibleEditorTarget(): VisibleEditorTarget | null {
        const currentChapterData = getVisibleChapterState();
        if (!currentChapterData) return null;

        return {
            bookCode: currentFileBibleIdentifier,
            chapterNumber: currentChapter,
            editorMode: resolvedEditorMode,
        };
    }

    /**
     * Keep the mounted Lexical editor synchronized to the resolved visible
     * chapter target. This is intentionally idempotent so repeated React effect
     * runs cannot cause incorrect double-initialization behavior.
     */
    function syncEditorToVisibleChapter(editor: LexicalEditor) {
        const currentChapterData = getVisibleChapterState();
        const nextTarget = getVisibleEditorTarget();

        const appliedTarget = appliedVisibleTargetRef.current;
        const alreadyApplied =
            appliedTarget &&
            nextTarget &&
            appliedTarget.bookCode === nextTarget.bookCode &&
            appliedTarget.chapterNumber === nextTarget.chapterNumber &&
            appliedTarget.editorMode === nextTarget.editorMode &&
            appliedTarget.lexicalState === nextTarget.lexicalState;

        if (!nextTarget) return;

        if (!alreadyApplied && currentChapterData) {
            setEditorContent(
                nextTarget.bookCode,
                nextTarget.chapterNumber,
                currentChapterData,
                editor,
            );
            appliedVisibleTargetRef.current = nextTarget;
        }

        updateDomForEditorMode({ editorMode: resolvedEditorMode });
    }

    /**
     * A live editor instance exists before its chapter content is guaranteed to
     * be applied. Only allow "save current editor back into workspace state"
     * after the exact visible book/chapter/mode target has been synchronized.
     */
    function canPersistVisibleEditorState(): boolean {
        const appliedTarget = appliedVisibleTargetRef.current;
        const visibleTarget = getVisibleEditorTarget();
        if (!appliedTarget || !visibleTarget) return false;

        return (
            appliedTarget.bookCode === visibleTarget.bookCode &&
            appliedTarget.chapterNumber === visibleTarget.chapterNumber &&
            appliedTarget.editorMode === visibleTarget.editorMode
        );
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
        appliedVisibleTargetRef.current = null;
        updateDomForEditorMode({ editorMode: next });
    }

    return {
        setEditorMode,
        syncEditorToVisibleChapter,
        canPersistVisibleEditorState,
    };
}
