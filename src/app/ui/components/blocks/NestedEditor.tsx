import {LexicalComposer} from "@lexical/react/LexicalComposer";
import {ContentEditable} from "@lexical/react/LexicalContentEditable";
import {EditorRefPlugin} from "@lexical/react/LexicalEditorRefPlugin";
import {LexicalErrorBoundary} from "@lexical/react/LexicalErrorBoundary";
import {HistoryPlugin} from "@lexical/react/LexicalHistoryPlugin";
import {OnChangePlugin} from "@lexical/react/LexicalOnChangePlugin";
import {RichTextPlugin} from "@lexical/react/LexicalRichTextPlugin";
import {
  type EditorState,
  type LexicalEditor,
  LineBreakNode,
  ParagraphNode,
  type SerializedEditorState,
  type SerializedLexicalNode,
} from "lexical";
import {useCallback, useRef, useState} from "react";
import {useEffectOnce} from "react-use";
import {USFMElementNode} from "@/app/domain/editor/nodes/USFMElementNode";
import {USFMTextNode} from "@/app/domain/editor/nodes/USFMTextNode";

type Props = {
  outerMarker: string;
  initialEditorState: any; //todo:
  onChange: (
    newState: SerializedEditorState<SerializedLexicalNode>,
    mainEditor: LexicalEditor
  ) => void;
  id: string;
};
export function NestedEditor({
  outerMarker,
  initialEditorState,
  onChange,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const nestedRef = useRef<LexicalEditor>(null);
  const [editorStateJson, setEditorStateJson] =
    useState<SerializedEditorState>();

  const nestedConfig = {
    namespace: `nested-${outerMarker}-${id}`,
    editable: true,
    nodes: [ParagraphNode, LineBreakNode, USFMTextNode, USFMElementNode],
    onError(error: Error) {
      console.error("Nested editor error:", error);
    },
  };
  const handleChange = useCallback((editorState: EditorState) => {
    const editor = nestedRef.current;
    if (!editor) return;
    // todo: bubble up to main editor
    // const mainEditor = mainEditorRef.current;
    // if (!mainEditor) return;
    // onChange(editorState.toJSON(), mainEditor); // bubble up serialized state
  }, []);

  useEffectOnce(() => {
    if (nestedRef.current) {
      const parsed = nestedRef.current.parseEditorState(initialEditorState);
      nestedRef.current.setEditorState(parsed, {tag: "history-merge"});
    }
  });
  return (
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
      <EditorRefPlugin editorRef={nestedRef} />
    </LexicalComposer>
  );
}
