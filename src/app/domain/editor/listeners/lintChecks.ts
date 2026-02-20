import { $dfs } from "@lexical/utils";
import type {
    EditorState,
    LexicalEditor,
    SerializedEditorState,
    SerializedLexicalNode,
} from "lexical";
import { $getNodeByKey } from "lexical";
import { EDITOR_TAGS_USED } from "@/app/data/editor.ts";
import { $isUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    $isUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import type { LintableTokenLike } from "@/app/ui/hooks/useActions.tsx";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { lintExistingUsfmTokens } from "@/core/domain/usfm/parse.ts";
import { initParseContext } from "@/core/domain/usfm/tokenParsers.ts";

type LintVersesArgs = {
    editorState: EditorState;
    editor: LexicalEditor;
};

export function lintAll(
    { editorState, editor }: LintVersesArgs,
    getFlatFileTokens: (
        currentEditorState: SerializedEditorState,
        opts?: { bookCode?: string; chapter?: number },
    ) => Array<LintableTokenLike>,
    opts?: { bookCode?: string; chapter?: number },
) {
    const flatFileTokens = getFlatFileTokens(editorState.toJSON(), opts);
    const ctx = initParseContext(flatFileTokens);
    const lintErrors = lintExistingUsfmTokens(flatFileTokens, ctx);
    const withErrorsInThisBook = lintErrors.reduce(
        (acc, curr) => {
            if (!curr.nodeId) return acc;
            acc[curr.nodeId] ??= [];
            acc[curr.nodeId].push(curr);
            return acc;
        },
        {} as Record<string, LintError[]>,
    );

    const updateOps: LintUpdateOperation[] = [];
    dfsEditorStateForLint({
        editor,
        editorState,
        updatesToMainEditor: updateOps,
        withErrorsInThisBook,
    });

    if (updateOps.length) {
        editor.update(
            () => {
                updateOps.forEach((operation) => {
                    const node = $getNodeByKey(operation.nodeKey);
                    if (!node) return;

                    if (operation.type === "setLintErrors") {
                        if (
                            $isUSFMTextNode(node) ||
                            $isUSFMNestedEditorNode(node)
                        ) {
                            node.setLintErrors(operation.errors);
                        }
                        return;
                    }

                    if (operation.type === "setNestedEditorState") {
                        if (!$isUSFMNestedEditorNode(node)) return;
                        const writable = node.getWritable();
                        writable.__editorState = operation.newState;
                        writable.setRandomRenderKey();
                    }
                });
            },
            {
                tag: [
                    EDITOR_TAGS_USED.historyMerge,
                    EDITOR_TAGS_USED.programaticIgnore,
                ],
            },
        );
    }
    return lintErrors;
}

type DfsEditorStateForLintArgs = {
    editor: LexicalEditor;
    editorState: EditorState;
    updatesToMainEditor: LintUpdateOperation[];
    withErrorsInThisBook: Record<string, LintError[]>;
};

type LintUpdateOperation =
    | {
          type: "setLintErrors";
          nodeKey: string;
          errors: LintError[];
      }
    | {
          type: "setNestedEditorState";
          nodeKey: string;
          newState: SerializedEditorState;
      };

function dfsEditorStateForLint({
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
            const nodeKey = node.getKey();
            // clear if had errors but now does
            if (currentErrors.length && !matchInMap) {
                updatesToMainEditor.push({
                    type: "setLintErrors",
                    nodeKey,
                    errors: [],
                });
            }
            if (matchInMap?.length) {
                // update if needed
                const needsUpdate = node.lintErrorsDoNeedUpdate(matchInMap);
                if (needsUpdate) {
                    updatesToMainEditor.push({
                        type: "setLintErrors",
                        nodeKey,
                        errors: matchInMap,
                    });
                }
            }
            if ($isUSFMNestedEditorNode(node)) {
                const serialized = node.getLatestEditorState();
                const updated = lintNestedSerializedState(
                    editor,
                    serialized,
                    withErrorsInThisBook,
                );
                if (updated.changed) {
                    updatesToMainEditor.push({
                        type: "setNestedEditorState",
                        nodeKey,
                        newState: updated.newState,
                    });
                }
            }
        }
    });
}
type dfsNode = SerializedLexicalNode & {
    id?: string;
    children?: SerializedLexicalNode[];
};
function dfs(node: dfsNode, map: Record<string, dfsNode>) {
    if (!node) return;
    if (node?.id) {
        map[node.id] = node;
    }
    if (node.children?.length) {
        for (const child of node.children) dfs(child as dfsNode, map);
    }
}
function lintNestedSerializedState(
    editor: LexicalEditor,
    state: SerializedEditorState,
    withErrorsInThisBook: Record<string, LintError[]>,
): { changed: boolean; newState: SerializedEditorState } {
    const cloned = structuredClone(state);
    const parsed = editor.parseEditorState(state);

    const clonedMap: Record<string, dfsNode> = {};
    dfs(cloned.root as dfsNode, clonedMap);

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
    return { changed: nestedNeedsUpdate, newState: cloned };
}
