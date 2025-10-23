import {
  $getNodeByKey,
  $getRoot,
  type EditorState,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import {UsfmTokenTypes} from "@/app/data/editor";
import type {
  USFMNestedEditorNode,
  USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  $isVerseRangeTextNode,
  type SerializedUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import {guidGenerator} from "@/core/data/utils/generic";
import {lintExistingUsfmTokens} from "@/core/domain/usfm/parse";
import {initParseContext} from "@/core/domain/usfm/tokenParsers";

type LintVersesArgs = {
  editorState: EditorState;
  editor: LexicalEditor;
};

export function lintAll(
  {editorState, editor}: LintVersesArgs,
  getFlatFileTokens: (
    currentEditorState: SerializedEditorState
  ) => Array<SerializedUSFMTextNode | USFMNestedEditorNodeJSON>
) {
  const flatFileTokens = getFlatFileTokens(editorState.toJSON());
  const ctx = initParseContext(flatFileTokens);
  const lintErrors = lintExistingUsfmTokens(flatFileTokens, ctx);
  const withErrorsInThisBook = ctx.parseTokens.filter(
    (t) => t.lintErrors?.length && t.lexicalKey
  );
  if (withErrorsInThisBook.length) {
    const updateFxns: (() => void)[] = [];
    editor.read(() => {
      withErrorsInThisBook.forEach((t) => {
        const nodeOfThisKey = $getNodeByKey(t.lexicalKey ?? "") as
          | USFMNestedEditorNode
          | USFMTextNode;
        // if no node, probably belongs to differnt chapter in this book.  noop
        const needsUpdate = nodeOfThisKey?.lintErrorsDoNeedUpdate(
          t.lintErrors ?? []
        );
        if (needsUpdate) {
          updateFxns.push(() =>
            nodeOfThisKey.setLintErrors(t.lintErrors ?? [])
          );
        }
      });
    });
    if (updateFxns.length) {
      editor.update(
        () => {
          updateFxns.forEach((fxn) => {
            fxn();
          });
        },
        {
          skipTransforms: true,
          tag: [HISTORY_MERGE_TAG],
        }
      );
    }
  }
  return lintErrors;
}

export function ensurePlainTextNodeAlwaysFollowsVerseRange({
  editorState,
  editor,
}: LintVersesArgs) {
  const updates: Array<() => void> = [];
  editorState.read(() => {
    const root = $getRoot();
    root.getAllTextNodes().forEach((node) => {
      if (!$isVerseRangeTextNode(node)) return;
      const next = node.getNextSibling();
      if (
        !next ||
        !$isUSFMTextNode(next) ||
        next.getTokenType() !== UsfmTokenTypes.text
      ) {
        updates.push(() => {
          const emptySibling = $createUSFMTextNode(" ", {
            id: guidGenerator(),
            sid: node.getSid().trim(),
            inPara: node.getInPara(),
            tokenType: UsfmTokenTypes.text,
          });
          node.insertAfter(emptySibling);
        });
      }
    });
  });
  editor.update(
    () => {
      updates.forEach((update) => {
        update();
      });
    },
    {
      skipTransforms: true,
      tag: [HISTORY_MERGE_TAG],
    }
  );
}
export function ensureVerseRangeAlwaysFollowsVerseMarker({
  editorState,
  editor,
}: LintVersesArgs) {
  const updates: Array<() => void> = [];
  editorState.read(() => {
    const root = $getRoot();
    root.getAllTextNodes().forEach((node) => {
      if (!$isUSFMTextNode(node)) return;
      const hasVerseMarker = node.getMarker() === "v";
      if (!hasVerseMarker) return;
      const next = node.getNextSibling();
      if ($isVerseRangeTextNode(next)) return;
      updates.push(() => {
        const emptySibling = $createUSFMTextNode(" ", {
          id: guidGenerator(),
          sid: node.getSid().trim(),
          inPara: node.getInPara(),
          tokenType: UsfmTokenTypes.numberRange,
        });
        node.insertAfter(emptySibling);
      });
    });
  });
  editor.update(
    () => {
      updates.forEach((update) => {
        update();
      });
    },
    {
      skipTransforms: true,
      tag: [HISTORY_MERGE_TAG],
    }
  );
}
