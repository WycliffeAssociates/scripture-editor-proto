import { $isElementNode, type LexicalNode } from "lexical";
import { TOKENS_TO_LOCK_FROM_EDITING } from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

export function isNodeLocked(node: LexicalNode): boolean {
    if (!$isUSFMTextNode(node)) return false;
    const tokenType = node.getTokenType();
    return TOKENS_TO_LOCK_FROM_EDITING.has(
        tokenType as "idMarker" | "endMarker" | "implicitClose" | "marker",
    );
}

export function findNextEditableNode(node: LexicalNode): USFMTextNode | null {
    let current = node.getNextSibling();
    while (current) {
        if ($isUSFMTextNode(current) && !isNodeLocked(current)) {
            return current;
        }
        if ($isUSFMTextNode(current) && isNodeLocked(current)) {
            current = current.getNextSibling();
            continue;
        }
        if ($isElementNode(current)) {
            const firstChild = current.getFirstChild();
            if (firstChild) {
                current = firstChild;
                continue;
            }
        }
        current = current.getNextSibling();
    }
    return null;
}

export function findPreviousEditableNode(
    node: LexicalNode,
): USFMTextNode | null {
    let current = node.getPreviousSibling();
    while (current) {
        if ($isUSFMTextNode(current) && !isNodeLocked(current)) {
            return current;
        }
        if ($isUSFMTextNode(current) && isNodeLocked(current)) {
            current = current.getPreviousSibling();
            continue;
        }
        if ($isElementNode(current)) {
            const lastChild = current.getLastChild();
            if (lastChild) {
                current = lastChild;
                continue;
            }
        }
        current = current.getPreviousSibling();
    }
    return null;
}
