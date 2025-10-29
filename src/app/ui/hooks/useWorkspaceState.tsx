import {LexicalEditor} from "lexical";
import {useMemo, useRef, useState} from "react";
import type {ParsedFile} from "@/app/data/parsedProject";
import type {Settings, SettingsManager} from "@/app/data/settings";

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;

export const useWorkspaceState = (
  settingsManager: SettingsManager,
  allFiles: ParsedFile[]
) => {
  // for accessing editor and it's state in various places
  const editorRef = useRef<LexicalEditor | null>(null);

  function getSavedIfPrefersRestore<K extends keyof Settings>(
    key: K
  ): Settings[K] | undefined {
    if (!settingsManager.get("restoreToLastProjectOnLaunch")) {
      return undefined;
    }
    return settingsManager.get(key) as Settings[K] | undefined;
  }
  const [appSettings, setAppSettings] = useState<Settings>(
    settingsManager.getSettings()
  );
  const [currentFile, setCurrentFile] = useState(
    getSavedIfPrefersRestore("lastBookIdentifier") ||
      allFiles[0].bookCode
  );
  const [currentChapter, setCurrentChapter] = useState(
    getSavedIfPrefersRestore("lastChapterNumber") || 0
  );
  const [referenceProjectPath, setReferenceProjectPath] = useState<
    string | null
  >(null);

  const updateAppSettings = (newSettings: Partial<Settings>) => {
    setAppSettings({...appSettings, ...newSettings});
    settingsManager.update(newSettings);
    // will adjust root font size, webview zoom, etc; at needed
    settingsManager.applySettings();
  };
  const pickedFile = useMemo(
    () => allFiles.find((file) => file.path === currentFile) || allFiles[0],
    [allFiles, currentFile]
  );
  const pickedChapter = useMemo(() => {
    return pickedFile?.chapters[currentChapter ? currentChapter : 0];
  }, [pickedFile, currentChapter]);
  const nextChapter = useMemo(() => {
    if (!pickedFile || (!currentChapter && currentChapter !== 0)) return null;
    // at edge of book so need to get next book first chapter
    if (currentChapter === pickedFile?.chapters.length - 1) {
      const nextFile = allFiles.find(
        (file) => file.bookCode === pickedFile?.nextBookId
      );
      return nextFile?.chapters[0];
    }
    // otherwise just next chapter
    return pickedFile?.chapters[currentChapter + 1];
  }, [pickedFile, currentChapter, allFiles]);
  const prevChapter = useMemo(() => {
    if (!pickedFile || (!currentChapter && currentChapter !== 0)) return null;
    // at edge of book so need to get next book first chapter
    if (currentChapter === 0) {
      const prevFile = allFiles.find(
        (file) => file.bookCode === pickedFile?.prevBookId
      );
      return prevFile?.chapters[prevFile?.chapters.length - 1];
    }
    // otherwise just next chapter
    return pickedFile?.chapters[currentChapter - 1];
  }, [pickedFile, currentChapter, allFiles]);
  return {
    editorRef,
    workingFiles: allFiles,
    appSettings,
    updateAppSettings,
    currentFile,
    setCurrentFile,
    currentChapter,
    setCurrentChapter,
    referenceProjectPath,
    setReferenceProjectPath,
    pickedFile,
    pickedChapter,
    nextChapter,
    prevChapter,
  };
};
