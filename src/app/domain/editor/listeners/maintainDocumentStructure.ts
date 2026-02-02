import { $dfsIterator, type DFSNode } from "@lexical/utils";
import {
    $getRoot,
    $isElementNode,
    $isLineBreakNode,
    type EditorState,
    type LexicalEditor,
    type LexicalNode,
} from "lexical";
import { EDITOR_TAGS_USED, UsfmTokenTypes } from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import { $isUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    $createUSFMParagraphNode,
    $isUSFMParagraphNode,
    type USFMParagraphNode,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
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
    appSettings: Settings;
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
    appSettings: Settings,
) {
    const editorModeSetting = appSettings.editorMode ?? "regular";
    const tierBEnabled = editorModeSetting !== "plain";
    const allNodes = editorState.read(() => [...$dfsIterator()]);
    let totalUpdates = 0;

    for (const dfsNode of allNodes) {
        const nodeUpdates: Array<{
            dbgLabel: string;
            run: () => void;
        }> = [];

        editorState.read(() => {
            const node = dfsNode.node;
            //   can check other node types above if we need
            if (!$isUSFMTextNode(node) || !node.isAttached()) return;
            const tokenType = node.getTokenType();
            const args = {
                node,
                tokenType,
                appSettings,
                updates: nodeUpdates,
            };
            const structureFixes: MainDocumentStrutureFxn[] = [
                editCharOpenAndCloseTogether,
                fixMalformedMarkerWithNumber,
                splitCombinedMarkerAndNumberRange,
            ];
            if (tierBEnabled) {
                structureFixes.push(
                    ensureNumberRangeAlwaysFollowsMarkerExpectingNum,
                );
            }
            structureFixes.push(
                ensurePlainTextNodeAlwaysFollowsNumberRange,
                ensureCharOpensHaveEditableNextSibling,
                ensureCharCloseHasEditableNextSibling,
                trySplitOutMarkersFromKnownErrorTokens,
                //   ensureNodesSandwichedBetweenSameSidHasThatSid,
                fixNumberRangeReparenting,
                removeEmptyNumberRangeNotPrecededByMarker,
            );

            for (const fixFn of structureFixes) {
                fixFn(args);
                if (nodeUpdates.length) break;
            }
        });

        if (nodeUpdates.length) {
            console.log(
                `maintain document structure updates for node: ${nodeUpdates.length}`,
            );
            console.log(nodeUpdates);
            totalUpdates += nodeUpdates.length;
            editor.update(
                () => {
                    nodeUpdates.forEach((u) => {
                        u.run();
                    });
                },
                {
                    tag: [
                        EDITOR_TAGS_USED.historyMerge,
                        // EDITOR_TAGS_USED.programaticIgnore,
                    ],
                },
            );
        }
    }

    if (totalUpdates > 0) {
        console.log(
            `maintain document structure total updates: ${totalUpdates}`,
        );
    }

    // Regular-mode structural enforcement
    if (editorModeSetting === "regular") {
        enforceRegularModeParagraphStructure(editor);
    }
}

/**
 * Ensures Regular mode root children are all USFMParagraphNode containers.
 * Stray nodes at root level are wrapped into a default paragraph container.
 */
function enforceRegularModeParagraphStructure(editor: LexicalEditor): void {
    editor.update(
        () => {
            const root = $getRoot();
            const children = root.getChildren();
            const strayRun: LexicalNode[] = [];

            const ensureParagraphHasEditableFallback = (
                para: USFMParagraphNode,
            ) => {
                if (para.getChildrenSize() > 0) return;
                const placeholder = $createUSFMTextNode(" ", {
                    id: guidGenerator(),
                    tokenType: UsfmTokenTypes.text,
                });
                para.append(placeholder);
            };

            const flushStrayRunBefore = (anchor: LexicalNode | null) => {
                if (strayRun.length === 0) return;
                const para = $createUSFMParagraphNode({
                    id: guidGenerator(),
                    marker: "p",
                });

                if (anchor) {
                    anchor.insertBefore(para);
                } else {
                    root.append(para);
                }

                for (const stray of strayRun) {
                    para.append(stray);
                }
                strayRun.length = 0;
                ensureParagraphHasEditableFallback(para);
            };

            for (const child of children) {
                if ($isUSFMParagraphNode(child)) {
                    flushStrayRunBefore(child);
                    ensureParagraphHasEditableFallback(child);
                    continue;
                }

                if ($isElementNode(child) && child.getType() === "paragraph") {
                    // Only treat Lexical built-in paragraph nodes as legacy wrappers.
                    // Each wrapper becomes its own USFMParagraphNode (no cross-wrapper merges).
                    flushStrayRunBefore(child);

                    const wrapperChildren = child.getChildren();
                    if (
                        wrapperChildren.length === 1 &&
                        $isUSFMParagraphNode(wrapperChildren[0])
                    ) {
                        // Legacy shape: root -> paragraph -> usfm-paragraph-node
                        // Hoist the existing paragraph container without unwrapping anything else.
                        child.insertBefore(wrapperChildren[0]);
                        child.remove();
                        ensureParagraphHasEditableFallback(
                            wrapperChildren[0] as USFMParagraphNode,
                        );
                        continue;
                    }

                    const para = $createUSFMParagraphNode({
                        id: guidGenerator(),
                        marker: "p",
                    });
                    child.insertBefore(para);
                    for (const wrapperChild of wrapperChildren) {
                        para.append(wrapperChild);
                    }
                    child.remove();
                    ensureParagraphHasEditableFallback(para);
                    continue;
                }

                // Do not unwrap arbitrary root element nodes; preserve them as-is.
                // If they are at root, wrap the entire node into a default paragraph container.
                strayRun.push(child);
            }

            // Handle remaining stray nodes at the end
            flushStrayRunBefore(null);

            // Ensure root has at least one paragraph
            if (root.getChildrenSize() === 0) {
                const defaultParagraph = $createUSFMParagraphNode({
                    id: guidGenerator(),
                    marker: "p",
                });
                const placeholder = $createUSFMTextNode(" ", {
                    id: guidGenerator(),
                    tokenType: UsfmTokenTypes.text,
                });
                defaultParagraph.append(placeholder);
                root.append(defaultParagraph);
            }
        },
        {
            tag: [EDITOR_TAGS_USED.historyMerge],
        },
    );
}

// This function shouldn't be run often. It's just to keep the dom size down by merging similar nodes and anythign else that isn't frame rate sensitive.. when it wasn't debounced, it was causing issues with copy/paste
export function maintainDocumentStructureDebounced(
    editorState: EditorState,
    editor: LexicalEditor,
    appSettings: Settings,
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
            appSettings,
        });
        ensureSiblingsHaveAtLeastOneSpace({
            allNodes,
            updates,
            appSettings,
        });
    });
    if (updates.length) {
        console.log(
            `maintain documnet structure debounced updates ${updates.length}`,
        );
        editor.update(
            () => {
                updates.forEach((u) => {
                    u.run();
                });
            },
            {
                tag: [
                    EDITOR_TAGS_USED.historyMerge,
                    //   EDITOR_TAGS_USED.programaticIgnore,
                ],
            },
        );
    }
    // console.timeEnd("maintainDocumentStructure");
}

const fixMalformedMarkerWithNumber: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    if (tokenType !== UsfmTokenTypes.marker) return;

    const text = node.getTextContent();
    // Regex matches: \marker + space + number
    const match = text.match(/^(\\[A-Za-z0-9]+)[\s\u00A0]+(\d+.*)$/);
    if (!match) return;

    const [_, markerText, numberText] = match;
    const cleanMarker = markerTrimNoSlash(markerText);

    // Only apply if it's a marker that expects a number
    if (!CHAPTER_VERSE_MARKERS.has(cleanMarker)) return;

    updates.push({
        dbgLabel: "fixMalformedMarkerWithNumber",
        run: () => {
            // Fix the marker node
            node.setTextContent(markerText);
            node.setMarker(cleanMarker);
            // Handle the number
            const nextSibling = node.getNextSibling();
            if (
                $isUSFMTextNode(nextSibling) &&
                nextSibling.getTokenType() === UsfmTokenTypes.numberRange
            ) {
                // Update existing number node
                nextSibling.setTextContent(` ${numberText}`);
            } else {
                // Create new number node
                const newNumberNode = $createUSFMTextNode(numberText, {
                    id: guidGenerator(),
                    sid: node.getSid().trim(),
                    inPara: node.getInPara(),
                    tokenType: UsfmTokenTypes.numberRange,
                });
                node.insertAfter(newNumberNode);
            }
        },
    });
};

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

    //   See if it's parent is a valid marker as well
    const parent = node.getParent();
    if ($isUSFMParagraphNode(parent)) {
        const parentMarker = parent.getMarker();
        if (
            parent.getTokenType() === UsfmTokenTypes.marker &&
            parentMarker &&
            CHAPTER_VERSE_MARKERS.has(parentMarker)
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

export const ensureNumberRangeAlwaysFollowsMarkerExpectingNum: MainDocumentStrutureFxn =
    ({ node, tokenType, updates, appSettings }) => {
        const editorModeSetting = appSettings.editorMode ?? "regular";
        const tierBEnabled = editorModeSetting !== "plain";
        if (!tierBEnabled) return;

        const nextSibling = node.getNextSibling();

        const isMarker = tokenType === UsfmTokenTypes.marker;
        if (!isMarker) return;
        const marker = node.getMarker();
        if (!marker) return;
        if (!CHAPTER_VERSE_MARKERS.has(marker)) return;

        const isRegularMode = editorModeSetting === "regular";

        if (
            $isUSFMTextNode(nextSibling) &&
            nextSibling.getTokenType() === UsfmTokenTypes.numberRange
        ) {
            // If the number range is empty and we are in regular mode, we should delete both
            if (isRegularMode && !nextSibling.getTextContent().trim().length) {
                updates.push({
                    dbgLabel:
                        "ensureNumberRangeAlwaysFollowsMarkerExpectingNum:removeOrphanedMarker",
                    run: () => {
                        nextSibling.remove();
                        node.remove();
                    },
                });
            }
            return;
        }

        // If we reach here, there is no numberRange following the marker.
        // In regular mode, if the number is gone, the marker should be gone too.
        if (isRegularMode) {
            updates.push({
                dbgLabel:
                    "ensureNumberRangeAlwaysFollowsMarkerExpectingNum:removeOrphanedMarker(noNumberRange)",
                run: () => {
                    node.remove();
                },
            });
            return;
        }

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
                emptySibling.selectEnd();
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
    const parent = node.getParent();
    if (
        prev &&
        $isUSFMTextNode(prev) &&
        prev.getTokenType() === UsfmTokenTypes.marker &&
        prev.getMarker() === "c"
    ) {
        // chapters numbers ranges don't need the plain text node following
        return;
    }
    //   same check for chapter above, but for reuglar mode if the parent is a chapter
    if (parent && $isUSFMParagraphNode(parent) && parent.getMarker() === "c") {
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

const ensureSiblingsHaveAtLeastOneSpace = ({
    allNodes,
    updates,
}: DebouncedStructuralUpdatesArgs) => {
    for (const dfsNode of allNodes) {
        const node = dfsNode.node;
        if (!$isUSFMTextNode(node)) continue;
        const tokenType = (node as USFMTextNode).getTokenType();

        const isTextContent =
            tokenType === UsfmTokenTypes.marker ||
            tokenType === UsfmTokenTypes.endMarker ||
            tokenType === UsfmTokenTypes.numberRange ||
            tokenType === UsfmTokenTypes.text;

        if (!isTextContent) continue;

        const nextSibling = node.getNextSibling();
        if (!nextSibling) continue;

        const nextIsLineBreak = $isLineBreakNode(nextSibling);
        const textContentType: Array<string> = [
            UsfmTokenTypes.marker,
            UsfmTokenTypes.endMarker,
            UsfmTokenTypes.numberRange,
            UsfmTokenTypes.text,
        ];
        const nextIsTextContent =
            $isUSFMTextNode(nextSibling) &&
            textContentType.includes(
                (nextSibling as USFMTextNode).getTokenType(),
            );

        if (!nextIsTextContent) continue;

        const nodeText = node.getTextContent();
        const nextText = nextSibling.getTextContent();

        const endsWithSpace = nodeText.endsWith(" ");
        const startsWithSpace = nextText.startsWith(" ");

        if (endsWithSpace || startsWithSpace || nextIsLineBreak) {
            continue;
        }

        updates.push({
            dbgLabel: "ensureSiblingsHaveAtLeastOneSpace",
            run: () => {
                if (nextSibling.isAttached()) {
                    const latestNext = nextSibling.getLatest();
                    if (!$isUSFMTextNode(latestNext)) return;
                    (latestNext as USFMTextNode).setTextContent(
                        ` ${latestNext.getTextContent()}`,
                    );
                }
            },
        });
    }
};

type DebouncedStructuralUpdatesArgs = {
    allNodes: Array<DFSNode>;
    appSettings: Settings;
    updates: Array<{
        dbgLabel: string;
        dbgDetail?: string;
        run: () => void;
    }>;
};

const mergeAdjacentTextNodesOfSameType = ({
    allNodes,
    updates,
}: DebouncedStructuralUpdatesArgs) => {
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
const splitCombinedMarkerAndNumberRange: MainDocumentStrutureFxn = ({
    node,
    tokenType,
    updates,
}) => {
    // Only process marker nodes
    if (tokenType !== UsfmTokenTypes.marker) return;

    const text = node.getTextContent();

    // Regex matches: \marker + space + number (e.g., "\v 5", "\c 1", "\v 1-3")
    const match = text.match(
        /^(\\[a-zA-Z0-9]+)[\s\u00A0]+(\d+(?:-\d+)?[a-zA-Z0-9]*)$/,
    );
    if (!match) return;

    const [, markerText, numberText] = match;
    const cleanMarker = markerTrimNoSlash(markerText);

    // Only apply if it's a chapter/verse marker that expects a number
    if (!CHAPTER_VERSE_MARKERS.has(cleanMarker)) return;

    updates.push({
        dbgLabel: "splitCombinedMarkerAndNumberRange",
        run: () => {
            // Update the current node to be just the marker
            node.setTextContent(markerText);
            node.setMarker(cleanMarker);

            // Create a new numberRange node for the number
            const numberRangeNode = $createUSFMTextNode(numberText, {
                id: guidGenerator(),
                sid: node.getSid().trim(),
                inPara: node.getInPara(),
                tokenType: UsfmTokenTypes.numberRange,
            });

            // Insert the number range after the marker
            node.insertAfter(numberRangeNode);

            // Ensure there's a text node after the number range
            const nextSibling = numberRangeNode.getNextSibling();
            if (
                !$isUSFMTextNode(nextSibling) ||
                nextSibling.getTokenType() !== UsfmTokenTypes.text
            ) {
                const textNode = $createUSFMTextNode(" ", {
                    id: guidGenerator(),
                    sid: node.getSid().trim(),
                    inPara: node.getInPara(),
                    tokenType: UsfmTokenTypes.text,
                });
                numberRangeNode.insertAfter(textNode);
            }
        },
    });
};
