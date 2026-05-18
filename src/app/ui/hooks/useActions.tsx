import type { LexicalEditor, SerializedEditorState } from "lexical";
import type { Dispatch, SetStateAction } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import type {
    ScriptureBookState,
    ScriptureChapterState,
} from "@/app/scripture/ScriptureWorkspaceState.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";
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
import { applyColorSchemeToDocument } from "@/app/ui/theme/appTheme.ts";
import type { TargetMarkerPreservationMode } from "@/core/domain/usfm/matchFormattingByVerseAnchors.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";
import { useEditorState } from "./useEditorState.tsx";

export type UseActionsHook = ReturnType<typeof useWorkspaceActions>;

type Props = {
    editorRef: React.RefObject<LexicalEditor | null>;
    workingFilesStore: WorkingFilesStore;
    loadedProject: Project;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    setCurrentFileBibleIdentifier: (file: string) => void;
    setCurrentChapter: (chapter: number) => void;
    appSettings: Settings;
    updateAppSettings: (newSettings: Partial<Settings>) => void;
    pickedFile: ScriptureBookState | null;
    toggleDiffModal: () => void;
    updateDiffMapForChapter: (bookCode: string, chapterNum: number) => void;
    commitBookLintResults: (resultsByBook: Record<string, LintIssue[]>) => void;
    referenceResource: ReferenceItemHook;
    setIsProcessing: (isProcessing: boolean) => void;
    setFormatMatchReport: Dispatch<
        SetStateAction<FormatMatchingRunReport | null>
    >;
    setIsFormatMatchSuggestionsOpen: (open: boolean) => void;
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
    workingFilesStore,
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
    commitBookLintResults,
    referenceResource,
    setIsProcessing,
    setFormatMatchReport,
    setIsFormatMatchSuggestionsOpen,
    targetMarkerPreservationMode,
    history,
}: Props) => {
    const setColorScheme = (value: "light" | "dark") => {
        updateAppSettings({ colorScheme: value });
        applyColorSchemeToDocument(value);
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
        workingFilesStore,
    });

    const modeSwitching = useModeSwitching({
        workingFilesStore,
        currentFileBibleIdentifier,
        currentChapter,
        appSettings,
        updateAppSettings,
        setEditorContent: setEditorContentWrapper,
    });

    const navigation = useNavigation({
        workingFilesStore,
        currentFileBibleIdentifier,
        currentChapter,
        setCurrentFileBibleIdentifier,
        setCurrentChapter,
        updateAppSettings,
        pickedFile,
        setEditorContent: setEditorContentWrapper,
    });

    const prettifyOperations = useFormatOperations({
        workingFilesStore,
        currentFileBibleIdentifier,
        currentChapter,
        setIsProcessing,
        updateDiffMapForChapter,
        commitBookLintResults,
        setEditorContent: setEditorContentWrapper,
        history,
    });

    const formatMatching = useFormatMatching({
        workingFilesStore,
        currentFileBibleIdentifier,
        currentChapter,
        referenceResource,
        updateDiffMapForChapter,
        setEditorContent: setEditorContentWrapper,
        setFormatMatchReport,
        setIsFormatMatchSuggestionsOpen,
        setEditorMode: (next) =>
            modeSwitching.setEditorMode(next, editorRef.current ?? undefined),
        targetMarkerPreservationMode,
        history,
    });

    const lintFixing = useLintFixing({
        workingFilesStore,
        currentFileBibleIdentifier,
        currentChapter,
        editorRef,
        updateDiffMapForChapter,
        commitBookLintResults,
        setEditorContent: setEditorContentWrapper,
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
        const targetBookCode = opts?.bookCode;
        const fileForLint =
            (targetBookCode
                ? workingFilesStore
                      .read()
                      .find((f) => f.bookCode === targetBookCode)
                : null) ?? pickedFile;

        if (!fileForLint) return [];

        return collectFileTokens(fileForLint, {
            structuralParagraphBreaks: true,
        });
    }

    function goToReference(input: string): boolean {
        return navigation.goToReference(input, editorRef);
    }

    return {
        // Editor state management
        setEditorContent: setEditorContentWrapper,

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
        syncEditorToVisibleChapter: modeSwitching.syncEditorToVisibleChapter,

        // Prettify operations
        prettifyChapter: prettifyOperations.prettifyChapter,
        prettifyBook: prettifyOperations.prettifyBook,
        prettifyProject: prettifyOperations.prettifyProject,
        revertPrettify: prettifyOperations.revertFormat,

        // Format matching
        matchFormattingChapter: formatMatching.matchFormattingChapter,
        matchFormattingBook: formatMatching.matchFormattingBook,
        matchFormattingProject: formatMatching.matchFormattingProject,

        // Lint fixing
        fixLintError: lintFixing.fixLintError,

        // Utility functions
        getFlatFileTokens,
        toggleDiffModal: toggleDiffModalCallback,
        setColorScheme,
    };
};
