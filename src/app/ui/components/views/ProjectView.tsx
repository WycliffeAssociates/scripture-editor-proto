import {MainEditor} from "@/app/ui/components/blocks/Editor";
import {Toolbar} from "@/app/ui/components/blocks/Toolbar";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";

export function ProjectView() {
  // const {editorRef, project} = useProjectContext();
  return (
    <div className="grid grid-rows-[auto_1fr] h-screen ">
      <nav>
        <Toolbar />
      </nav>
      <main className="h-full overflow-y-auto">
        <MainEditor />
      </main>
    </div>
  );
}
