import {useLoaderData, useRouter} from "@tanstack/react-router";
import type {LexicalEditor} from "lexical";
import {createContext, useContext, useEffect, useRef, useState} from "react";
import type {ParsedFile} from "@/app/data/parsedProject";
import type {SettingsManager} from "@/app/data/settings";
import {type UseLintReturn, useLint} from "@/app/ui/hooks/useLint";
import {
  type ProjectState,
  useProjectState,
} from "@/app/ui/hooks/useProjectState";
import {type UseSearchReturn, useProjectSearch} from "@/app/ui/hooks/useSearch";
import {type UseActionsHook, useProjectActions} from "../hooks/useActions";
import {
  type ReferenceProjectHook,
  useReferenceProject,
} from "../hooks/useReferenceProject";

interface ProjectContextType {
  editorRef: React.RefObject<LexicalEditor | null>;
  settingsManager: SettingsManager;
  allProjects: {path: string; name: string}[];
  currentProjectRoute: string;
  project: ProjectState;
  actions: UseActionsHook;
  referenceProject: ReferenceProjectHook;
  search: UseSearchReturn;
  lint: UseLintReturn;
}
const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProjectContext = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext must be inside ProjectProvider");
  return ctx;
};

type ProjectProviderProps = {
  currentProjectRoute: string;
  projectFiles: ParsedFile[];
  children: React.ReactNode;
};
export const ProjectProvider = ({
  currentProjectRoute,
  projectFiles,
  children,
}: ProjectProviderProps) => {
  const editorRef = useRef<LexicalEditor | null>(null);
  const {projects} = useLoaderData({from: "__root__"});
  const [workingFiles, setWorkingFiles] = useState<ParsedFile[]>(projectFiles);
  const {settingsManager, directoryProvider} = useRouter().options.context;

  const project = useProjectState(settingsManager, workingFiles);
  const actions = useProjectActions({
    editorRef,
    currentChapter: project.currentChapter,
    currentFile: project.currentFile,
    setCurrentChapter: project.setCurrentChapter,
    setCurrentFile: project.setCurrentFile,
    updateAppSettings: project.updateAppSettings,
    appSettings: project.appSettings,
    workingFiles,
    setWorkingFiles,
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
  });
  const lint = useLint();

  // sync props to state: Be sure all dirty work is saved before navigating away or closing app
  // useEffect(() => {
  //   setWorkingFiles(projectFiles);
  // }, [projectFiles]);
  return (
    <ProjectContext.Provider
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
    </ProjectContext.Provider>
  );
};
