import {
    type InitialConfigType,
    LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { LineBreakNode, ParagraphNode, TextNode } from "lexical";
import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import { BookFrontmatterFormNode } from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import { FormBlockNode } from "@/app/domain/editor/nodes/FormBlockNode.tsx";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { NodeContextMenuPlugin } from "@/app/domain/editor/plugins/ContextMenuPlugin.tsx";
import { CustomHistoryPlugin } from "@/app/domain/editor/plugins/CustomHistoryPlugin.tsx";
import { HighlightSink } from "@/app/domain/editor/plugins/HighlightSink.tsx";
import { USFMPlugin } from "@/app/domain/editor/plugins/USFMPlugin.tsx";
import { UsfmPeekOverlayPlugin } from "@/app/domain/editor/plugins/UsfmPeekOverlayPlugin.tsx";
import { UsfmStylesPlugin } from "@/app/domain/editor/plugins/UsfmStylesPlugin.tsx";
import { WorkingFilesBridgePlugin } from "@/app/domain/editor/plugins/WorkingFilesBridgePlugin.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as shellStyles from "@/app/ui/styles/modules/EditorShell.css.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

/**
 * Main editable scripture surface.
 *
 * The route and workspace provider have already narrowed the current item to an
 * editable scripture workspace before this component renders. That lets this
 * component stay focused on mounting the Lexical editor shell and the plugins
 * that keep it aligned with USFM semantics.
 */
export function MainEditor() {
    const { editorRef, project, save, search } = useWorkspaceContext();
    const isSwitchingVersion = save.versions.isSwitching;

    return (
        <div className={shellStyles.editorOuter}>
            <LexicalComposer initialConfig={getIntialConfig()}>
                <div
                    data-js={DATA_JS.editorContainer}
                    data-testid={TESTING_IDS.mainEditorContainer}
                    className={`editor-container ${shellStyles.editorContainer} ${
                        isSwitchingVersion
                            ? shellStyles.editorContainerSwitching
                            : ""
                    }`}
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
                                data-mode={
                                    project?.appSettings.editorMode === "view"
                                        ? "regular"
                                        : project?.appSettings.editorMode
                                }
                                data-form-pane="source"
                                spellCheck={false}
                            />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>
                {isSwitchingVersion ? (
                    <div className={shellStyles.switchingOverlay}>
                        <span className={shellStyles.switchingOverlaySpinner} />
                        <span>Switching version...</span>
                    </div>
                ) : null}
                <EditorRefPlugin editorRef={editorRef} />
                {/* TODO: KILL THE DEAD CODE AT SOME POINT */}
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
                <UsfmPeekOverlayPlugin />
                <HighlightSink />
                <WorkingFilesBridgePlugin />
            </LexicalComposer>
        </div>
    );
}

/**
 * Lexical configuration for the main scripture editor.
 *
 * This is the point where the generic Lexical runtime is taught about the
 * custom USFM node model the rest of the editor pipeline expects.
 */
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
            LineBreakNode,
            BookFrontmatterFormNode,
            FormBlockNode,
            // footnoes and x-notes
            USFMNestedEditorNode,
        ],
        onError: console.error,
    };
}
