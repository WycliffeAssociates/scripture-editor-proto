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
    let current: LexicalNode | null = node.getNextSibling();

    // If no next sibling, traverse up until we find a parent with a next sibling
    if (!current) {
        let parent = node.getParent();
        while (parent && !current) {
            // Stop if we hit root (parent has no parent? or check isRoot?)
            // Lexical nodes always have parent unless root. Root has no parent.
            current = parent.getNextSibling();
            if (!current) {
                parent = parent.getParent();
            }
        }
    }

    while (current) {
        if ($isUSFMTextNode(current) && !isNodeLocked(current)) {
            return current;
        }
        if ($isUSFMTextNode(current) && isNodeLocked(current)) {
            // Skip locked node
        } else if ($isElementNode(current)) {
            const firstChild = current.getFirstChild();
            if (firstChild) {
                current = firstChild;
                continue;
            }
        }

        // Move to next sibling
        const next = current.getNextSibling();
        if (next) {
            current = next;
            continue;
        }

        // If no next sibling, traverse up
        let parent = current.getParent();
        current = null;
        while (parent) {
            const parentNext = parent.getNextSibling();
            if (parentNext) {
                current = parentNext;
                break;
            }
            parent = parent.getParent();
        }
    }
    return null;
}

export function findPreviousEditableNode(
    node: LexicalNode,
): USFMTextNode | null {
    let current: LexicalNode | null = node.getPreviousSibling();

    // If no prev sibling, traverse up
    if (!current) {
        let parent = node.getParent();
        while (parent && !current) {
            current = parent.getPreviousSibling();
            if (!current) {
                parent = parent.getParent();
            }
        }
    }

    while (current) {
        if ($isUSFMTextNode(current) && !isNodeLocked(current)) {
            return current;
        }
        if ($isUSFMTextNode(current) && isNodeLocked(current)) {
            // Skip locked node
        } else if ($isElementNode(current)) {
            const lastChild = current.getLastChild();
            if (lastChild) {
                current = lastChild;
                continue;
            }
        }

        // Move to prev sibling
        const prev = current.getPreviousSibling();
        if (prev) {
            current = prev;
            continue;
        }

        // If no prev sibling, traverse up
        let parent = current.getParent();
        current = null;
        while (parent) {
            const parentPrev = parent.getPreviousSibling();
            if (parentPrev) {
                current = parentPrev;
                break;
            }
            parent = parent.getParent();
        }
    }
    return null;
}
