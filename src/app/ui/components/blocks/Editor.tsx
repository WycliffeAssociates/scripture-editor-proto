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
import { TESTING_IDS } from "@/app/data/constants.ts";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { NodeContextMenuPlugin } from "@/app/domain/editor/plugins/ContextMenuPlugin.tsx";
import { ParagraphingGhost } from "@/app/domain/editor/plugins/ParagraphingGhost.tsx";
import { ParagraphingPlugin } from "@/app/domain/editor/plugins/ParagraphingPlugin.tsx";
import {
    MarkerTooltip,
    // ToolTipPlugin,
} from "@/app/domain/editor/plugins/ToolTipPlugin.tsx";
import { USFMPlugin } from "@/app/domain/editor/plugins/USFMPlugin.tsx";
import { UsfmStylesPlugin } from "@/app/domain/editor/plugins/UsfmStylesPlugin.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function MainEditor() {
    const { editorRef, project } = useWorkspaceContext();

    return (
        <div className="p-2" data-mode={project?.appSettings.mode}>
            <MarkerTooltip />
            <LexicalComposer initialConfig={getIntialConfig()}>
                <div
                    data-js="editor-container"
                    data-testid={TESTING_IDS.mainEditorContainer}
                    className="editor-container relative"
                >
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className="focus:outline-none p-1 w-full md:px-2"
                                aria-label="USFM Editor"
                                spellCheck={false}
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
                <NodeContextMenuPlugin />
                <ParagraphingPlugin />
                <ParagraphingGhost />
            </LexicalComposer>
        </div>
    );
}

function getIntialConfig(): InitialConfigType {
    return {
        namespace: "USFMEditor",
        nodes: [
            USFMParagraphNode,
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
