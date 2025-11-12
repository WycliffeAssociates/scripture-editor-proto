import { $dfs } from "@lexical/utils";
import type {
    EditorState,
    LexicalEditor,
    SerializedEditorState,
    SerializedLexicalNode,
} from "lexical";
import { EDITOR_TAGS_USED } from "@/app/data/editor";
import { $isUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
    $isUSFMTextNode,
    type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import type { LintableTokenLike } from "@/app/ui/hooks/useActions";
import type { LintError } from "@/core/data/usfm/lint";
import { lintExistingUsfmTokens } from "@/core/domain/usfm/parse";
import { initParseContext } from "@/core/domain/usfm/tokenParsers";

type LintVersesArgs = {
    editorState: EditorState;
    editor: LexicalEditor;
};

export function lintAll(
    { editorState, editor }: LintVersesArgs,
    getFlatFileTokens: (
        currentEditorState: SerializedEditorState,
    ) => Array<LintableTokenLike>,
) {
    const flatFileTokens = getFlatFileTokens(editorState.toJSON());
    const ctx = initParseContext(flatFileTokens);
    // debugger;
    const lintErrors = lintExistingUsfmTokens(flatFileTokens, ctx);
    const withErrorsInThisBook = ctx.errorMessages.reduce(
        (acc, curr) => {
            if (!curr.nodeId) return acc;
            acc[curr.nodeId] ??= [];
            acc[curr.nodeId].push(curr);
            return acc;
        },
        {} as Record<string, LintError[]>,
    );
    const updateFxns: (() => void)[] = [];
    // ;
    dfsEditorStateForLint({
        editor,
        editorState,
        updatesToMainEditor: updateFxns,
        withErrorsInThisBook,
    });
    if (updateFxns.length) {
        editor.update(
            () => {
                updateFxns.forEach((fxn) => {
                    fxn();
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
                    updatesToMainEditor.push(() =>
                        node.setLintErrors(matchInMap),
                    );
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
