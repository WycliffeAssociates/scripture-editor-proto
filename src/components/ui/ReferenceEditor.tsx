import {LexicalComposer} from "@lexical/react/LexicalComposer";
import {ContentEditable} from "@lexical/react/LexicalContentEditable";
import {EditorRefPlugin} from "@lexical/react/LexicalEditorRefPlugin";
import {LexicalErrorBoundary} from "@lexical/react/LexicalErrorBoundary";
import {RichTextPlugin} from "@lexical/react/LexicalRichTextPlugin";
import {$dfsIterator} from "@lexical/utils";
import {
  CLEAR_HISTORY_COMMAND,
  LexicalEditor,
  LineBreakNode,
  ParagraphNode,
  TextNode,
} from "lexical";
import {useEffect, useMemo, useRef} from "react";
import {useProjectContext} from "@/contexts/ProjectContext";
import {USFMElementNode} from "@/features/editor/nodes/USFMElementNode";
import {USFMDecoratorNode} from "@/features/editor/nodes/USFMMarkerDecoratorNode";
import {USFMNestedEditorNode} from "@/features/editor/nodes/USFMNestedEditorDecorator";
import {USFMTextNode} from "@/features/editor/nodes/USFMTextNode";
import {UseLineBreaks} from "@/features/editor/plugins/AdjustLineBreaks";
import {DecoratorFocusPlugin} from "@/features/editor/plugins/DecoratorFocus";

export function ReferenceEditor() {
  const {
    referenceProjectQuery,
    currentFile,
    currentChapter,
    referenceProjectPath: referenceProjectId,
    allFiles,
    selectionSids,
  } = useProjectContext();

  const editorRef = useRef<LexicalEditor>(null);

  const referenceFile = useMemo(() => {
    const currentFileName = allFiles?.find(
      (f) => f.path === currentFile
    )?.identifier;
    return referenceProjectQuery.data?.find(
      (f) => f.identifier === currentFileName
    );
  }, [referenceProjectQuery.data, currentFile, allFiles]);
  const referenceChapter = useMemo(
    () => referenceFile?.chapters?.[currentChapter ?? ""],
    [referenceFile, currentChapter]
  );

  // Programmatically load content when referenceChapter changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!referenceChapter?.lexicalState || !editor) return;
    const editorState = editor.parseEditorState(referenceChapter.lexicalState);
    editor.setEditorState(editorState, {tag: "programmatic"});
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
  }, [referenceChapter]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.update(() => {
      // 1. Clear all highlights
      for (const {node} of $dfsIterator()) {
        if (
          "getSid" in node &&
          typeof node.getSid === "function" &&
          node instanceof TextNode
        ) {
          node.getWritable().setStyle(""); // wipe styles
        } else if (node instanceof TextNode) {
          node.getWritable().setStyle(""); // in case some text nodes had inline style
        }
      }

      if (!selectionSids || selectionSids.size === 0) return;
      const firstSid = selectionSids.values().next().value;
      let firstDomEl = null;

      // 2. Apply highlight for matching sids
      for (const {node} of $dfsIterator()) {
        if ("getSid" in node && typeof node.getSid === "function") {
          const sid = node.getSid() as string;
          if (sid && selectionSids.has(sid) && node instanceof TextNode) {
            node.getWritable().setStyle("background-color: lightgray;");
            if (!firstDomEl) {
              firstDomEl = editor.getElementByKey(node.getKey());
              firstDomEl?.scrollIntoView({block: "start", behavior: "smooth"});
            }
          }
        }
      }
      // 3. Scroll first one into view:
    });
  }, [selectionSids]);

  if (!referenceProjectId) return null;
  if (referenceProjectQuery.isLoading) {
    return <div>Loading reference project…</div>;
  }
  if (referenceProjectQuery.isError) {
    return (
      <div>
        Error loading reference project: {String(referenceProjectQuery.error)}
      </div>
    );
  }
  if (!referenceProjectQuery.data) {
    return <div>No reference project found</div>;
  }
  if (!referenceChapter) {
    return (
      <div>
        No reference chapter found for {currentFile} {currentChapter}
      </div>
    );
  }

  const initialConfig = {
    namespace: "USFMReferenceEditor",
    editable: false, // read-only
    nodes: [
      USFMElementNode,
      USFMTextNode,
      ParagraphNode,
      USFMDecoratorNode,
      LineBreakNode,
      USFMNestedEditorNode,
    ],
    theme: {
      text: {bold: "font-bold", italic: "italic", underline: "underline"},
      paragraph: "my-2",
      usfmElement: "usfm-element",
      usfmText: "usfm-text",
    },
    onError: console.error,
  };

  return (
    <div
      data-js="reference-editor-container"
      className="reference-editor-container relative h-full border rounded-lg overflow-hidden max-w-[80ch] w-[75ch]"
    >
      <LexicalComposer initialConfig={initialConfig}>
        <div className="h-full max-h-[80vh] overflow-auto p-4 bg-gray-50">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="min-h-full focus:outline-none p-4 w-full"
                aria-label="Reference Editor"
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <EditorRefPlugin editorRef={editorRef} />
        <DecoratorFocusPlugin />
        <UseLineBreaks />
      </LexicalComposer>
    </div>
  );
}
