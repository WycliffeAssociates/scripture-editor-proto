import {useLoaderData, useRouter} from "@tanstack/react-router";
import type {LexicalEditor} from "lexical";
import {createContext, useContext, useEffect, useRef, useState} from "react";
import type {ParsedFile} from "@/app/data/parsedProject";
import type {SettingsManager} from "@/app/data/settings";
import {
  type UseActionsHook,
  useWorkspaceActions,
} from "@/app/ui/hooks/useActions";
import {type UseLintReturn, useLint} from "@/app/ui/hooks/useLint";
import {
  type ReferenceProjectHook,
  useReferenceProject,
} from "@/app/ui/hooks/useReferenceProject";
import {type UseSearchReturn, useProjectSearch} from "@/app/ui/hooks/useSearch";
import {
  useWorkspaceState,
  type WorkspaceState,
} from "@/app/ui/hooks/useWorkspaceState";
import type {LintError} from "@/core/domain/usfm/parse";

interface WorkSpaceContextType {
  editorRef: React.RefObject<LexicalEditor | null>;
  settingsManager: SettingsManager;
  allProjects: {path: string; name: string}[];
  currentProjectRoute: string;
  project: WorkspaceState;
  actions: UseActionsHook;
  referenceProject: ReferenceProjectHook;
  search: UseSearchReturn;
  lint: UseLintReturn;
}
const WorkspaceContext = createContext<WorkSpaceContextType | undefined>(
  undefined
);

export const useWorkspaceContext = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useProjectContext must be inside ProjectProvider");
  return ctx;
};

type ProjectProviderProps = {
  currentProjectRoute: string;
  projectFiles: ParsedFile[];
  allInitialLintErrors: LintError[];
  children: React.ReactNode;
};
export const ProjectProvider = ({
  currentProjectRoute,
  projectFiles,
  allInitialLintErrors,
  children,
}: ProjectProviderProps) => {
  const editorRef = useRef<LexicalEditor | null>(null);
  const {projects} = useLoaderData({from: "__root__"});
  const [workingFiles, setWorkingFiles] = useState<ParsedFile[]>(projectFiles);
  const {settingsManager, directoryProvider} = useRouter().options.context;

  const project = useWorkspaceState(settingsManager, workingFiles);
  const actions = useWorkspaceActions({
    editorRef,
    currentChapter: project.currentChapter,
    currentFileBibleIdentifier: project.currentFileBibleIdentifier,
    setCurrentChapter: project.setCurrentChapter,
    setCurrentFileBibleIdentifier: project.setCurrentFileBibleIdentifier,
    updateAppSettings: project.updateAppSettings,
    appSettings: project.appSettings,
    workingFiles,
    setWorkingFiles,
    pickedFile: project.pickedFile,
  });
  const referenceProject = useReferenceProject({
    directoryProvider,
    pickedFileIdentifier: project.pickedFile.bibleIdentifier,
    pickedChapterNumber: project.pickedChapter.chapNumber,
  });
  const search = useProjectSearch({
    workingFiles,
    saveCurrentDirtyLexical: actions.saveCurrentDirtyLexical,
    switchBookOrChapter: actions.switchBookOrChapter,
    editorRef,
    pickedFile: project.pickedFile,
    pickedChapter: project.pickedChapter,
  });
  const lint = useLint({initialLintErrors: allInitialLintErrors});

  // sync props to state: Be sure all dirty work is saved before navigating away or closing app
  useEffect(() => {
    setWorkingFiles(projectFiles);
  }, [projectFiles]);
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
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};
