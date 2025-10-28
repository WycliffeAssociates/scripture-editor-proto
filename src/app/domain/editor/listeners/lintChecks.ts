import {$dfs} from "@lexical/utils";
import {
  $getNodeByKey,
  $getRoot,
  type EditorState,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import {UsfmTokenTypes} from "@/app/data/editor";
import {
  $isUSFMNestedEditorNode,
  isSerializedUSFMNestedEditorNode,
  type USFMNestedEditorNode,
  type USFMNestedEditorNodeJSON,
} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  $isVerseRangeTextNode,
  isSerializedUSFMTextNode,
  type SerializedUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import type {LintableTokenLike} from "@/app/ui/hooks/useActions";
import type {LintError} from "@/core/data/usfm/lint";
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
  ) => Array<LintableTokenLike>
) {
  const flatFileTokens = getFlatFileTokens(editorState.toJSON());
  const ctx = initParseContext(flatFileTokens);
  const lintErrors = lintExistingUsfmTokens(flatFileTokens, ctx);
  const withErrorsInThisBook = ctx.errorMessages.reduce((acc, curr) => {
    if (!curr.nodeId) return acc;
    acc[curr.nodeId] ??= [];
    acc[curr.nodeId].push(curr);
    return acc;
  }, {} as Record<string, LintError[]>);
  const updateFxns: (() => void)[] = [];
  // ;
  dfsEditorStateForLint({
    editor,
    editorState,
    updatesToMainEditor: updateFxns,
    withErrorsInThisBook,
  });
  if (updateFxns.length) {
    editor.update(() => {
      updateFxns.forEach((fxn) => {
        fxn();
      });
    });
  }
  return lintErrors;
}

type DfsEditorStateForLintArgs = {
  editor: LexicalEditor;
  editorState: EditorState;
  updatesToMainEditor: Array<() => void>;
  withErrorsInThisBook: Record<string, LintError[]>;
};
export function dfsEditorStateForLint({
  editor,
  editorState,
  updatesToMainEditor,
  withErrorsInThisBook,
}: DfsEditorStateForLintArgs) {
  editorState.read(() => {
    for (const dfsNode of $dfs()) {
      const node = dfsNode.node;
      const isUsfmTextNode = $isUSFMTextNode(node);
      const isNestedEditorNode = $isUSFMNestedEditorNode(node);
      if (!isUsfmTextNode && !isNestedEditorNode) continue;

      const currentErrors = node.getLintErrors() ?? [];
      const matchInMap = withErrorsInThisBook[node.getId()];
      // clear if had errors but now does
      if (currentErrors.length && !matchInMap) {
        updatesToMainEditor.push(() => node.setLintErrors([]));
      }
      if (matchInMap?.length) {
        // update if needed
        const needsUpdate = node.lintErrorsDoNeedUpdate(matchInMap);
        if (needsUpdate) {
          updatesToMainEditor.push(() => node.setLintErrors(matchInMap));
        }
      }
      if ($isUSFMNestedEditorNode(node)) {
        const serialized = node.getLatestEditorState();
        const updated = lintNestedSerializedState(
          editor,
          serialized,
          withErrorsInThisBook
        );
        if (updated.changed) {
          updatesToMainEditor.push(() => {
            const writable = node.getWritable();
            writable.__editorState = updated.newState;
            writable.setRandomRenderKey();
          });
        }
      }
    }
  });
}
function dfs(node: any, map: Record<string, any>) {
  if (!node) return;
  if (node?.id) {
    map[node.id] = node;
  }
  if (node.children?.length) {
    for (const child of node.children) dfs(child, map);
  }
}
function lintNestedSerializedState(
  editor: LexicalEditor,
  state: SerializedEditorState,
  withErrorsInThisBook: Record<string, LintError[]>
): {changed: boolean; newState: SerializedEditorState} {
  const cloned = structuredClone(state);
  const parsed = editor.parseEditorState(state);

  const clonedMap: Record<string, any> = {};
  dfs(cloned.root, clonedMap);

  let nestedNeedsUpdate = false;
  parsed.read(() => {
    for (const dfsNode of $dfs()) {
      const node = dfsNode.node;
      const isUsfmTextNode = $isUSFMTextNode(node);
      const isNestedEditorNode = $isUSFMNestedEditorNode(node);
      if (!isUsfmTextNode && !isNestedEditorNode) continue;

      const currentErrors = node.getLintErrors() ?? [];
      const matchInMap = withErrorsInThisBook[node.getId()];
      const serializedVersion = clonedMap[
        node.getId()
      ] as SerializedUSFMTextNode;
      // clear if had errors but now does
      if (currentErrors.length && !matchInMap) {
        nestedNeedsUpdate = true;
        serializedVersion.lintErrors = [];
      }
      if (matchInMap?.length) {
        // update if needed
        const needsUpdate = node.lintErrorsDoNeedUpdate(matchInMap);
        if (needsUpdate) {
          nestedNeedsUpdate = true;
          serializedVersion.lintErrors = matchInMap;
        }
      }
    }
  });
  return {changed: nestedNeedsUpdate, newState: cloned};
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
      tag: [HISTORY_MERGE_TAG],
    }
  );
}
