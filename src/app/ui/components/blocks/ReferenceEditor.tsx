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
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { StructuralEmptyMarkerChipsPlugin } from "@/app/domain/editor/plugins/StructuralEmptyMarkerChipsPlugin.tsx";
import { USFMPlugin } from "@/app/domain/editor/plugins/USFMPlugin.tsx";
import { UsfmStylesPlugin } from "@/app/domain/editor/plugins/UsfmStylesPlugin.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as shellStyles from "@/app/ui/styles/modules/EditorShell.css.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

export function ReferenceEditor() {
    const { t } = useLingui();
    const { referenceProject } = useWorkspaceContext();
    const nestedEditorRef = useRef<LexicalEditor>(null);
    const { referenceQuery, referenceProjectId: referenceProjectPath } =
        referenceProject;
    const { referenceChapter } = referenceProject;

    useEffect(() => {
        if (!referenceChapter) return;
        const editor = nestedEditorRef.current;
        if (!editor) return;

        const clonedState = structuredClone(referenceChapter.lexicalState);

        editor.setEditorState(editor.parseEditorState(clonedState), {
            tag: HISTORY_MERGE_TAG,
        });
    }, [referenceChapter]);

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
        <LexicalComposer initialConfig={getIntialConfig()}>
            <EditorRefPlugin editorRef={nestedEditorRef} />
            <div
                data-testid={TESTING_IDS.refEditorContainer}
                data-testing-ref-chapter={referenceChapter?.chapNumber}
                data-testing-ref-bookcode={referenceProject?.referenceFile?.bookCode.toLowerCase()}
                data-js="reference-editor-container"
                className={`editor-container ${shellStyles.editorContainer}`}
            >
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable
                            className={shellStyles.contentEditableReference}
                            aria-label={t`USFM Editor`}
                        />
                    }
                    ErrorBoundary={LexicalErrorBoundary}
                />
            </div>
            <USFMPlugin />
            <StructuralEmptyMarkerChipsPlugin />
            <UsfmStylesPlugin />
        </LexicalComposer>
    );
}

function getIntialConfig(): InitialConfigType {
    return {
        namespace: "USFMEditor-Reference",
        editable: false,
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
