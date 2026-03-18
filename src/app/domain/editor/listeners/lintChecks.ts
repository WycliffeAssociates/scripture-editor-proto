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
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

type LintVersesArgs = {
    editorState: EditorState;
    editor: LexicalEditor;
};

export async function lintAll(
    { editorState, editor }: LintVersesArgs,
    usfmOnionService: IUsfmOnionService,
    getFlatFileTokens: (
        currentEditorState: SerializedEditorState,
        opts?: { bookCode?: string; chapter?: number },
    ) => Token[],
    opts?: { bookCode?: string; chapter?: number },
) {
    const tokens = getFlatFileTokens(editorState.toJSON(), opts);
    const lintIssues = tokens.length
        ? await usfmOnionService.lintExisting(tokens)
        : [];

    const withErrorsInThisBook = lintIssues.reduce(
        (acc, curr) => {
            const tokenId = curr.tokenId ?? curr.relatedTokenId;
            if (!tokenId) return acc;
            acc[tokenId] ??= [];
            acc[tokenId].push(curr);
            return acc;
        },
        {} as Record<string, LintIssue[]>,
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
    return lintIssues;
}

type DfsEditorStateForLintArgs = {
    editor: LexicalEditor;
    editorState: EditorState;
    updatesToMainEditor: LintUpdateOperation[];
    withErrorsInThisBook: Record<string, LintIssue[]>;
};

type LintUpdateOperation =
    | {
          type: "setLintErrors";
          nodeKey: string;
          errors: LintIssue[];
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
            if (currentErrors.length && !matchInMap) {
                updatesToMainEditor.push({
                    type: "setLintErrors",
                    nodeKey,
                    errors: [],
                });
            }
            if (matchInMap?.length) {
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

type DfsNode = SerializedLexicalNode & {
    id?: string;
    children?: SerializedLexicalNode[];
};

function dfs(node: DfsNode, map: Record<string, DfsNode>) {
    if (!node) return;
    if (node.id) {
        map[node.id] = node;
    }
    if (node.children?.length) {
        for (const child of node.children) dfs(child as DfsNode, map);
    }
}

function lintNestedSerializedState(
    editor: LexicalEditor,
    state: SerializedEditorState,
    withErrorsInThisBook: Record<string, LintIssue[]>,
): { changed: boolean; newState: SerializedEditorState } {
    const cloned = structuredClone(state);
    const parsed = editor.parseEditorState(state);

    const clonedMap: Record<string, DfsNode> = {};
    dfs(cloned.root as DfsNode, clonedMap);

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
            if (currentErrors.length && !matchInMap) {
                nestedNeedsUpdate = true;
                serializedVersion.lintErrors = [];
            }
            if (matchInMap?.length) {
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
