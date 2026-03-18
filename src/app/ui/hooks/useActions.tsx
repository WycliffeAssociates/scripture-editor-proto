import { useMantineColorScheme } from "@mantine/core";
import type { LexicalEditor, SerializedEditorState } from "lexical";
import type { Dispatch, SetStateAction } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import type { FormatMatchingRunReport } from "@/app/ui/data/formatMatching.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { useFormatMatching } from "@/app/ui/hooks/useFormatMatching.tsx";
import { useLintFixing } from "@/app/ui/hooks/useLintFixing.tsx";
import { useModeSwitching } from "@/app/ui/hooks/useModeSwitching.tsx";
import { useNavigation } from "@/app/ui/hooks/useNavigation.tsx";
import { useFormatOperations } from "@/app/ui/hooks/usePrettifyOperations.tsx";
import type { ReferenceProjectHook } from "@/app/ui/hooks/useReferenceProject.tsx";
import { collectFileTokens } from "@/app/ui/hooks/utils/editorUtils.ts";
import type { TargetMarkerPreservationMode } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import { useEditorState } from "./useEditorState.tsx";

export type UseActionsHook = ReturnType<typeof useWorkspaceActions>;

type Props = {
    editorRef: React.RefObject<LexicalEditor | null>;
    mutWorkingFilesRef: ParsedFile[];
    loadedProject: Project;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setCurrentFileBibleIdentifier: (file: string) => void;
    setCurrentChapter: (chapter: number) => void;
    appSettings: Settings;
    updateAppSettings: (newSettings: Partial<Settings>) => void;
    pickedFile: ParsedFile | null;
    toggleDiffModal: (saveCurrentDirtyLexical: () => void) => void;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    replaceLintErrorsForBook: (book: string, newErrors: LintIssue[]) => void;
    referenceProject: ReferenceProjectHook;
    setIsProcessing: (isProcessing: boolean) => void;
    setFormatMatchReport: Dispatch<
        SetStateAction<FormatMatchingRunReport | null>
    >;
    autoOpenFormatMatchSuggestions: boolean;
    setIsFormatMatchSuggestionsOpen: (open: boolean) => void;
    projectLanguageDirection: "ltr" | "rtl";
    targetMarkerPreservationMode: TargetMarkerPreservationMode;
    history: CustomHistoryHook;
};

export const useWorkspaceActions = ({
    mutWorkingFilesRef,
    editorRef,
    currentFileBibleIdentifier,
    currentChapter,
    setCurrentFileBibleIdentifier,
    setCurrentChapter,
    appSettings,
    updateAppSettings,
    pickedFile,
    toggleDiffModal: toggleDiffModalCallback,
    updateDiffMapForChapter,
    replaceLintErrorsForBook,
    referenceProject,
    setIsProcessing,
    setFormatMatchReport,
    autoOpenFormatMatchSuggestions,
    setIsFormatMatchSuggestionsOpen,
    projectLanguageDirection,
    targetMarkerPreservationMode,
    history,
}: Props) => {
    const { setColorScheme: setMantineColorScheme } = useMantineColorScheme();

    // Wrapper functions to handle null editor
    const saveCurrentDirtyLexicalWrapper = () => {
        if (editorRef.current) {
            return editorState.saveCurrentDirtyLexical(editorRef.current);
        }
        return undefined;
    };

    const setEditorContentWrapper = (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ParsedChapter | undefined,
        editor?: LexicalEditor,
    ) => {
        const editorToUse = editor || editorRef.current;
        if (editorToUse) {
            return editorState.setEditorContent(
                editorToUse,
                fileBibleIdentifier,
                chapter,
                chapterContent,
            );
        }
    };

    // Initialize all focused hooks
    const editorState = useEditorState({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        updateDiffMapForChapter,
    });

    const modeSwitching = useModeSwitching({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        appSettings,
        updateAppSettings,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
    });

    const navigation = useNavigation({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        setCurrentFileBibleIdentifier,
        setCurrentChapter,
        updateAppSettings,
        pickedFile,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
    });

    const prettifyOperations = useFormatOperations({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        setIsProcessing,
        updateDiffMapForChapter,
        replaceLintErrorsForBook,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
        history,
    });

    const formatMatching = useFormatMatching({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        referenceProject,
        updateDiffMapForChapter,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
        setFormatMatchReport,
        autoOpenFormatMatchSuggestions,
        setIsFormatMatchSuggestionsOpen,
        editorRef,
        editorMode: appSettings.editorMode ?? "regular",
        languageDirection: projectLanguageDirection,
        targetMarkerPreservationMode,
        history,
    });

    const lintFixing = useLintFixing({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        editorRef,
        updateDiffMapForChapter,
        replaceLintErrorsForBook,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
        history,
    });

    // Utility functions that need access to current state
    function getFlatFileTokens(
        _currentEditorState: SerializedEditorState,
        opts?: { bookCode?: string; chapter?: number },
    ): Token[] {
        saveCurrentDirtyLexicalWrapper();

        const targetBookCode = opts?.bookCode;
        const fileForLint =
            (targetBookCode
                ? mutWorkingFilesRef.find((f) => f.bookCode === targetBookCode)
                : null) ?? pickedFile;

        if (!fileForLint) return [];

        return collectFileTokens(fileForLint, {
            structuralParagraphBreaks: true,
        });
    }

    function goToReference(input: string): boolean {
        return navigation.goToReference(input, editorRef);
    }

    const setColorScheme = (value: "light" | "dark") => {
        updateAppSettings({ colorScheme: value });
        setMantineColorScheme(value);
    };

    // Return same interface as before for backward compatibility
    return {
        // Editor state management
        updateChapterLexical: editorState.updateChapterLexical,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,

        // Navigation
        switchBookOrChapter: navigation.switchBookOrChapter,
        nextChapter: navigation.nextChapter,
        prevChapter: navigation.prevChapter,
        goToReference,

        // Mode switching
        setEditorMode: (next: EditorModeSetting) =>
            modeSwitching.setEditorMode(next, editorRef.current ?? undefined),
        initializeEditor: modeSwitching.initializeEditor,

        // Prettify operations
        prettifyChapter: prettifyOperations.prettifyChapter,
        prettifyBook: prettifyOperations.prettifyBook,
        prettifyProject: prettifyOperations.prettifyProject,
        revertPrettify: prettifyOperations.revertFormat,

        // Format matching
        matchFormattingChapter: formatMatching.matchFormattingChapter,
        matchFormattingBook: formatMatching.matchFormattingBook,
        matchFormattingProject: formatMatching.matchFormattingProject,
        applyMatchFormattingSuggestion:
            formatMatching.applyMatchFormattingSuggestion,

        // Lint fixing
        fixLintError: lintFixing.fixLintError,

        // Utility functions
        getFlatFileTokens,
        toggleDiffModal: () =>
            toggleDiffModalCallback(() => saveCurrentDirtyLexicalWrapper()),
        setColorScheme,
    };
};
