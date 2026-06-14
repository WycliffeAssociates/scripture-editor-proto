import type { LexicalEditor } from "lexical";
import { useEffect, useRef } from "react";

import { EDITOR_MODES, type EditorModeSetting } from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import type { ScriptureChapterState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

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
  workingFilesStore,
  currentFileBibleIdentifier,
  currentChapter,
  appSettings,
  updateAppSettings,
  setEditorContent,
}: {
  workingFilesStore: WorkingFilesStore;
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
    return workingFilesStore
      .read()
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
      appliedTarget.editorMode === nextTarget.editorMode;

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

    // nothing to re-transform when the mode hasn't actually changed.
    if (next === resolvedEditorMode) {
      return;
    }

    // Mode is a read-time concern now: the store holds mode-independent
    // tokens, so switching rewrites NOTHING there — it flips the setting and
    // lets the visible chapter re-derive its shape. Resetting
    // `appliedVisibleTargetRef` forces `syncEditorToVisibleChapter` (the
    // USFMPlugin effect, re-run when the mode change re-creates `actions`) to
    // re-apply the visible chapter's content in the new mode.
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
