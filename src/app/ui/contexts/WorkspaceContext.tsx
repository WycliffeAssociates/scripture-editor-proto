import { useLoaderData, useRouter } from "@tanstack/react-router";
import type { LexicalEditor } from "lexical";
import { createContext, useContext, useEffect, useRef } from "react";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import type { SettingsManager } from "@/app/data/settings.ts";
import {
    type UseActionsHook,
    useWorkspaceActions,
} from "@/app/ui/hooks/useActions.tsx";
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
import type {
    ListedProject,
    Project,
} from "@/core/persistence/ProjectRepository.ts";

interface WorkSpaceContextType {
    editorRef: React.RefObject<LexicalEditor | null>;
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
    projectLanguageDirection: "ltr" | "rtl";
    bookCodeToProjectLocalizedTitle({
        bookCode,
        replaceCodeInString,
    }: {
        bookCode: string;
        replaceCodeInString?: string;
    }): string;
}
const WorkspaceContext = createContext<WorkSpaceContextType | undefined>(
    undefined,
);

export const useWorkspaceContext = () => {
    const ctx = useContext(WorkspaceContext);
    if (!ctx)
        throw new Error("useProjectContext must be inside ProjectProvider");
    return ctx;
};

type ProjectProviderProps = {
    currentProjectRoute: string;
    projectFiles: ParsedFile[];
    allInitialLintErrors: LintError[];
    children: React.ReactNode;
    loadedProject: Project;
};
export const ProjectProvider = ({
    currentProjectRoute,
    projectFiles,
    allInitialLintErrors,
    loadedProject,
    children,
}: ProjectProviderProps) => {
    const editorRef = useRef<LexicalEditor | null>(null);
    const { projects } = useLoaderData({ from: "__root__" });
    const projectLanguageDirection = loadedProject.metadata.language.direction;

    // Keep a mutable copy for performance intensive operations: It should always end up being "latest", and then we can call setWorkingFiles back to this ref's value after mutations;
    const mutWorkingFilesRef = useRef(projectFiles);

    const { settingsManager, projectRepository } = useRouter().options.context;
    const cssStyleSheet = useDynamicStylesheet();
    const project = useWorkspaceState(
        settingsManager,
        mutWorkingFilesRef.current,
    );
    const saveDiff = useProjectDiffs({
        mutWorkingFilesRef: mutWorkingFilesRef.current,
        // setWorkingFiles,
        editorRef: editorRef,
        pickedFile: project.pickedFile,
        pickedChapter: project.pickedChapter,
        loadedProject,
        // saveCurrentDirtyLexical: actions.saveCurrentDirtyLexical,
    });
    const actions = useWorkspaceActions({
        editorRef,
        loadedProject,
        currentChapter: project.currentChapter,
        currentFileBibleIdentifier: project.currentFileBibleIdentifier,
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
    });

    const referenceProject = useReferenceProject({
        projectRepository: projectRepository,
        pickedFileIdentifier: project.pickedFile.bookCode,
        pickedChapterNumber: project.pickedChapter.chapNumber,
    });
    const search = useProjectSearch({
        workingFiles: mutWorkingFilesRef.current,
        saveCurrentDirtyLexical: actions.saveCurrentDirtyLexical,
        switchBookOrChapter: actions.switchBookOrChapter,
        editorRef,
        pickedFile: project.pickedFile,
        pickedChapter: project.pickedChapter,
    });
    const lint = useLint({
        initialLintErrors: allInitialLintErrors,
        currentChapter: project.currentChapter,
        currentBibleBookId: project.currentFileBibleIdentifier,
    });

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
                projectLanguageDirection,
                bookCodeToProjectLocalizedTitle,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
};
