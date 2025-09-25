import {useProjectContext} from "@/contexts/ProjectContext";
import {lexicalToUSFM, moveDecoratorNode} from "@/lib/editorNodeFunctions";
import {getSerializedLexicalNodes} from "@/lib/getEditorState";
import {parseUSFM} from "@/lib/parse";
// import {debounce} from "@/utils/general";
import {Button} from "../primitives/button";
import {Popover, PopoverContent, PopoverTrigger} from "../primitives/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../primitives/select";

export function Toolbar() {
  const {
    editorRef,
    pickedFile,
    setReferenceProjectPath,
    allProjects,
    referenceProjectPath,
  } = useProjectContext();

  function seeUsfm() {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const newUsfm = lexicalToUSFM(editor);
    console.log(newUsfm);
    const bookSlug = pickedFile?.identifier?.toUpperCase();
    const asTokens = parseUSFM(newUsfm, bookSlug).chapters;
    const asLexical = getSerializedLexicalNodes(asTokens[0]);
  }

  return (
    <div>
      <div className="flex gap-2">
        <Button onClick={seeUsfm}>See Usfm</Button>
        <DragControls />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="">
              <ReferenceButtonText
                referenceProjectPath={referenceProjectPath}
                allProjects={allProjects}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0">
            {allProjects.map((project) => (
              <Button
                key={project.name}
                variant="ghost"
                className="w-full text-left justify-start rounded-none"
                onClick={() => setReferenceProjectPath(project.path)}
              >
                {project.name}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function DragControls() {
  const {editorRef, dragState, setDragState} = useProjectContext();

  console.log(dragState);
  return (
    <>
      {dragState?.draggingNodeKey && (
        <div className="toolbar">
          <Button
            onClick={() => {
              // Cancel drag
              setDragState(null);
            }}
          >
            Cancel
          </Button>

          <Button
            onClick={() => {
              if (!editorRef.current) return;
              moveDecoratorNode(editorRef.current, dragState.draggingNodeKey);
              // Reset drag state
              setDragState(null);
            }}
          >
            Drop Here
          </Button>
        </div>
      )}
    </>
  );
}

function ReferenceButtonText({
  referenceProjectPath,
  allProjects,
}: {
  referenceProjectPath: string | null;
  allProjects: {name: string; path: string}[];
}) {
  if (!referenceProjectPath) return "Select Reference Project";
  const project = allProjects.find((p) => p.path === referenceProjectPath);
  return project?.name;
}
