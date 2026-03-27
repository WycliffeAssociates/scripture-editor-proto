import {
    type InitialConfigType,
    LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLingui } from "@lingui/react/macro";
import { Group, Stack, Switch, Text, Title } from "@mantine/core";
import {
    HISTORY_MERGE_TAG,
    LineBreakNode,
    ParagraphNode,
    TextNode,
} from "lexical";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ChangeEvent, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
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

/**
 * Small loading/error placeholder used by both reference-item renderers.
 *
 * The reference column can show scripture or translation notes, so the shell
 * stays shared while each item type provides its own content view.
 */
function ReferenceLoadingState(props: { message: string }) {
    return <div className={shellStyles.loadingReference}>{props.message}</div>;
}

/**
 * Translation-notes renderer for the reference column.
 *
 * The workspace has already narrowed the active reference item to
 * `translationNotes`, so this component can focus on chapter note retrieval and
 * markdown rendering without carrying scripture editor concerns.
 */
function TranslationNotesReferencePane() {
    const { t } = useLingui();
    const { referenceResource } = useWorkspaceContext();
    const { translationNotesQuery, referenceBookCode, referenceChapterNumber } =
        referenceResource;
    const activeNotes = translationNotesQuery.data ?? [];

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
                        checked={referenceResource.isReferenceNavSynced}
                        onChange={(event) =>
                            referenceResource.setReferenceNavigationSynced(
                                event.currentTarget.checked,
                            )
                        }
                    />
                    <Text size="sm" c="dimmed">
                        {referenceBookCode} {referenceChapterNumber}
                    </Text>
                </Group>
            </div>

            <div
                data-testid={TESTING_IDS.refEditorContainer}
                className={shellStyles.translationNotesContainer}
            >
                {translationNotesQuery.isLoading ? (
                    <ReferenceLoadingState
                        message={t`Loading translation notes for ${referenceBookCode} ${referenceChapterNumber}...`}
                    />
                ) : translationNotesQuery.error ? (
                    <ReferenceLoadingState
                        message={t`Failed to load translation notes for ${referenceBookCode} ${referenceChapterNumber}`}
                    />
                ) : activeNotes.length === 0 ? (
                    <ReferenceLoadingState
                        message={t`No translation notes for ${referenceBookCode} ${referenceChapterNumber}.`}
                    />
                ) : (
                    <Stack gap="md">
                        {activeNotes.map((note) => (
                            <section
                                key={note.documentId}
                                className={shellStyles.translationNoteCard}
                            >
                                <Title order={5}>
                                    Verse {note.verseNumber}
                                </Title>
                                <div
                                    className={shellStyles.translationNoteBody}
                                >
                                    <ReactMarkdown>
                                        {note.rawMarkdown}
                                    </ReactMarkdown>
                                </div>
                            </section>
                        ))}
                    </Stack>
                )}
            </div>
        </>
    );
}

/**
 * Read-only scripture renderer for the reference column.
 *
 * This reuses the Lexical/USFM visual shell so the reference pane looks like the
 * main editor, but it intentionally hydrates a non-editable editor state from
 * the loaded scripture item.
 */
function ScriptureReferencePane() {
    const { t } = useLingui();
    const { referenceResource, search, referenceEditorRef } =
        useWorkspaceContext();
    const { referenceChapter } = referenceResource;

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
                        checked={referenceResource.isReferenceNavSynced}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            referenceResource.setReferenceNavigationSynced(
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
                        checked={referenceResource.isReferenceScrollSynced}
                        disabled={!referenceResource.isReferenceNavSynced}
                        onChange={(event) =>
                            referenceResource.setReferenceScrollingSynced(
                                event.currentTarget.checked,
                            )
                        }
                    />
                    <ReferencePicker
                        scope="reference"
                        bookCode={referenceResource.referenceBookCode}
                        chapter={referenceResource.referenceChapterNumber}
                        workingFiles={referenceResource.parsedFiles}
                        onSwitchBookOrChapter={
                            referenceResource.switchReferenceBookOrChapter
                        }
                        onGoToReference={
                            referenceResource.goToReferenceInReference
                        }
                        disabled={referenceResource.isReferenceNavSynced}
                    />
                    <ActionIconSimple
                        aria-label={t`Previous chapter`}
                        title={t`Previous chapter`}
                        data-testid={TESTING_IDS.reference.prevButton}
                        disabled={
                            referenceResource.isReferenceNavSynced ||
                            !referenceResource.hasPrevReferenceChapter
                        }
                        onClick={() =>
                            referenceResource.goToPrevReferenceChapter()
                        }
                    >
                        <ChevronLeft size={16} />
                    </ActionIconSimple>
                    <ActionIconSimple
                        aria-label={t`Next chapter`}
                        title={t`Next chapter`}
                        data-testid={TESTING_IDS.reference.nextButton}
                        disabled={
                            referenceResource.isReferenceNavSynced ||
                            !referenceResource.hasNextReferenceChapter
                        }
                        onClick={() =>
                            referenceResource.goToNextReferenceChapter()
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
                    data-testing-ref-chapter={referenceChapter?.chapterNumber}
                    data-testing-ref-bookcode={referenceResource?.referenceFile?.bookCode.toLowerCase()}
                    data-js={DATA_JS.referenceEditorContainer}
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

export function ReferenceEditor() {
    const { referenceResource } = useWorkspaceContext();
    const {
        activeReferenceResource,
        activeReferenceResourcePath,
        activeReferenceResourceQuery,
        referenceQuery,
        supportsReferenceAnchors,
        supportsScriptureNavigation,
    } = referenceResource;

    if (!activeReferenceResourcePath) {
        return null;
    }
    const isScriptureReference =
        activeReferenceResource?.type === "usfmScripture";
    const activeContentQuery = isScriptureReference ? referenceQuery : null;
    const activeDisplayName =
        activeReferenceResource?.displayName ?? activeReferenceResourcePath;

    if (
        activeReferenceResourceQuery?.isLoading ||
        activeContentQuery?.isLoading
    ) {
        return (
            <ReferenceLoadingState
                message={`Loading ${activeReferenceResourcePath}...`}
            />
        );
    }
    if (activeReferenceResourceQuery?.error || activeContentQuery?.error) {
        return (
            <ReferenceLoadingState
                message={`Failed to load ${activeReferenceResourcePath}`}
            />
        );
    }

    switch (activeReferenceResource?.type) {
        case "translationNotes":
            return <TranslationNotesReferencePane />;
        case "usfmScripture":
            return <ScriptureReferencePane />;
        default:
            break;
    }

    if (!supportsScriptureNavigation) {
        return (
            <ReferenceLoadingState
                message={`${activeDisplayName} ${
                    !supportsReferenceAnchors
                        ? "does not support scripture navigation yet."
                        : "does not support this reference mode yet."
                }`}
            />
        );
    }
    return <ScriptureReferencePane />;
}

/**
 * Lexical configuration for the read-only scripture reference pane.
 *
 * It mirrors the main scripture node set so rendered USFM looks consistent
 * across editable and read-only surfaces.
 */
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
