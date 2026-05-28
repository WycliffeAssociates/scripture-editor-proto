import type { LexicalEditor } from "lexical";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Settings, SettingsManager } from "@/app/data/settings.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { FormatMatchingRunReport } from "@/app/ui/data/formatMatching.ts";
import type { TargetMarkerPreservationMode } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;

/**
 * Central React state holder for the currently open scripture workspace.
 *
 * This hook owns the cross-cutting UI state that is broader than any single
 * editor plugin or panel: current book/chapter, persisted app settings,
 * reference panel selection, long-running processing flags, and format-match
 * UI state.
 */
export const useWorkspaceState = (
    settingsManager: SettingsManager,
    allFiles: ScriptureBookState[],
    queryBookOverride?: string,
    queryChapterOverride?: number,
) => {
    const editorRef = useRef<LexicalEditor | null>(null);

    /**
     * Read a persisted setting only when the user has opted into restore-on-
     * launch behavior.
     */
    function getSavedIfPrefersRestore<K extends keyof Settings>(
        key: K,
    ): Settings[K] | undefined {
        if (!settingsManager.get("restoreToLastProjectOnLaunch")) {
            return undefined;
        }
        return settingsManager.get(key) as Settings[K] | undefined;
    }
    const [appSettings, setAppSettings] = useState<Settings>(() =>
        settingsManager.getSettings(),
    );
    const [currentFileBibleIdentifier, setCurrentFileBibleIdentifier] =
        useState(
            queryBookOverride ||
                getSavedIfPrefersRestore("lastBookIdentifier") ||
                allFiles[0].bookCode,
        );
    const [currentChapter, setCurrentChapter] = useState(
        queryChapterOverride ||
            getSavedIfPrefersRestore("lastChapterNumber") ||
            1,
    );
    const [referenceProjectPath, setReferenceProjectPath] = useState<
        string | null
    >(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [formatMatchReport, setFormatMatchReport] =
        useState<FormatMatchingRunReport | null>(null);
    const [isFormatMatchSuggestionsOpen, setIsFormatMatchSuggestionsOpen] =
        useState(false);
    const [autoOpenFormatMatchSuggestions, setAutoOpenFormatMatchSuggestions] =
        useState(true);
    const [targetMarkerPreservationMode, setTargetMarkerPreservationMode] =
        useState<TargetMarkerPreservationMode>("recommended");

    /**
     * Update React state, persist the changed settings, and apply any immediate
     * platform/UI effects such as zoom or root font updates.
     */
    const updateAppSettings = useCallback(
        (newSettings: Partial<Settings>) => {
            setAppSettings((prev) => ({ ...prev, ...newSettings }));
            settingsManager.update(newSettings);
            // will adjust root font size, webview zoom, etc; at needed
            settingsManager.applySettings();
        },
        [settingsManager],
    );
    const pickedFile = useMemo(
        () =>
            allFiles.find(
                (file) =>
                    file.bookCode.toLowerCase() ===
                    currentFileBibleIdentifier.toLowerCase(),
            ) || allFiles[0],
        [allFiles, currentFileBibleIdentifier],
    );
    const pickedChapter = useMemo(() => {
        let candidate = pickedFile?.chapters.find(
            (c) => c.chapterNumber === currentChapter,
        );

        if (!candidate && pickedFile?.chapters.length > 0) {
            /**
             * If the persisted/query chapter no longer exists for the current
             * book, snap back to the nearest sensible chapter and persist that
             * correction so downstream UI state stays aligned.
             */
            const sortedChaps = pickedFile.chapters.toSorted(
                (a, b) => a.chapterNumber - b.chapterNumber,
            );
            const lastChap = sortedChaps[sortedChaps.length - 1];
            const firstChap = sortedChaps[0];

            if (currentChapter > lastChap.chapterNumber) {
                setCurrentChapter(lastChap.chapterNumber);
                candidate = lastChap;
                updateAppSettings({
                    lastChapterNumber: lastChap.chapterNumber,
                });
            } else {
                setCurrentChapter(firstChap.chapterNumber);
                candidate = firstChap;
                updateAppSettings({
                    lastChapterNumber: firstChap.chapterNumber,
                });
            }
        }
        return candidate;
    }, [pickedFile, currentChapter, updateAppSettings]);

    return {
        editorRef,
        workingFiles: allFiles,
        appSettings,
        updateAppSettings,
        currentFileBibleIdentifier,
        setCurrentFileBibleIdentifier,
        currentChapter,
        setCurrentChapter,
        referenceProjectPath,
        setReferenceProjectPath,
        pickedFile,
        pickedChapter,
        isProcessing,
        setIsProcessing,
        formatMatchReport,
        setFormatMatchReport,
        isFormatMatchSuggestionsOpen,
        setIsFormatMatchSuggestionsOpen,
        autoOpenFormatMatchSuggestions,
        setAutoOpenFormatMatchSuggestions,
        targetMarkerPreservationMode,
        setTargetMarkerPreservationMode,
    };
};
