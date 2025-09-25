import {LexicalComposer} from "@lexical/react/LexicalComposer";
import {ContentEditable} from "@lexical/react/LexicalContentEditable";
import {EditorRefPlugin} from "@lexical/react/LexicalEditorRefPlugin";
import {LexicalErrorBoundary} from "@lexical/react/LexicalErrorBoundary";
import {HistoryPlugin} from "@lexical/react/LexicalHistoryPlugin";
import {OnChangePlugin} from "@lexical/react/LexicalOnChangePlugin";
import {RichTextPlugin} from "@lexical/react/LexicalRichTextPlugin";
import {
  $createNodeSelection,
  $getEditor,
  $getNodeByKey,
  $setSelection,
  type EditorState,
  type LexicalEditor,
  LineBreakNode,
  ParagraphNode,
  SerializedEditorState,
  SerializedLexicalNode,
} from "lexical";
import {useCallback, useEffect, useId, useRef, useState} from "react";

import {Button} from "@/components/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/primitives/popover";
import {useProjectContext} from "@/contexts/ProjectContext";
import {USFMElementNode} from "@/features/editor/nodes/USFMElementNode";
import {USFMDecoratorNode} from "@/features/editor/nodes/USFMMarkerDecoratorNode";
import {USFM_NESTED_DECORATOR_TYPE} from "@/features/editor/nodes/USFMNestedEditorDecorator";
import {USFMTextNode} from "@/features/editor/nodes/USFMTextNode";

interface Props {
  marker: string;
  lexicalKey: string;
  initialEditorState: any;
  onChange: (
    newState: SerializedEditorState<SerializedLexicalNode>,
    mainEditor: LexicalEditor
  ) => void;
}

export function USFMNestedEditor({
  marker,
  lexicalKey,
  initialEditorState,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const editorRef = useRef<LexicalEditor>(null);
  const {setDragState, editorRef: mainEditorRef} = useProjectContext();
  const hasInitialized = useRef(false);
  const [editorStateJson, setEditorStateJson] =
    useState<SerializedEditorState>();
  const id = useId();

  const nestedConfig = {
    namespace: `nested-${marker}-${id}`,

    editable: true,
    nodes: [
      ParagraphNode,
      LineBreakNode,
      USFMTextNode,
      USFMElementNode,
      USFMDecoratorNode,
    ],
    onError(error: Error) {
      console.error("Nested editor error:", error);
    },
  };

  // Sync initial state
  // useEffect(() => {
  //   if (editorRef.current) {
  //     const parsed = editorRef.current.parseEditorState(initialEditorState);
  //     editorRef.current.setEditorState(parsed, {tag: "history-merge"});
  //   }
  // }, [initialEditorState]);

  // Track changes
  const handleChange = useCallback(
    (editorState: EditorState) => {
      const editor = editorRef.current;
      if (!editor) return;
      const mainEditor = mainEditorRef.current;
      if (!mainEditor) return;
      onChange(editorState.toJSON(), mainEditor); // bubble up serialized state
    },
    [onChange, mainEditorRef.current]
  );
  const handlePopOverOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (open) {
        setTimeout(() => {
          console.log("Initializing nested editor", initialEditorState);
          const parsed = editorRef.current?.parseEditorState(
            editorStateJson ?? initialEditorState
          );
          if (parsed) {
            editorRef.current?.setEditorState(parsed, {tag: "history-merge"});
            hasInitialized.current = true;
          }
        }, 1);
      }
    },
    [initialEditorState, editorStateJson]
  );

  return (
    <Popover open={open} onOpenChange={handlePopOverOpenChange} modal>
      <PopoverTrigger
        asChild
        className="focus:outline-2 focus:outline-primary"
        data-js="usfm-decorator-trigger"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen(true);
        }}
      >
        <span
          className="cursor-pointer select-none px-1 rounded hover:bg-muted"
          contentEditable={false}
          data-marker={marker}
          data-lexical-node={USFM_NESTED_DECORATOR_TYPE}
        >
          {marker}*
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2">
        <LexicalComposer initialConfig={nestedConfig}>
          <RichTextPlugin
            ErrorBoundary={LexicalErrorBoundary}
            contentEditable={
              <ContentEditable className="outline-none min-h-[60px] p-1 border rounded" />
            }
            placeholder={<span className="text-gray-400">Enter note…</span>}
          />
          <HistoryPlugin />
          <OnChangePlugin onChange={handleChange} />
          <EditorRefPlugin editorRef={editorRef} />
        </LexicalComposer>
        <Button
          onClick={() => {
            if (editorRef.current) {
              editorRef.current.update(() => {
                const json = editorRef.current!.getEditorState().toJSON();
                const mainEditor = mainEditorRef.current;
                if (mainEditor) {
                  onChange(json, mainEditor);
                }
              });
            }
            // setOpen(false);
          }}
        >
          Save
        </Button>
        <Button
          onClick={() => {
            setDragState({draggingNodeKey: lexicalKey});
            setOpen(false);
          }}
          className="w-full"
        >
          Start Drag
        </Button>
      </PopoverContent>
    </Popover>
  );
}
