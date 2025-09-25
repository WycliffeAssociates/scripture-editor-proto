import {Link} from "@tanstack/react-router";
import {getCurrentWebview} from "@tauri-apps/api/webview";
import {ChevronDown, PlusIcon, SearchIcon, Settings2} from "lucide-react";
import {useEffect, useState} from "react";
import {Label} from "@/components/primitives/label";
import {useProjectContext} from "@/contexts/ProjectContext";
import {AppPreferences} from "@/customTypes/types";
import {lexicalToUSFM, moveDecoratorNode} from "@/lib/editorNodeFunctions";
import {getSerializedLexicalNodes} from "@/lib/getEditorState";
import {parseUSFM} from "@/lib/parse";
import {debounce} from "@/utils/general";
// import {debounce} from "@/utils/general";
import {Button} from "../primitives/button";
import {Checkbox} from "../primitives/checkbox";
import {Popover, PopoverContent, PopoverTrigger} from "../primitives/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../primitives/select";
import {ReferencePicker} from "../views/ProjectView";

export function Toolbar() {
  const {
    editorRef,
    pickedFile,
    setReferenceProjectPath,
    allProjects,
    referenceProjectPath,
    allFiles,
    currentFile,
    currentChapter,
    switchTo,
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
  console.log("toolbar rendered");
  return (
    <div className="w-full px-2 p-1 flex">
      <ProjectList />
      <ReferencePicker
        allFiles={allFiles}
        currentFile={currentFile}
        currentChapter={currentChapter}
        switchTo={switchTo}
      />
      <ReferenceProjectList />
      <Search />
      <FontSizeAdjust />
      <ZoomAdjust />
      {/* <div className="flex gap-2"> */}
      <Button onClick={seeUsfm}>See Usfm</Button>
      {/* <DragControls /> */}

      {/* </div> */}
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
type ProjectPopoverProps = {
  triggerText: React.ReactNode;
  renderItem: (project: {name: string; path: string}) => React.ReactNode;
};

function ProjectPopover({triggerText, renderItem}: ProjectPopoverProps) {
  const {allProjects} = useProjectContext();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-none border-none">
            {triggerText}
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-1">
        {allProjects.map((project) => (
          <div className="p-1" key={project.name}>
            {renderItem(project)}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// 📌 Always current project → Link list
export function ProjectList() {
  const {allProjects, projectPath} = useProjectContext();
  const currentProject = allProjects.find((p) => p.path === projectPath);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-none border-none">
            {currentProject?.name}
            <ChevronDown />
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-2">
        <div>
          {allProjects.map((project) => (
            <div className="p-1" key={project.name}>
              {/* todo, not quite right? not refreshing everything like I would think when clicked */}
              <Link
                to={"/projects/$projectId/edit"}
                params={{projectId: project.path}}
                className={`w-full text-left justify-start rounded-md block px-2 py-1 hover:bg-muted ${
                  project.path === projectPath ? "bg-accent" : ""
                }`}
              >
                {project.name}
              </Link>
            </div>
          ))}
          <hr />
          <div className="mt-2">
            <Link
              to="/projects/create"
              className="w-full text-left justify-start rounded-none "
            >
              <Button
                variant="secondary"
                className="text-primary inline-flex hover:cursor-pointer hover:opacity-95"
              >
                <PlusIcon className="size-4" />
                New Project
              </Button>
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    // <ProjectPopover
    //   triggerText={
    //     <ReferenceButtonText
    //       referenceProjectPath={projectPath}
    //       allProjects={allProjects}
    //     />
    //   }
    //   renderItem={(project) => (
    //     <Link
    //       to={"/projects/$projectId/edit"}
    //       params={{projectId: project.path}}
    //       className={`w-full text-left justify-start rounded-md block px-2 py-1 hover:bg-muted ${
    //         project.path === projectPath
    //           ? "bg-accent text-primary font-500"
    //           : ""
    //       }`}
    //     >
    //       {project.name}
    //     </Link>
    //   )}
    // />
  );
}

// 📌 Optional reference project → Button list
export function ReferenceProjectList() {
  const {setReferenceProjectPath, allProjects, referenceProjectPath} =
    useProjectContext();

  return (
    <ProjectPopover
      triggerText={
        <ReferenceButtonText
          referenceProjectPath={referenceProjectPath}
          allProjects={allProjects}
        />
      }
      renderItem={(project) => (
        <Button
          variant="ghost"
          className="w-full text-left justify-start rounded-none"
          onClick={() => setReferenceProjectPath(project.path)}
        >
          {project.name}
        </Button>
      )}
    />
  );
}

export function Search() {
  const {projectSearchOptions, setProjectSearchOptions} = useProjectContext();
  const [open, setOpen] = useState(false);
  const [localSearchTerm, setLocalSearchTerm] = useState(
    projectSearchOptions.term
  );

  const debounceVal = 200;

  // set context one to debounced version
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearchTerm !== projectSearchOptions.term) {
        setProjectSearchOptions({
          ...projectSearchOptions,
          term: localSearchTerm,
        });
      }
    }, debounceVal);

    return () => {
      clearTimeout(handler);
    };
  }, [localSearchTerm, projectSearchOptions, setProjectSearchOptions]);

  return (
    <div className="flex items-center gap-2">
      {/* Search input with icon */}
      <div className="relative flex-1">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search..."
          className="w-full rounded-full bg-muted px-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={localSearchTerm}
          onChange={(e) => setLocalSearchTerm(e.target.value)}
        />
      </div>

      {/* Popover for search options */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <Settings2 className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Search options</Label>
            <div className="flex items-center gap-2">
              {/** biome-ignore lint/correctness/useUniqueElementIds: <explanation> */}
              <Checkbox
                id="caseSensitive"
                // checked={projectSearchTerm.includes("(?i)")}
                onCheckedChange={(checked) => {
                  setProjectSearchOptions({
                    ...projectSearchOptions,
                    caseSensitive:
                      checked === "indeterminate" ? false : checked,
                  });
                }}
              />
              <Label htmlFor="caseSensitive" className="text-sm">
                Case sensitive
              </Label>
            </div>
            <div className="flex items-center gap-2">
              {/** biome-ignore lint/correctness/useUniqueElementIds: <explanation> */}
              <Checkbox
                id="wholeWord"
                // checked={projectSearchTerm.includes("\\b")}
                onCheckedChange={(checked) => {
                  setProjectSearchOptions({
                    ...projectSearchOptions,
                    wholeWord: checked === "indeterminate" ? false : checked,
                  });
                }}
                className="w-4 h-4 checked:bg-primary"
              />
              <Label htmlFor="wholeWord" className="text-sm">
                Whole word
              </Label>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function FontSizeAdjust() {
  const {appPreferences, updateAppPreferences} = useProjectContext();

  // Get current font size or default from document root
  const root = document.documentElement;
  const defaultSize = window
    .getComputedStyle(root)
    .getPropertyValue("font-size");
  const currentSize = appPreferences.fontSize || defaultSize;
  const minSize = 15;

  // Keep document root in sync
  useEffect(() => {
    root.style.fontSize = currentSize;
  }, [currentSize, root.style]);

  // Utility to change size up or down
  const adjustFontSize = (delta: number) => {
    const numeric = parseFloat(currentSize);
    const unit = currentSize.replace(/[0-9.]/g, "") || "px";
    const newSize = `${Math.max(minSize, numeric + delta)}${unit}`;
    updateAppPreferences({
      ...appPreferences,
      fontSize: newSize,
    });
  };
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        disabled={currentSize === `${minSize}px`}
        onClick={() => adjustFontSize(-1)}
        className="size-6"
      >
        –
      </Button>
      <div className="px-2 py-1 border rounded text-sm">{currentSize}</div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => adjustFontSize(1)}
        className="size-6"
      >
        +
      </Button>
    </div>
  );
}

const ZOOM_LEVELS = [
  {label: "50%", value: 0.5},
  {label: "75%", value: 0.75},
  {label: "90%", value: 0.9},
  {label: "Default (100%)", value: 1},
  {label: "125%", value: 1.25},
  {label: "150%", value: 1.5},
  {label: "200%", value: 2},
];

export function ZoomAdjust() {
  const {updateAppPreferences, appPreferences} = useProjectContext();

  // Default zoom = 100% if not set
  const currentZoom = appPreferences.zoom ?? 1;
  console.log({currentZoom});

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    getCurrentWebview().setZoom(Number(currentZoom));
  }, []);
  function adjustZoom(value: number) {
    getCurrentWebview().setZoom(value);
    updateAppPreferences({
      ...appPreferences,
      zoom: value,
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentZoom.toString()}
        onValueChange={(value) => adjustZoom(Number(value))}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Zoom" />
        </SelectTrigger>
        <SelectContent>
          {ZOOM_LEVELS.map(({label, value}) => (
            <SelectItem key={value} value={value.toString()}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
