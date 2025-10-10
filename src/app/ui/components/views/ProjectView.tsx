import {Toolbar} from "@/app/ui/components/blocks/Toolbar";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";

export function ProjectView() {
  const {editorRef, project} = useProjectContext();
  return (
    <div className="grid grid-rows-[auto_1fr] h-screen outline-solid outline-red-500">
      <nav>
        <Toolbar />
      </nav>
      <div>
        Current book is {project.currentFile} and chapter is{" "}
        {project.currentChapter}
      </div>
    </div>
  );
}
