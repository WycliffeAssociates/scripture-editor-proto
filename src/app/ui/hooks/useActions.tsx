import { useMantineColorScheme } from "@mantine/core";
import type { LexicalEditor, SerializedEditorState } from "lexical";
import type { Dispatch, SetStateAction } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { EDITOR_MODES } from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { FormatMatchingRunReport } from "@/app/ui/data/formatMatching.ts";
import type { CustomHistoryHook } from "@/app/ui/hooks/useCustomHistory.ts";
import { useFormatMatching } from "@/app/ui/hooks/useFormatMatching.tsx";
import { useLintFixing } from "@/app/ui/hooks/useLintFixing.tsx";
import type { SetEditorModeOptions } from "@/app/ui/hooks/useModeSwitching.tsx";
import { useModeSwitching } from "@/app/ui/hooks/useModeSwitching.tsx";
import { useNavigation } from "@/app/ui/hooks/useNavigation.tsx";
import { useFormatOperations } from "@/app/ui/hooks/usePrettifyOperations.tsx";
import type { ReferenceItemHook } from "@/app/ui/hooks/useReferenceItem.tsx";
import { collectFileTokens } from "@/app/ui/hooks/utils/editorUtils.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { TargetMarkerPreservationMode } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import { useEditorState } from "./useEditorState.tsx";

export type UseActionsHook = ReturnType<typeof useWorkspaceActions>;

type Props = {
    editorRef: React.RefObject<LexicalEditor | null>;
    mutWorkingFilesRef: ScriptureBookState[];
    loadedProject: Project;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setCurrentFileBibleIdentifier: (file: string) => void;
    setCurrentChapter: (chapter: number) => void;
    appSettings: Settings;
    updateAppSettings: (newSettings: Partial<Settings>) => void;
    pickedFile: ScriptureBookState | null;
    toggleDiffModal: (saveCurrentDirtyLexical: () => void) => void;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    replaceLintErrorsForBook: (book: string, newErrors: LintIssue[]) => void;
    referenceResource: ReferenceItemHook;
    setIsProcessing: (isProcessing: boolean) => void;
    setFormatMatchReport: Dispatch<
        SetStateAction<FormatMatchingRunReport | null>
    >;
    autoOpenFormatMatchSuggestions: boolean;
    setIsFormatMatchSuggestionsOpen: (open: boolean) => void;
    projectLanguageDirection: LanguageDirection;
    targetMarkerPreservationMode: TargetMarkerPreservationMode;
    history: CustomHistoryHook;
};

/**
 * Compose the workspace-level action API consumed by the editor UI and command
 * palette.
 *
 * This hook is intentionally an orchestration layer. It gathers narrower hooks
 * for navigation, mode switching, prettify, format matching, lint fixing, and
 * editor state so the rest of the UI can call one coherent set of workspace
 * verbs instead of manually stitching those concerns together.
 */
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
    referenceResource,
    setIsProcessing,
    setFormatMatchReport,
    autoOpenFormatMatchSuggestions,
    setIsFormatMatchSuggestionsOpen,
    projectLanguageDirection,
    targetMarkerPreservationMode,
    history,
}: Props) => {
    const { setColorScheme: setMantineColorScheme } = useMantineColorScheme();

    /**
     * Guard editor-dependent operations so callers do not have to repeat
     * null-checks for the mounted Lexical instance.
     */
    const saveCurrentDirtyLexicalWrapper = () => {
        if (editorRef.current) {
            return editorState.saveCurrentDirtyLexical(editorRef.current);
        }
        return undefined;
    };

    const setEditorContentWrapper = (
        fileBibleIdentifier: string,
        chapter: number,
        chapterContent: ScriptureChapterState | undefined,
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
        referenceResource,
        updateDiffMapForChapter,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
        setFormatMatchReport,
        autoOpenFormatMatchSuggestions,
        setIsFormatMatchSuggestionsOpen,
        editorRef,
        editorMode: appSettings.editorMode ?? EDITOR_MODES.regular,
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

    /**
     * Collect the current file's flat token view for downstream operations such
     * as linting/format matching, saving the current editor state first so the
     * token view reflects what the user most recently typed.
     */
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
        setEditorMode: (
            next: EditorModeSetting,
            options?: SetEditorModeOptions,
        ) =>
            modeSwitching.setEditorMode(
                next,
                editorRef.current ?? undefined,
                options,
            ),
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
