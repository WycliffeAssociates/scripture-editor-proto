import type { LexicalEditor, SerializedEditorState } from "lexical";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedChapter, ParsedFile } from "@/app/data/parsedProject.ts";
import type { Settings } from "@/app/data/settings.ts";
import { useFormatMatching } from "@/app/ui/hooks/useFormatMatching.tsx";
import { useLintFixing } from "@/app/ui/hooks/useLintFixing.tsx";
import { useModeSwitching } from "@/app/ui/hooks/useModeSwitching.tsx";
import { useNavigation } from "@/app/ui/hooks/useNavigation.tsx";
import { usePrettifyOperations } from "@/app/ui/hooks/usePrettifyOperations.tsx";
import type { ReferenceProjectHook } from "@/app/ui/hooks/useReferenceProject.tsx";
import type { LintError } from "@/core/data/usfm/lint.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import { useEditorState } from "./useEditorState.tsx";
import {
    getFlattenedFileTokens,
    type LintableTokenLike,
} from "./utils/editorUtils.ts";

export type UseActionsHook = ReturnType<typeof useWorkspaceActions>;
export type { LintableTokenLike };

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
    updateLintErrors: (
        book: string,
        chapter: number,
        newErrors: LintError[],
    ) => void;
    referenceProject: ReferenceProjectHook;
    setIsProcessing: (isProcessing: boolean) => void;
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
    updateLintErrors,
    referenceProject,
    setIsProcessing,
}: Props) => {
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

    const prettifyOperations = usePrettifyOperations({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        setIsProcessing,
        updateDiffMapForChapter,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
    });

    const formatMatching = useFormatMatching({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        referenceProject,
        updateDiffMapForChapter,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
    });

    const lintFixing = useLintFixing({
        mutWorkingFilesRef,
        currentFileBibleIdentifier,
        currentChapter,
        editorRef,
        updateDiffMapForChapter,
        updateLintErrors,
        setEditorContent: setEditorContentWrapper,
        saveCurrentDirtyLexical: saveCurrentDirtyLexicalWrapper,
    });

    // Utility functions that need access to current state
    function getFlatFileTokens(
        currentEditorState: SerializedEditorState,
    ): Array<LintableTokenLike> {
        return getFlattenedFileTokens(
            pickedFile,
            currentEditorState,
            currentChapter,
        );
    }

    function goToReference(input: string): boolean {
        return navigation.goToReference(input, editorRef);
    }

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
        prettifyBook: prettifyOperations.prettifyBook,
        prettifyProject: prettifyOperations.prettifyProject,
        revertPrettify: prettifyOperations.revertPrettify,

        // Format matching
        matchFormattingChapter: formatMatching.matchFormattingChapter,
        matchFormattingBook: formatMatching.matchFormattingBook,
        matchFormattingProject: formatMatching.matchFormattingProject,

        // Lint fixing
        fixLintError: lintFixing.fixLintError,

        // Utility functions
        getFlatFileTokens,
        toggleDiffModal: () =>
            toggleDiffModalCallback(() => saveCurrentDirtyLexicalWrapper()),
    };
};
