import type { LexicalEditor } from "lexical";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ParsedFile } from "@/app/data/parsedProject";
import type { Settings, SettingsManager } from "@/app/data/settings";

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
        getSavedIfPrefersRestore("lastChapterNumber") || 0,
    );
    const [referenceProjectPath, setReferenceProjectPath] = useState<
        string | null
    >(null);

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
                (file) => file.bookCode === currentFileBibleIdentifier,
            ) || allFiles[0],
        [allFiles, currentFileBibleIdentifier],
    );
    const pickedChapter = useMemo(() => {
        let candidate =
            pickedFile?.chapters[currentChapter ? currentChapter : 0];
        // if currentChapter is greater than the number of chapters in pickedFile, set it to the last chapter else first:
        if (currentChapter > pickedFile?.chapters.length - 1) {
            setCurrentChapter(pickedFile?.chapters.length - 1 || 0);
            candidate = pickedFile?.chapters[pickedFile?.chapters.length - 1];
            updateAppSettings({
                lastChapterNumber: pickedFile?.chapters.length - 1,
            });
        } else if (currentChapter < 0) {
            setCurrentChapter(0);
            candidate = pickedFile?.chapters[0];
            updateAppSettings({ lastChapterNumber: 0 });
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
    };
};
