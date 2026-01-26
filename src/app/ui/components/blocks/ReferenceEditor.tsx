import {
    type InitialConfigType,
    LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLingui } from "@lingui/react/macro";
import {
    HISTORY_MERGE_TAG,
    type LexicalEditor,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { useEffect, useRef } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import {
    EditorMarkersMutableStates,
    EditorMarkersViewStates,
} from "@/app/data/editor.ts";
import { USFMElementNode } from "@/app/domain/editor/nodes/USFMElementNode.ts";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { USFMPlugin } from "@/app/domain/editor/plugins/USFMPlugin.tsx";
import { UsfmStylesPlugin } from "@/app/domain/editor/plugins/UsfmStylesPlugin.tsx";
import { adjustSerializedLexicalNodes } from "@/app/domain/editor/utils/modeAdjustments.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function ReferenceEditor() {
    const { t } = useLingui();
    const { referenceProject, project } = useWorkspaceContext();
    const nestedEditorRef = useRef<LexicalEditor>(null);
    const { referenceQuery, referenceProjectId: referenceProjectPath } =
        referenceProject;
    const { referenceChapter } = referenceProject;
    const { appSettings } = project;

    useEffect(() => {
        if (!referenceChapter) return;
        const editor = nestedEditorRef.current;
        if (!editor) return;

        const { markersViewState, markersMutableState } = appSettings;

        const hide =
            markersViewState === EditorMarkersViewStates.NEVER ||
            markersViewState === EditorMarkersViewStates.WHEN_EDITING;

        const isMutable =
            markersViewState === EditorMarkersViewStates.NEVER
                ? EditorMarkersMutableStates.IMMUTABLE
                : markersMutableState;

        const adjustedState = structuredClone(referenceChapter.lexicalState);
        adjustedState.root.children = adjustedState.root.children.flatMap(
            (node) => {
                return adjustSerializedLexicalNodes(node, {
                    show: !hide,
                    isMutable: isMutable === EditorMarkersMutableStates.MUTABLE,
                });
            },
        );

        editor.setEditorState(editor.parseEditorState(adjustedState), {
            tag: HISTORY_MERGE_TAG,
        });
    }, [referenceChapter, appSettings]);

    if (!referenceProjectPath) {
        return null;
    }
    if (referenceQuery?.isLoading) {
        return <div>Loading {referenceProjectPath}...</div>;
    }
    if (referenceQuery?.error) {
        return <div>Failed to load {referenceProjectPath}</div>;
    }
    return (
        <div className="h-full overflow-y-auto">
            <LexicalComposer initialConfig={getIntialConfig()}>
                <EditorRefPlugin editorRef={nestedEditorRef} />
                <div
                    data-testid={TESTING_IDS.refEditorContainer}
                    data-testing-ref-chapter={referenceChapter?.chapNumber}
                    data-testing-ref-bookcode={referenceProject?.referenceFile?.bookCode.toLowerCase()}
                    data-js="reference-editor-container"
                    className="editor-container relative h-full overflow-y-auto"
                >
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className="min-h-full focus:outline-none p-4 w-full"
                                aria-label={t`USFM Editor`}
                            />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>
                <USFMPlugin />
                <UsfmStylesPlugin />
            </LexicalComposer>
        </div>
    );
}

function getIntialConfig(): InitialConfigType {
    return {
        namespace: "USFMEditor-Reference",
        editable: false,
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
