import {
  type InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  HISTORY_MERGE_TAG,
  LineBreakNode,
  ParagraphNode,
  TextNode,
} from "lexical";
import { BookOpenText } from "lucide-react";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";

import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import {
  domPresentationMode,
  EDITOR_MODES,
  shapeForSurface,
} from "@/app/data/editor.ts";
import { BookFrontmatterFormNode } from "@/app/domain/editor/nodes/BookFrontmatterFormNode.tsx";
import { FormBlockNode } from "@/app/domain/editor/nodes/FormBlockNode.tsx";
import { USFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { USFMNumberedMarkerNode } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import { USFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
  $createUSFMTextNode,
  USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { UsfmStylesPlugin } from "@/app/domain/editor/plugins/UsfmStylesPlugin.tsx";
import { tokensToLexical } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as shellStyles from "@/app/ui/styles/modules/EditorShell.css.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

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
 * Shown when the reference column has nothing selected. The message depends on
 * whether any reference texts exist on device: nudge toward downloading one
 * when there are none, otherwise toward picking from the selector above.
 */
function ReferenceEmptyState(props: { hasAnyOnDevice: boolean }) {
  return (
    <div className={shellStyles.referenceEmptyState}>
      <BookOpenText
        size={28}
        className={shellStyles.referenceEmptyIcon}
        aria-hidden="true"
      />
      <p className={shellStyles.referenceEmptyText}>
        {props.hasAnyOnDevice ? (
          <Trans>
            Choose a resource from the picker above to read it alongside your
            project.
          </Trans>
        ) : (
          <Trans>Download a resource to read it alongside your project.</Trans>
        )}
      </p>
    </div>
  );
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
    <div className={shellStyles.referenceEditorRoot}>
      <div
        className={shellStyles.referenceEditorOuter}
        data-js={DATA_JS.referenceEditorScrollContainer}
        data-testid={TESTING_IDS.refNotesContainer}
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {activeNotes.map((note) => (
              <section
                key={note.documentId}
                className={shellStyles.translationNoteCard}
              >
                <h5>
                  <Trans>Verse {note.verseNumber}</Trans>
                </h5>
                <div className={shellStyles.translationNoteBody}>
                  <ReactMarkdown>{note.rawMarkdown}</ReactMarkdown>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
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
  const { referenceResource, search, referenceEditorRef, project } =
    useWorkspaceContext();
  const { referenceChapter } = referenceResource;
  const editorMode = project?.appSettings.editorMode ?? EDITOR_MODES.regular;
  const referenceShape = shapeForSurface("referencePane", editorMode);

  useEffect(() => {
    if (!referenceChapter) return;
    const editor = referenceEditorRef.current;
    if (!editor) return;

    editor.setEditable(false);
    const clonedState = tokensToLexical({
      tokens: referenceChapter.currentTokens,
      direction: referenceChapter.direction,
      mode: referenceShape,
    });

    editor.setEditorState(editor.parseEditorState(clonedState), {
      tag: HISTORY_MERGE_TAG,
    });
  }, [referenceChapter, referenceEditorRef, referenceShape]);

  return (
    <div className={shellStyles.referenceEditorRoot}>
      <div
        className={shellStyles.referenceEditorOuter}
        data-js={DATA_JS.referenceEditorScrollContainer}
      >
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
                  aria-label={t`USFM Resource Editor`}
                  data-mode={domPresentationMode(editorMode)}
                  data-form-pane="reference"
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>
          <UsfmStylesPlugin />
        </LexicalComposer>
      </div>
    </div>
  );
}

export function ReferenceEditor() {
  const { t } = useLingui();
  const { referenceResource } = useWorkspaceContext();
  const {
    activeReferenceResource,
    activeReferenceResourcePath,
    activeReferenceResourceQuery,
    referenceResourcesQuery,
    referenceQuery,
    supportsReferenceAnchors,
    supportsScriptureNavigation,
  } = referenceResource;

  if (!activeReferenceResourcePath) {
    const hasAnyOnDevice = (referenceResourcesQuery.data?.length ?? 0) > 0;
    return <ReferenceEmptyState hasAnyOnDevice={hasAnyOnDevice} />;
  }
  const isScriptureReference =
    activeReferenceResource?.type === "usfmScripture";
  const activeContentQuery = isScriptureReference ? referenceQuery : null;
  const activeDisplayName =
    activeReferenceResource?.displayName ?? activeReferenceResourcePath;

  // Loading/error copy never leaks the on-disk path — fall back to the
  // resource's display name, or a generic phrase before it has loaded.
  if (
    activeReferenceResourceQuery?.isLoading ||
    activeContentQuery?.isLoading
  ) {
    return (
      <ReferenceLoadingState
        message={
          activeReferenceResource?.displayName
            ? t`Loading ${activeReferenceResource.displayName}…`
            : t`Loading resource…`
        }
      />
    );
  }
  if (activeReferenceResourceQuery?.error || activeContentQuery?.error) {
    return <ReferenceLoadingState message={t`Couldn't load this resource.`} />;
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
      USFMNumberedMarkerNode,
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
      BookFrontmatterFormNode,
      FormBlockNode,
      USFMNestedEditorNode,
    ],
    onError: console.error,
  };
}
