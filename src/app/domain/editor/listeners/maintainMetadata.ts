import { $dfs, $reverseDfs } from "@lexical/utils";
import {
    $getRoot,
    $setState,
    type LexicalEditor,
    type LexicalNode,
} from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor";
import {
    $isUSFMTextNode,
    USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import { sidState } from "@/app/domain/editor/states";
import { parseSid } from "@/core/data/bible/bible";

export function mergeAdjacentTextNodesOfSameType(editor: LexicalEditor) {
    return editor.registerNodeTransform(USFMTextNode, (node) => {
        const next = node.getNextSibling();
        if (!next) return;
        const tokenTypeToMerge = UsfmTokenTypes.text;
        if (
            $isUSFMTextNode(next) &&
            next.getSid() === node.getSid() &&
            next.getTokenType() === tokenTypeToMerge &&
            node.getTokenType() === tokenTypeToMerge
        ) {
            node.setTextContent(node.getTextContent() + next.getTextContent());
            next.remove();
        }

        // Optionally merge backward too, if user inserted in middle
        const prev = node.getPreviousSibling();
        if (
            prev &&
            $isUSFMTextNode(prev) &&
            prev.getSid() === node.getSid() &&
            prev.getTokenType() === tokenTypeToMerge &&
            node.getTokenType() === tokenTypeToMerge
        ) {
            prev.setTextContent(prev.getTextContent() + node.getTextContent());
            node.remove();
        }
    });
}

export function adjustSidsAsNeededOnTextTokens(editor: LexicalEditor) {
    return editor.registerNodeTransform(USFMTextNode, (node) => {
        const nodeTokenType = node.getTokenType();
        const root = $getRoot();
        const last = root.getLastChild();
        if (!last) return;
        if (nodeTokenType === UsfmTokenTypes.numberRange) {
            // recalc and change everything until next numberRange
            const curSid = node.getSid().trim();
            const pendingSid = node.getTextContent().trim();
            const currentSidGroup = parseSid(curSid);
            if (!currentSidGroup) return;
            // const [_whole, bookCode, chapter, numberRange] = currentSidGroup;
            const { book, chapter, verseStart, verseEnd } = currentSidGroup;
            if (!book || !chapter || !verseStart) return;
            const newSid = `${book} ${chapter}:${pendingSid}`;
            if (newSid === curSid) return;
            const nextVerseRangeNode = findNextVerseRangeNode(node, last);
            const prevMarker = node.getPreviousSibling();
            if (
                $isUSFMTextNode(prevMarker) &&
                prevMarker.getTokenType() === UsfmTokenTypes.marker
            ) {
                prevMarker.setSid(newSid);
            }
            if (!nextVerseRangeNode) return;

            const textNodesInBetween = $dfs(node, nextVerseRangeNode);
            // set the numberRange node sid and all in between
            nextVerseRangeNode.setSid(newSid);
            for (const textNode of textNodesInBetween) {
                if (
                    $isUSFMTextNode(textNode.node) &&
                    textNode.node.getSid().trim() !== newSid
                ) {
                    textNode.node.setSid(newSid);
                } else {
                    $setState(textNode.node, sidState, newSid);
                }
            }
        }
        if (nodeTokenType === "text") {
            // make sure this node token type matches nearest previous numberRange (trimmed)
            let prevVerseRange: USFMTextNode | null = null;
            for (const prevNode of $reverseDfs(node, root)) {
                if (
                    $isUSFMTextNode(prevNode.node) &&
                    prevNode.node.getTokenType() === "numberRange"
                ) {
                    prevVerseRange = prevNode.node;
                    break;
                }
            }
            if (!prevVerseRange) return;
            // sid not text content, due to that sid should be updated when that node is updated
            const prevVerseRangeSid = prevVerseRange.getSid().trim();
            const curSid = node.getSid().trim();
            if (curSid === prevVerseRangeSid) return;
            node.setSid(prevVerseRangeSid);
        }
    });
}

function findNextVerseRangeNode(
    node: USFMTextNode,
    lastNode: LexicalNode,
): USFMTextNode | null {
    let next: USFMTextNode | null = null;
    for (const nextNode of $dfs(node, lastNode)) {
        if (
            $isUSFMTextNode(nextNode.node) &&
            nextNode.node.getTokenType() === "numberRange" &&
            nextNode.node.getKey() !== node.getKey()
        ) {
            next = nextNode.node;
            break;
        }
    }
    return next;
}
