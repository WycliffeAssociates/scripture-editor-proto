import {
    type InitialConfigType,
    LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
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
import { CustomHistoryPlugin } from "@/app/domain/editor/plugins/CustomHistoryPlugin.tsx";
import { StructuralEmptyMarkerChipsPlugin } from "@/app/domain/editor/plugins/StructuralEmptyMarkerChipsPlugin.tsx";
import { USFMPlugin } from "@/app/domain/editor/plugins/USFMPlugin.tsx";
import { UsfmPeekOverlayPlugin } from "@/app/domain/editor/plugins/UsfmPeekOverlayPlugin.tsx";
import { UsfmStylesPlugin } from "@/app/domain/editor/plugins/UsfmStylesPlugin.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as shellStyles from "@/app/ui/styles/modules/EditorShell.css.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function MainEditor() {
    const { editorRef, project, search } = useWorkspaceContext();

    return (
        <div
            className={shellStyles.editorOuter}
            data-mode={project?.appSettings.editorMode}
        >
            <LexicalComposer initialConfig={getIntialConfig()}>
                <div
                    data-js="editor-container"
                    data-testid={TESTING_IDS.mainEditorContainer}
                    className={`editor-container ${shellStyles.editorContainer}`}
                >
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className={`${shellStyles.contentEditable} ${
                                    search.isSearchPaneOpen
                                        ? shellStyles.contentEditableSearchOpen
                                        : ""
                                }`}
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
                <CustomHistoryPlugin />
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
                <StructuralEmptyMarkerChipsPlugin />
                <UsfmPeekOverlayPlugin />
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
