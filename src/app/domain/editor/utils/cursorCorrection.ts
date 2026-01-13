import type { LexicalEditor } from "lexical";
import { $getSelection, $isRangeSelection } from "lexical";
import type { USFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    findNextEditableNode,
    findPreviousEditableNode,
    isNodeLocked,
} from "@/app/domain/editor/utils/lexicalTreeTraversal.ts";

export function correctCursorIfNeeded(editor: LexicalEditor) {
    let nodeToSelect: USFMTextNode | null = null;
    editor.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const anchorNode = selection.anchor.getNode();
        const focusNode = selection.focus.getNode();
        const isAnchorInLocked = isNodeLocked(anchorNode);

        if (isAnchorInLocked) {
            const nextEditable = findNextEditableNode(anchorNode || focusNode);
            if (nextEditable) {
                nodeToSelect = nextEditable;
                return;
            }

            const prevEditable = findPreviousEditableNode(
                anchorNode || focusNode,
            );
            if (prevEditable) {
                nodeToSelect = prevEditable;
            }
        }
    });

    if (nodeToSelect) {
        if (import.meta.env.DEV) {
            // console.log("Correcting cursor to", nodeToSelect);
        }
        editor.update(() => {
            if (!nodeToSelect) return;
            nodeToSelect.select(0, 0);
        });
    }
}
