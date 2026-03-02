import { useLoaderData, useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import { createContext, useEffect, useRef } from "react";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import {
    type UseActionsHook,
    useWorkspaceActions,
} from "@/app/ui/hooks/useActions.tsx";
import {
    type CustomHistoryHook,
    useCustomHistory,
} from "@/app/ui/hooks/useCustomHistory.ts";
import {
    type UseDynamicStylesheetHook,
    useDynamicStylesheet,
} from "@/app/ui/hooks/useDynamicStyles.tsx";
import { type UseLintReturn, useLint } from "@/app/ui/hooks/useLint.tsx";
import {
    type ReferenceProjectHook,
    useReferenceProject,
} from "@/app/ui/hooks/useReferenceProject.tsx";
import {
    type UseProjectDiffsReturn,
    useProjectDiffs,
} from "@/app/ui/hooks/useSave.tsx";
import {
    type UseSearchReturn,
    useProjectSearch,
} from "@/app/ui/hooks/useSearch.tsx";
import {
    useWorkspaceState,
    type WorkspaceState,
} from "@/app/ui/hooks/useWorkspaceState.tsx";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { lintExistingUsfmTokens } from "@/core/domain/usfm/parse.ts";
import { initParseContext } from "@/core/domain/usfm/tokenParsers.ts";
import type {
    ListedProject,
    Project,
} from "@/core/persistence/ProjectRepository.ts";
import { getFlattenedEditorStateAsParseTokens } from "../hooks/utils/editorUtils.ts";

export interface WorkSpaceContextType {
    editorRef: React.RefObject<LexicalEditor | null>;
    referenceEditorRef: React.RefObject<LexicalEditor | null>;
    settingsManager: SettingsManager;
    allProjects: ListedProject[];
    currentProjectRoute: string;
    project: WorkspaceState;
    actions: UseActionsHook;
    referenceProject: ReferenceProjectHook;
    search: UseSearchReturn;
    lint: UseLintReturn;
    cssStyleSheet: UseDynamicStylesheetHook;
    saveDiff: UseProjectDiffsReturn;
    history: CustomHistoryHook;
    projectLanguageDirection: "ltr" | "rtl";
    isProcessing: boolean;
    bookCodeToProjectLocalizedTitle({
        bookCode,
        replaceCodeInString,
    }: {
        bookCode: string;
        replaceCodeInString?: string;
    }): string;
}

type ProjectProviderProps = {
    currentProjectRoute: string;
    projectFiles: ParsedFile[];
    allInitialLintErrors: LintError[];
    children: React.ReactNode;
    loadedProject: Project;
    queryBookOverride?: string;
    queryChapterOverride?: number;
};
const WorkspaceContext = createContext<WorkSpaceContextType | undefined>(
    undefined,
);

export { WorkspaceContext };

export const ProjectProvider = ({
    currentProjectRoute,
    projectFiles,
    allInitialLintErrors,
    loadedProject,
    queryBookOverride,
    queryChapterOverride,
    children,
}: ProjectProviderProps) => {
    const editorRef = useRef<LexicalEditor | null>(null);
    const referenceEditorRef = useRef<LexicalEditor | null>(null);
    const { projects } = useLoaderData({ from: "__root__" });
    const projectLanguageDirection = loadedProject.metadata.language.direction;

    // Keep a mutable copy for performance intensive operations: It should always end up being "latest", and then we can call setWorkingFiles back to this ref's value after mutations;
    const mutWorkingFilesRef = useRef(projectFiles);

    const {
        settingsManager,
        projectRepository,
        directoryProvider,
        md5Service,
        gitProvider,
    } = useRouter().options.context;
    const cssStyleSheet = useDynamicStylesheet();
    const project = useWorkspaceState(
        settingsManager,
        projectFiles,
        queryBookOverride,
        queryChapterOverride,
    );
    const history = useCustomHistory({
        mutWorkingFilesRef: mutWorkingFilesRef.current,
        editorRef,
        currentFileBibleIdentifier: project.pickedFile.bookCode,
        currentChapter:
            project.pickedChapter?.chapNumber || project.currentChapter,
    });
    const saveDiff = useProjectDiffs({
        mutWorkingFilesRef: mutWorkingFilesRef.current,
        // setWorkingFiles,
        editorRef: editorRef,
        pickedFile: project.pickedFile,
        pickedChapter: project.pickedChapter || null,
        loadedProject,
        history,
        projectRepository,
        directoryProvider,
        md5Service,
        gitProvider,
        editorMode: settingsManager.get("editorMode"),
        allProjects: projects,
        currentProjectRoute,
        // saveCurrentDirtyLexical: actions.saveCurrentDirtyLexical,
    });

    const lint = useLint({
        initialLintErrors: allInitialLintErrors,
    });

    const referenceProject = useReferenceProject({
        projectRepository: projectRepository,
        pickedFileIdentifier: project.pickedFile.bookCode,
        pickedChapterNumber: project.pickedChapter?.chapNumber || 0,
        gitProvider,
    });

    const actions = useWorkspaceActions({
        editorRef,
        loadedProject,
        currentChapter:
            project.pickedChapter?.chapNumber || project.currentChapter,
        currentFileBibleIdentifier: project.pickedFile.bookCode,
        setCurrentChapter: project.setCurrentChapter,
        setCurrentFileBibleIdentifier: project.setCurrentFileBibleIdentifier,
        updateAppSettings: project.updateAppSettings,
        appSettings: project.appSettings,
        // workingFiles,
        // setWorkingFiles,
        pickedFile: project.pickedFile,
        mutWorkingFilesRef: mutWorkingFilesRef.current,
        toggleDiffModal: saveDiff.toggleDiffModal,
        updateDiffMapForChapter: saveDiff.updateDiffMapForChapter,
        replaceLintErrorsForBook: lint.replaceErrorsForBook,
        referenceProject,
        setIsProcessing: project.setIsProcessing,
        setFormatMatchReport: project.setFormatMatchReport,
        autoOpenFormatMatchSuggestions: project.autoOpenFormatMatchSuggestions,
        setIsFormatMatchSuggestionsOpen:
            project.setIsFormatMatchSuggestionsOpen,
        projectLanguageDirection,
        targetMarkerPreservationMode: project.targetMarkerPreservationMode,
        history,
    });
    const search = useProjectSearch({
        workingFiles: projectFiles,
        referenceFiles: referenceProject.referenceQuery.data?.parsedFiles,
        saveCurrentDirtyLexical: actions.saveCurrentDirtyLexical,
        switchBookOrChapter: actions.switchBookOrChapter,
        editorRef,
        referenceEditorRef,
        pickedFile: project.pickedFile,
        pickedChapter: project.pickedChapter,
        history,
    });

    // Keep lint state in sync after history replay (undo/redo), including
    // entries that touch chapters outside the currently visible editor.
    useEffect(() => {
        return history.registerPostUndoRedoAction((event) => {
            const touchedBooks = new Set(
                event.touchedChapters.map((chapter) => chapter.bookCode),
            );
            for (const bookCode of touchedBooks) {
                const file = mutWorkingFilesRef.current.find(
                    (candidate) => candidate.bookCode === bookCode,
                );
                if (!file) continue;

                const flatTokens = file.chapters.flatMap((chapter) =>
                    getFlattenedEditorStateAsParseTokens(chapter.lexicalState),
                );
                if (!flatTokens.length) {
                    lint.replaceErrorsForBook(bookCode, []);
                    continue;
                }
                const ctx = initParseContext(flatTokens);
                const errors = lintExistingUsfmTokens(flatTokens, ctx);
                lint.replaceErrorsForBook(bookCode, errors);
            }
        });
    }, [history, lint]);

    function bookCodeToProjectLocalizedTitle({
        bookCode,
        replaceCodeInString,
    }: {
        bookCode: string;
        replaceCodeInString?: string;
    }) {
        const file = loadedProject.files.find(
            (file) => file.bookCode === bookCode,
        );
        if (!file) return bookCode;
        if (replaceCodeInString) {
            return replaceCodeInString.replace(bookCode, file.title);
        }
        return file.title;
    }

    // sync props to state: Be sure all dirty work is saved before navigating away or closing app
    useEffect(() => {
        mutWorkingFilesRef.current = projectFiles;
    }, [projectFiles]);

    // keep ref in sync when React commits new state
    // useEffect(() => {
    //     // won't fire needlesslely when workingFiles is already set to the value of workingFilesRef.current; only if props changes
    //     mutWorkingFilesRef.current = workingFiles;
    // }, [workingFiles]);
    return (
        <WorkspaceContext.Provider
            value={{
                editorRef,
                referenceEditorRef,
                settingsManager,
                allProjects: projects,
                currentProjectRoute,
                project,
                actions,
                referenceProject,
                search,
                lint,
                cssStyleSheet,
                saveDiff,
                history,
                projectLanguageDirection,
                isProcessing: project.isProcessing,
                bookCodeToProjectLocalizedTitle,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
};
