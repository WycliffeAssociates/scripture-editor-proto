import type { LexicalEditor } from "lexical";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings, SettingsManager } from "@/app/data/settings.ts";

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;

export const useWorkspaceState = (
    settingsManager: SettingsManager,
    allFiles: ParsedFile[],
) => {
    // for accessing editor and it's state in various places
    const editorRef = useRef<LexicalEditor | null>(null);

    function getSavedIfPrefersRestore<K extends keyof Settings>(
        key: K,
    ): Settings[K] | undefined {
        if (!settingsManager.get("restoreToLastProjectOnLaunch")) {
            return undefined;
        }
        return settingsManager.get(key) as Settings[K] | undefined;
    }
    const [appSettings, setAppSettings] = useState<Settings>(
        settingsManager.getSettings(),
    );
    const [currentFileBibleIdentifier, setCurrentFileBibleIdentifier] =
        useState(
            getSavedIfPrefersRestore("lastBookIdentifier") ||
                allFiles[0].bookCode,
        );
    const [currentChapter, setCurrentChapter] = useState(
        getSavedIfPrefersRestore("lastChapterNumber") || 1,
    );
    const [referenceProjectPath, setReferenceProjectPath] = useState<
        string | null
    >(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const updateAppSettings = useCallback(
        (newSettings: Partial<Settings>) => {
            setAppSettings({ ...appSettings, ...newSettings });
            settingsManager.update(newSettings);
            // will adjust root font size, webview zoom, etc; at needed
            settingsManager.applySettings();
        },
        [appSettings, settingsManager],
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
            (c) => c.chapNumber === currentChapter,
        );

        if (!candidate && pickedFile?.chapters.length > 0) {
            const sortedChaps = [...pickedFile.chapters].sort(
                (a, b) => a.chapNumber - b.chapNumber,
            );
            const lastChap = sortedChaps[sortedChaps.length - 1];
            const firstChap = sortedChaps[0];

            if (currentChapter > lastChap.chapNumber) {
                setCurrentChapter(lastChap.chapNumber);
                candidate = lastChap;
                updateAppSettings({
                    lastChapterNumber: lastChap.chapNumber,
                });
            } else {
                setCurrentChapter(firstChap.chapNumber);
                candidate = firstChap;
                updateAppSettings({ lastChapterNumber: firstChap.chapNumber });
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
    };
};
