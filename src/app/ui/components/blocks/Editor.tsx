import {
    type InitialConfigType,
    LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { LineBreakNode, ParagraphNode, TextNode } from "lexical";
import { USFMElementNode } from "@/app/domain/editor/nodes/USFMElementNode";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import { NodeContextMenuPlugin } from "@/app/domain/editor/plugins/ContextMenuPlugin";
import {
    MarkerTooltip,
    // ToolTipPlugin,
} from "@/app/domain/editor/plugins/ToolTipPlugin";
import { USFMPlugin } from "@/app/domain/editor/plugins/USFMPlugin";
import { UsfmStylesPlugin } from "@/app/domain/editor/plugins/UsfmStylesPlugin";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext";
import { guidGenerator } from "@/core/data/utils/generic";

export function MainEditor() {
    const { editorRef } = useWorkspaceContext();

    return (
        <div className="h-full overflow-y-auto">
            <MarkerTooltip />
            <LexicalComposer initialConfig={getIntialConfig()}>
                <div
                    data-js="editor-container"
                    className="editor-container relative h-full overflow-y-auto"
                >
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className="min-h-full focus:outline-none p-4 w-full"
                                aria-label="USFM Editor"
                            />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>
                <EditorRefPlugin editorRef={editorRef} />
                {/* <DecoratorFocusPlugin /> */}
                {/* <UseLineBreaks /> */}
                <HistoryPlugin />
                {/* <LivePreviewSelectedNodesPlugin /> */}
                {/* <CustomOnChangePlugin
              ignoreHistoryMergeTagChange={true}
              tagsToIgnore={new Set(["programmatic"])}
              onSelectionChange={(editorState, editor, tags) => {
                editor.read(() => {
                  const selection = $getSelection();
                  if (!selection) return;
                  const nodesSelected = selection.getNodes();
                  const sids = new Set<string>();
                  nodesSelected.forEach((node) => {
                    if ("getSid" in node && typeof node.getSid === "function") {
                      const sid = node.getSid();
                      if (sid) sids.add(sid);
                    }
                  });
                  setSelectionSids(sids);
                });
              }}
              onChange={(editorState, editor, tags) => {
                setCurrentEditorState(editorState);
                if (tags.has("programmatic")) return;
                const json = editorState.toJSON();
                saveCurrentDirtyLexical(json);
              }}
            />
            {/* <SearchHighlightPlugin
              searchTerm={projectSearchTerm}
              currentEditorState={currentEditorState}
            /> */}
                <USFMPlugin />
                <UsfmStylesPlugin />
                <NodeContextMenuPlugin
                    items={[
                        {
                            title: "Insert \\v",
                            onSelect: () => console.log("Insert \\v"),
                        },
                        {
                            title: "Insert \\p",
                            onSelect: () => console.log("Insert \\p"),
                        },
                        {
                            title: "Split Section",
                            onSelect: () => console.log("Split Section"),
                        },
                    ]}
                />
            </LexicalComposer>
        </div>
    );
}

function getIntialConfig(): InitialConfigType {
    return {
        namespace: "USFMEditor",
        nodes: [
            USFMElementNode,
            USFMTextNode,
            {
                replace: TextNode,
                with: (node: TextNode) => {
                    return $createUSFMTextNode(node.getTextContent(), {
                        id: guidGenerator(),
                        sid: "",
                        inPara: "",
                    });
                },
                withKlass: USFMTextNode,
            },
            // only one, default container for chap
            ParagraphNode,
            // USFMDecoratorNode,
            LineBreakNode,
            // footnoes and x-notes
            USFMNestedEditorNode,
        ],
        onError: console.error,
    };
}
