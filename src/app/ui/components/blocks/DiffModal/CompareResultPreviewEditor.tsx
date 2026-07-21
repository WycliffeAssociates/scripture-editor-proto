import {
  type InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { t } from "@lingui/core/macro";
import {
  HISTORY_MERGE_TAG,
  LineBreakNode,
  ParagraphNode,
  type LexicalEditor,
  TextNode,
} from "lexical";
import { useEffect, useRef } from "react";

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
import * as shellStyles from "@/app/ui/styles/modules/EditorShell.css.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Lexical configuration for this read-only preview. Mirrors the reference
 * pane's node set (`ReferenceEditor.tsx`) so the same USFM node types hydrate
 * identically wherever a read-only surface renders them.
 */
function getInitialConfig(): InitialConfigType {
  return {
    namespace: "USFMEditor-ComparePreview",
    editable: false,
    nodes: [
      USFMParagraphNode,
      USFMTextNode,
      USFMNumberedMarkerNode,
      {
        replace: TextNode,
        with: (node: TextNode) =>
          $createUSFMTextNode(node.getTextContent(), {
            id: guidGenerator(),
            sid: "",
            inPara: "",
          }),
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

/**
 * Read-only rendering of a decided chapter's projected result — the same
 * USFM node/visual pipeline as the main editor (verse-number superscripts,
 * paragraph structure), never a plain preformatted text dump. Hydrates
 * imperatively via an editor ref, matching `ReferenceEditor.tsx`'s pattern,
 * since the tokens change out from under an already-mounted composer.
 */
export function CompareResultPreviewEditor({
  tokens,
  direction,
}: {
  tokens: readonly Token[];
  direction: LanguageDirection | null;
}) {
  const editorRef = useRef<LexicalEditor | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const state = tokensToLexical({
      tokens: [...tokens],
      direction: direction ?? "ltr",
      mode: "regular",
    });
    editor.setEditorState(editor.parseEditorState(state), {
      tag: HISTORY_MERGE_TAG,
    });
  }, [tokens, direction]);

  return (
    <div className={shellStyles.referenceEditorRoot}>
      <div className={shellStyles.referenceEditorOuter}>
        <LexicalComposer initialConfig={getInitialConfig()}>
          <EditorRefPlugin editorRef={editorRef} />
          <div className={`editor-container ${shellStyles.editorContainer}`}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={shellStyles.contentEditableReference}
                  aria-label={t`Result preview`}
                  data-mode="regular"
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
