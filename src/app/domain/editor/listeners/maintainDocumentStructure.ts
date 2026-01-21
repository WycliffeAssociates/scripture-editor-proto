import { $dfsIterator, type DFSNode } from "@lexical/utils";
import {
    $getRoot,
    $isLineBreakNode,
    type EditorState,
    type LexicalEditor,
} from "lexical";
import { EDITOR_TAGS_USED, UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    $isVerseRangeTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    ALL_CHAR_MARKERS,
    CHAPTER_VERSE_MARKERS,
} from "@/core/data/usfm/tokens.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import { markerRegex, markerTrimNoSlash } from "@/core/domain/usfm/lex.ts";

export type DocStructureFxnArgs = {
    node: USFMTextNode;
    tokenType: string;
    updates: Array<{
        dbgLabel: string;
        dbgDetail?: string;
        run: () => void;
    }>;
};
export type MainDocumentStrutureFxn = (args: DocStructureFxnArgs) => void;

// only works on 1 main editor
// This function is concnered with making sure the eidtor doesn't get into weird states where you can add text between a marker or after averse number cause you deleted it all. It also keeps the document flat by merging adjacent text nodes of the same type.
export function maintainDocumentStructure(
    editorState: EditorState,
    editor: LexicalEditor,
) {
    const updates: Array<{
        dbgLabel: string;
        run: () => void;
    }> = [];

    editorState.read(() => {
        const allNodes = [...$dfsIterator()];
        for (const dfsNode of allNodes) {
            const node = dfsNode.node;
            //   can check other node types above if we need
            if (!$isUSFMTextNode(node)) continue;
            const tokenType = node.getTokenType();
            const args = {
                node,
                tokenType,
                updates,
            };
            editCharOpenAndCloseTogether(args);
            ensureNumberRangeAlwaysFollowsMarkerExpectingNum(args);
            ensurePlainTextNodeAlwaysFollowsNumberRange(args);
            ensureCharOpensHaveEditableNextSibling(args);
            ensureCharCloseHasEditableNextSibling(args);
            trySplitOutMarkersFromKnownErrorTokens(args);
            //   ensureNodesSandwichedBetweenSameSidHasThatSid(args);
            removeEmptyNumberRangeNotPrecededByMarker(args);
            fixNumberRangeReparenting(args);
            ensureSiblingsHaveAtLeastOneSpace(args);
        }
        // mergeAdjacentTextNodesOfSameType({
        //   allNodes,
        //   updates,
        // });
    });
    if (updates.length) {
        console.log(`maintain documnet structure updates ${updates.length}`);
        editor.update(() => {
            updates.forEach(
                (u) => {
                    u.run();
                },
                {
                    tag: [
                        EDITOR_TAGS_USED.historyMerge,
                        EDITOR_TAGS_USED.programaticIgnore,
                    ],
                    skipTransforms: true,
                },
            );
        });
    }
    // console.timeEnd("maintainDocumentStructure");
}

// This function shouldn't be run often. It's just to keep the dom size down by merging similar nodes and anythign else that isn't frame rate sensitive.. when it wasn't debounced, it was causing issues with copy/paste
export function maintainDocumentStructureDebounced(
    editorState: EditorState,
    editor: LexicalEditor,
) {
    const updates: Array<{
        dbgLabel: string;
        run: () => void;
    }> = [];

    editorState.read(() => {
        const allNodes = [...$dfsIterator()];
        mergeAdjacentTextNodesOfSameType({
            allNodes,
            updates,
        });
    });
    if (updates.length) {
        console.log(
            `maintain documnet structure debounced updates ${updates.length}`,
        );
        editor.update(() => {
            updates.forEach(
                (u) => {
                    u.run();
                },
                {
                    tag: [
                        EDITOR_TAGS_USED.historyMerge,
                        EDITOR_TAGS_USED.programaticIgnore,
                    ],
                    skipTransforms: true,
                },
            );
        });
    }
    // console.timeEnd("maintainDocumentStructure");
}

const ensureCharOpensHaveEditableNextSibling: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    const isMarker = tokenType === UsfmTokenTypes.marker;
    const marker = node.getMarker();
    if (!isMarker || !marker) return;
    const isChar = ALL_CHAR_MARKERS.has(marker);
    if (!isChar) return;
    const nextSibling = node.getNextSibling();
    // as long as the nest sib
    const editableTypes: Array<string> = [
        UsfmTokenTypes.text,
        UsfmTokenTypes.numberRange,
    ];
    if (
        $isUSFMTextNode(nextSibling) &&
        editableTypes.includes(nextSibling.getTokenType())
    ) {
        return;
    }
    updates.push({
        dbgLabel: "ensureCharOpensHaveEditableNextSibling",
        run: () => {
            const emptySibling = $createUSFMTextNode(" ", {
                id: guidGenerator(),
                sid: node.getSid().trim(),
                inPara: node.getInPara(),
                tokenType: UsfmTokenTypes.text,
            });
            node.insertAfter(emptySibling);
        },
    });
};
const ensureCharCloseHasEditableNextSibling: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    const isCharClose = tokenType === UsfmTokenTypes.endMarker;
    if (!isCharClose) return;
    const nextSibling = node.getNextSibling();
    // as long as the nest sib
    const acceptableNextSibling: Array<string> = [UsfmTokenTypes.text];
    if (
        ($isUSFMTextNode(nextSibling) &&
            acceptableNextSibling.includes(nextSibling.getTokenType())) ||
        $isLineBreakNode(nextSibling)
    ) {
        return;
    }
    updates.push({
        dbgLabel: "ensureCharCloseHasEditableNextSibling",
        run: () => {
            const emptySibling = $createUSFMTextNode(" ", {
                id: guidGenerator(),
                sid: node.getSid().trim(),
                inPara: node.getInPara(),
                tokenType: UsfmTokenTypes.text,
            });
            node.insertAfter(emptySibling);
        },
    });
};

const removeEmptyNumberRangeNotPrecededByMarker: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    // Only process numberRange nodes, not markers
    const isNumberRange = tokenType === UsfmTokenTypes.numberRange;
    if (!isNumberRange) return;

    // Look at the previous sibling to see if it's a marker expecting a number
    const previousSibling = node.getPreviousSibling();
    let isValidPredecessor = false;

    if ($isUSFMTextNode(previousSibling)) {
        const prevMarker = previousSibling.getMarker();
        if (
            previousSibling.getTokenType() === UsfmTokenTypes.marker &&
            prevMarker &&
            CHAPTER_VERSE_MARKERS.has(prevMarker)
        ) {
            isValidPredecessor = true;
        }
    }

    if (!isValidPredecessor) {
        // If it's an orphaned numberRange (not preceded by a valid marker)
        if (!node.getTextContent().trim().length) {
            // If empty, remove it
            updates.push({
                dbgLabel: "removeOrphanedEmptyNumberRange",
                run: () => {
                    node.remove();
                },
            });
        } else {
            // If it has content, convert it to plain text so it's not lost but doesn't break structure
            updates.push({
                dbgLabel: "convertOrphanedNumberRangeToText",
                run: () => {
                    node.setTokenType(UsfmTokenTypes.text);
                },
            });
        }
    }
};

const fixNumberRangeReparenting: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    // Only process numberRange nodes
    const isNumberRange = tokenType === UsfmTokenTypes.numberRange;
    if (!isNumberRange) return;

    // Check if numberRange is empty
    if (!node.getTextContent().trim().length) {
        // Look at previous sibling to see if it's a chapter/verse marker
        const previousSibling = node.getPreviousSibling();
        if (!$isUSFMTextNode(previousSibling)) return;

        const isPrevMarker =
            previousSibling.getTokenType() === UsfmTokenTypes.marker;
        if (!isPrevMarker) return;

        const prevMarker = previousSibling.getMarker();
        if (!prevMarker) return;

        // Only fix if preceded by chapter/verse marker
        if (CHAPTER_VERSE_MARKERS.has(prevMarker)) {
            // Look at next sibling to see if it starts with a number
            const nextSibling = node.getNextSibling();
            if (!$isUSFMTextNode(nextSibling)) return;

            const nextText = nextSibling.getTextContent().trim();
            const startsWithNumber = /^\d/.test(nextText);

            if (startsWithNumber) {
                updates.push({
                    dbgLabel: "fixNumberRangeReparenting",
                    run: () => {
                        // Extract just the number from next sibling
                        const numberMatch = nextText.match(/^(\d+)/);
                        if (!numberMatch) return;

                        // Move only the number to the empty numberRange
                        node.setTextContent(numberMatch[1]);
                        node.selectEnd();

                        // Clear the next sibling (now empty)
                        const nextContentSansNumber = nextText.slice(
                            numberMatch[0].length,
                        );
                        nextSibling.setTextContent(nextContentSansNumber);
                    },
                });
            }
        }
    }
};

const ensureNumberRangeAlwaysFollowsMarkerExpectingNum: MainDocumentStrutureFxn =
    ({ node, tokenType, updates }) => {
        const nextSibling = node.getNextSibling();
        if (!$isUSFMTextNode(nextSibling)) return;

        const isMarker = tokenType === UsfmTokenTypes.marker;
        if (!isMarker) return;
        const marker = node.getMarker();
        if (!marker) return;
        if (!CHAPTER_VERSE_MARKERS.has(marker)) return;
        const nextSiblingToken = nextSibling.getTokenType();
        if (nextSiblingToken === UsfmTokenTypes.numberRange) return;
        updates.push({
            dbgLabel: "ensureNumberRangeAlwaysFollowsMarkerExpectingNum",
            run: () => {
                const emptySibling = $createUSFMTextNode(" ", {
                    id: guidGenerator(),
                    sid: node.getSid().trim(),
                    inPara: node.getInPara(),
                    tokenType: UsfmTokenTypes.numberRange,
                });
                node.insertAfter(emptySibling);
            },
        });
    };
const ensurePlainTextNodeAlwaysFollowsNumberRange: MainDocumentStrutureFxn = ({
    node,
    updates,
}) => {
    if (!$isVerseRangeTextNode(node)) return;
    const next = node.getNextSibling();
    const prev = node.getPreviousSibling();
    if (
        prev &&
        $isUSFMTextNode(prev) &&
        prev.getTokenType() === UsfmTokenTypes.marker &&
        prev.getMarker() === "c"
    ) {
        // chapters numbers ranges don't need the plain text node following
        return;
    }
    if (
        !next ||
        !$isUSFMTextNode(next) ||
        next.getTokenType() !== UsfmTokenTypes.text
    ) {
        updates.push({
            dbgLabel: "ensurePlainTextNodeAlwaysFollowsNumberRange",
            run: () => {
                const emptySibling = $createUSFMTextNode(" ", {
                    id: guidGenerator(),
                    sid: node.getSid().trim(),
                    inPara: node.getInPara(),
                    tokenType: UsfmTokenTypes.text,
                });
                node.insertAfter(emptySibling);
            },
        });
    }
    if (next && $isUSFMTextNode(next) && !next.getTextContent().length) {
        updates.push({
            dbgLabel: "ensurePlainTextNodeAlwaysFollowsNumberRange",
            run: () => {
                next.setTextContent(" ");
            },
        });
    }
};

const trySplitOutMarkersFromKnownErrorTokens: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    if (tokenType !== UsfmTokenTypes.error) return;
    const textContent = node.getTextContent();
    //   if the textContent matches a markerRegex at start, we should split it there into a marker + text:
    const match = textContent.match(markerRegex);
    if (match) {
        // call node.splitText(match.index)
        updates.push({
            dbgLabel: "trySplitOutMarkersFromKnownErrorTokens",
            run: () => {
                const [left, right] = node.splitText(match[0].length);
                if ($isUSFMTextNode(left)) {
                    left.setTokenType(UsfmTokenTypes.marker);
                    left.setMarker(markerTrimNoSlash(match[0]));
                }
                if ($isUSFMTextNode(right)) {
                    right.setTokenType(UsfmTokenTypes.text);
                }
            },
        });
    }
};

const ensureSiblingsHaveAtLeastOneSpace: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    const isTextContent =
        tokenType === UsfmTokenTypes.marker ||
        tokenType === UsfmTokenTypes.endMarker ||
        tokenType === UsfmTokenTypes.numberRange ||
        tokenType === UsfmTokenTypes.text;

    if (!isTextContent) return;

    const nextSibling = node.getNextSibling();
    if (!nextSibling) return;

    const nextIsLineBreak = $isLineBreakNode(nextSibling);
    const textContentType: Array<string> = [
        UsfmTokenTypes.marker,
        UsfmTokenTypes.endMarker,
        UsfmTokenTypes.numberRange,
        UsfmTokenTypes.text,
    ];
    const nextIsTextContent =
        $isUSFMTextNode(nextSibling) &&
        textContentType.includes(nextSibling.getTokenType());

    if (!nextIsTextContent) return;

    const nodeText = node.getTextContent();
    const nextText = nextSibling.getTextContent();

    const endsWithSpace = nodeText.endsWith(" ");
    const startsWithSpace = nextText.startsWith(" ");

    if (endsWithSpace || startsWithSpace || nextIsLineBreak) {
        return;
    }

    updates.push({
        dbgLabel: "ensureSiblingsHaveAtLeastOneSpace",
        run: () => {
            if (nextSibling.isAttached()) {
                const latestNext = nextSibling.getLatest();
                if (!$isUSFMTextNode(latestNext)) return;
                latestNext.setTextContent(` ${latestNext.getTextContent()}`);
            }
        },
    });
};

const mergeAdjacentTextNodesOfSameType = ({
    allNodes,
    updates,
}: {
    allNodes: Array<DFSNode>;
    updates: Array<{
        dbgLabel: string;
        dbgDetail?: string;
        run: () => void;
    }>;
}) => {
    const tokenTypesToMerge: Array<string> = [
        UsfmTokenTypes.text,
        UsfmTokenTypes.error,
    ];

    const allTextNodes: Array<USFMTextNode> = allNodes
        .map((dfsNode) => dfsNode.node)
        .filter(
            (n) =>
                $isUSFMTextNode(n) &&
                tokenTypesToMerge.includes(n.getTokenType()),
        ) as Array<USFMTextNode>;
    // Group consecutive nodes with same sid + tokenType
    const groups: USFMTextNode[][] = [];
    let currentGroup: USFMTextNode[] = [];

    for (let i = 0; i < allTextNodes.length; i++) {
        const node = allTextNodes[i];
        const prev = allTextNodes[i - 1];

        const shouldMergeWithPrev =
            i > 0 &&
            prev.getNextSibling() === node && // consecutive in the tree
            prev.getSid() === node.getSid() &&
            prev.getTokenType() === node.getTokenType();

        if (shouldMergeWithPrev) {
            currentGroup.push(node);
        } else {
            if (currentGroup.length > 0) groups.push(currentGroup);
            currentGroup = [node];
        }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    // Now reduce each group down to one node
    for (const group of groups) {
        if (group.length <= 1) continue;
        const [first, ...rest] = group;
        updates.push({
            dbgLabel: "mergeAdjacentTextNodesOfSameTypeBatch",
            run: () => {
                const mergedText = group
                    .map((n) => n.getTextContent())
                    .join("");
                first.setTextContent(mergedText);
                rest.forEach((n) => {
                    n.remove();
                });
            },
        });
    }
};

const editCharOpenAndCloseTogether: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    const isMarker = tokenType === UsfmTokenTypes.marker;
    const marker = node.getMarker();
    if (!isMarker || !marker) return;
    const isChar = ALL_CHAR_MARKERS.has(marker);
    if (!isChar) return;
    const lastNodeInEditor = $getRoot().getLastChild();
    if (!lastNodeInEditor) return;

    // look forward until we find a closeMarker, or a para el, line break, or next footnote marker:  The last 3 cases are the hard stops for a char:
    let matchedEnd: USFMTextNode | null = null;
    for (const nextNode of $dfsIterator(node, lastNodeInEditor)) {
        // check break conditions:
        const next = nextNode.node;
        if ($isLineBreakNode(next)) break;
        if ($isUSFMNestedEditorNode(next)) break;

        if (!$isUSFMTextNode(next)) continue;
        const isEndMarker = next.getTokenType() === UsfmTokenTypes.endMarker;
        if (isEndMarker) {
            const endMarker = next.getMarker();
            if (!endMarker) continue;
            if (endMarker !== marker) continue;
            matchedEnd = next;
            break;
        }
    }
    if (matchedEnd) {
        const endMatchingTxt = `${node.getTextContent().trim()}*`;
        if (matchedEnd.getTextContent().trim() !== endMatchingTxt) {
            updates.push({
                dbgLabel: "editCharOpenAndCloseTogether",
                run: () => {
                    // set the marker of both nodes:
                    const newMarker = markerTrimNoSlash(node.getTextContent());
                    if (ALL_CHAR_MARKERS.has(newMarker)) {
                        node.setMarker(newMarker);
                        matchedEnd.setMarker(newMarker);
                    }
                    matchedEnd.setTextContent(endMatchingTxt);
                },
            });
        }
    }
};
