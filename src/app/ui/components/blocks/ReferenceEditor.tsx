import {
    type InitialConfigType,
    LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLingui } from "@lingui/react/macro";
import { Group, Switch } from "@mantine/core";
import {
    HISTORY_MERGE_TAG,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { StructuralEmptyMarkerChipsPlugin } from "@/app/domain/editor/plugins/StructuralEmptyMarkerChipsPlugin.tsx";
import { UsfmStylesPlugin } from "@/app/domain/editor/plugins/UsfmStylesPlugin.tsx";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as shellStyles from "@/app/ui/styles/modules/EditorShell.css.ts";
import * as projectViewStyles from "@/app/ui/styles/modules/Projectview.css.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { ReferencePicker } from "./ReferencePicker.tsx";

export function ReferenceEditor() {
    const { t } = useLingui();
    const { referenceProject, search, referenceEditorRef } =
        useWorkspaceContext();
    const { referenceQuery, referenceProjectId: referenceProjectPath } =
        referenceProject;
    const { referenceChapter } = referenceProject;

    useEffect(() => {
        if (!referenceChapter) return;
        const editor = referenceEditorRef.current;
        if (!editor) return;

        editor.setEditable(false);
        const clonedState = structuredClone(referenceChapter.lexicalState);

        editor.setEditorState(editor.parseEditorState(clonedState), {
            tag: HISTORY_MERGE_TAG,
        });
    }, [referenceChapter, referenceEditorRef]);

    if (!referenceProjectPath) {
        return null;
    }
    if (referenceQuery?.isLoading) {
        return (
            <div className={shellStyles.loadingReference}>
                Loading {referenceProjectPath}...
            </div>
        );
    }
    if (referenceQuery?.error) {
        return (
            <div className={shellStyles.loadingReference}>
                Failed to load {referenceProjectPath}
            </div>
        );
    }
    return (
        <>
            <div
                className={projectViewStyles.referenceStickyNav}
                data-testid={TESTING_IDS.reference.stickyNav}
            >
                <Group className={projectViewStyles.referenceStickyNavRow}>
                    <Switch
                        wrapperProps={{
                            "data-testid":
                                TESTING_IDS.reference.syncNavigationToggle,
                        }}
                        label="Sync navigation"
                        checked={referenceProject.isReferenceNavSynced}
                        onChange={(event) =>
                            referenceProject.setReferenceNavigationSynced(
                                event.currentTarget.checked,
                            )
                        }
                    />
                    <Switch
                        wrapperProps={{
                            "data-testid":
                                TESTING_IDS.reference.syncScrollingToggle,
                        }}
                        label="Sync scrolling"
                        checked={referenceProject.isReferenceScrollSynced}
                        disabled={!referenceProject.isReferenceNavSynced}
                        onChange={(event) =>
                            referenceProject.setReferenceScrollingSynced(
                                event.currentTarget.checked,
                            )
                        }
                    />
                    <ReferencePicker
                        scope="reference"
                        bookCode={referenceProject.referenceBookCode}
                        chapter={referenceProject.referenceChapterNumber}
                        workingFiles={referenceProject.parsedFiles}
                        onSwitchBookOrChapter={
                            referenceProject.switchReferenceBookOrChapter
                        }
                        onGoToReference={
                            referenceProject.goToReferenceInReference
                        }
                        disabled={referenceProject.isReferenceNavSynced}
                    />
                    <ActionIconSimple
                        aria-label={t`Previous chapter`}
                        title={t`Previous chapter`}
                        data-testid={TESTING_IDS.reference.prevButton}
                        disabled={
                            referenceProject.isReferenceNavSynced ||
                            !referenceProject.hasPrevReferenceChapter
                        }
                        onClick={() =>
                            referenceProject.goToPrevReferenceChapter()
                        }
                    >
                        <ChevronLeft size={16} />
                    </ActionIconSimple>
                    <ActionIconSimple
                        aria-label={t`Next chapter`}
                        title={t`Next chapter`}
                        data-testid={TESTING_IDS.reference.nextButton}
                        disabled={
                            referenceProject.isReferenceNavSynced ||
                            !referenceProject.hasNextReferenceChapter
                        }
                        onClick={() =>
                            referenceProject.goToNextReferenceChapter()
                        }
                    >
                        <ChevronRight size={16} />
                    </ActionIconSimple>
                </Group>
            </div>
            <LexicalComposer initialConfig={getIntialConfig()}>
                <EditorRefPlugin editorRef={referenceEditorRef} />
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
                                className={`${shellStyles.contentEditableReference} ${
                                    search.isSearchPaneOpen
                                        ? shellStyles.contentEditableReferenceSearchOpen
                                        : ""
                                }`}
                                aria-label={t`USFM Editor`}
                            />
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>
                <StructuralEmptyMarkerChipsPlugin />
                <UsfmStylesPlugin />
            </LexicalComposer>
        </>
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
            ParagraphNode,
            LineBreakNode,
            USFMNestedEditorNode,
        ],
        onError: console.error,
    };
}
