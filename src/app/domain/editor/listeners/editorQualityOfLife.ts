import {
    $createLineBreakNode,
    $getNodeByKey,
    $getSelection,
    $isLineBreakNode,
    $isRangeSelection,
    type LexicalEditor,
} from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import {
    ALL_CHAR_MARKERS,
    CHAPTER_VERSE_MARKERS,
    isValidParaMarker,
    VALID_NOTE_MARKERS,
} from "@/core/domain/usfm/onionMarkers.ts";

const isCharOrNoteMarkerBoundary = (marker: string | null): boolean => {
    if (!marker) return false;
    return ALL_CHAR_MARKERS.has(marker) || VALID_NOTE_MARKERS.has(marker);
};

/**
 * A command helper that moves the selection to an adjacent node when it's contextually
 * appropriate, such as when typing a space in a marker or at the end of a number range.
 *
 * This function should be called from a KEY_DOWN_COMMAND listener when the space key is pressed.
 *
 * @param editor The Lexical editor instance.
 * @returns `true` if the selection was moved and the event should be stopped, `false` otherwise.
 */
export function moveToAdjacentNodesWhenSeemsAppropriate(
    editor: LexicalEditor,
    event: KeyboardEvent,
): boolean {
    // We will return this value. It's set to true inside the update if we handle the event.
    let isHandled = false;
    const key = event.key;
    // todo: make trigger configurable
    if (key !== " ") return false;
    const selection = $getSelection();
    // This logic only applies to a collapsed cursor (a caret), not a range selection.
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return false;
    }
    const anchorNode = selection.anchor.getNode();
    const anchorOffset = selection.anchor.offset;
    // Ensure we are inside a USFMTextNode before doing anything.
    if (!$isUSFMTextNode(anchorNode)) {
        return false;
    }
    const isAtEndBoundary =
        anchorOffset >= anchorNode.getTextContent().trim().length;
    if (!isAtEndBoundary) return false;

    // --- Scenario 1: Inside a 'marker' node ---
    if (
        anchorNode.getTokenType() === UsfmTokenTypes.marker ||
        anchorNode.getTokenType() === UsfmTokenTypes.endMarker
    ) {
        const nextSibling = anchorNode.getNextSibling();
        if (nextSibling && $isUSFMTextNode(nextSibling)) {
            // Move the caret to the very beginning of the next node.
            isHandled = true;
            event.preventDefault();
            event.stopPropagation();
            editor.update(() => {
                const marker = anchorNode.getMarker();
                if (!marker) return;
                if (nextSibling.getTokenType() === UsfmTokenTypes.numberRange) {
                    nextSibling.selectEnd();
                } else {
                    const skipLeadingSpaceForBoundary =
                        isCharOrNoteMarkerBoundary(marker);
                    if (
                        !skipLeadingSpaceForBoundary &&
                        !nextSibling.getTextContent().startsWith(" ")
                    ) {
                        nextSibling.setTextContent(
                            ` ${nextSibling.getTextContent()}`,
                        );
                    }
                    const selectOffset = skipLeadingSpaceForBoundary ? 0 : 1;
                    nextSibling.select(selectOffset, selectOffset);
                }
            });
        }
    }
    // --- Scenario 2: Inside a 'numberRange' node ---
    else if (anchorNode.getTokenType() === UsfmTokenTypes.numberRange) {
        const nextSibling = anchorNode.getNextSibling();

        // Check if the next sibling is the specific type we want to jump to.
        if (
            $isUSFMTextNode(nextSibling) &&
            nextSibling.getTokenType() === UsfmTokenTypes.text
        ) {
            // Move the caret to the beginning of that text node.
            isHandled = true;
            event.preventDefault();
            event.stopPropagation();
            editor.update(() => {
                // if for some reason next text node doens't start with space, make sure if does.
                const nextTextContent = nextSibling.getTextContent();
                if (!nextTextContent.startsWith(" ")) {
                    nextSibling.setTextContent(` ${nextTextContent}`);
                }
                nextSibling.select(1, 1);
            });
        }
    }

    return isHandled;
}

export function normalizeSelectionAtHiddenMarkerBoundary(
    editor: LexicalEditor,
): boolean {
    let doNormalize = false;
    let nextNodeKey: string | null = null;

    editor.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
        const anchorNode = selection.anchor.getNode();
        const anchorOffset = selection.anchor.offset;
        if (!$isUSFMTextNode(anchorNode)) return;
        if (anchorNode.getTokenType() !== UsfmTokenTypes.marker) return;
        const markerTextLength = anchorNode.getTextContent().length;
        if (anchorOffset < markerTextLength) return;

        const nextSibling = anchorNode.getNextSibling();
        if (!$isUSFMTextNode(nextSibling)) return;

        const nextTokenType = nextSibling.getTokenType();
        if (
            nextTokenType !== UsfmTokenTypes.numberRange &&
            nextTokenType !== UsfmTokenTypes.text
        ) {
            return;
        }
        nextNodeKey = nextSibling.getKey();
        doNormalize = true;
    });
    if (doNormalize) {
        editor.update(() => {
            if (!nextNodeKey) return;
            const selection = $getSelection();
            if (!$isRangeSelection(selection) || !selection.isCollapsed())
                return;

            const anchorNode = selection.anchor.getNode();
            const anchorOffset = selection.anchor.offset;
            if (!$isUSFMTextNode(anchorNode)) return;
            if (anchorNode.getTokenType() !== UsfmTokenTypes.marker) return;
            if (anchorNode.getTextContent().length > anchorOffset) return;

            const nextSibling = anchorNode.getNextSibling();
            if (!$isUSFMTextNode(nextSibling)) return;
            if (nextSibling.getKey() !== nextNodeKey) return;
            nextSibling.select(0, 0);
        });
    }
    return doNormalize;
}

export function redirectPrintableTypingAtHiddenMarkerBoundary(
    editor: LexicalEditor,
    event: KeyboardEvent,
): boolean {
    if (event.key.length !== 1) return false;
    if (event.key === " ") return false;
    if (event.metaKey || event.ctrlKey) return false;

    let isHandled = false;
    let targetNodeKey: string | null = null;
    let nextTextWithInsertedChar = "";
    let nextOffset = 0;

    editor.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

        const anchorNode = selection.anchor.getNode();
        const anchorOffset = selection.anchor.offset;
        if (!$isUSFMTextNode(anchorNode)) return;

        let targetNode = null;
        if (anchorNode.getTokenType() === UsfmTokenTypes.marker) {
            if (anchorOffset < anchorNode.getTextContent().length) return;
            const nextSibling = anchorNode.getNextSibling();
            if (!$isUSFMTextNode(nextSibling)) return;
            if (
                nextSibling.getTokenType() !== UsfmTokenTypes.numberRange &&
                nextSibling.getTokenType() !== UsfmTokenTypes.text
            ) {
                return;
            }
            targetNode = nextSibling;
        } else if (anchorNode.getTokenType() === UsfmTokenTypes.numberRange) {
            const leadingWhitespaceLength =
                anchorNode.getTextContent().match(/^\s*/u)?.[0].length ?? 0;
            if (anchorOffset > leadingWhitespaceLength) return;
            const previousSibling = anchorNode.getPreviousSibling();
            if (!$isUSFMTextNode(previousSibling)) return;
            if (previousSibling.getTokenType() !== UsfmTokenTypes.marker)
                return;
            targetNode = anchorNode;
        } else {
            return;
        }
        const targetText = targetNode.getTextContent();
        const insertionOffset =
            targetNode.getTokenType() === UsfmTokenTypes.numberRange
                ? (targetText.match(/^\s*/u)?.[0].length ?? 0)
                : 0;
        nextTextWithInsertedChar =
            targetText.slice(0, insertionOffset) +
            event.key +
            targetText.slice(insertionOffset);

        nextOffset = Math.min(
            insertionOffset + 1,
            nextTextWithInsertedChar.length,
        );
        targetNodeKey = targetNode.getKey();
        isHandled = true;
    });

    if (!isHandled || !targetNodeKey) return false;

    event.preventDefault();
    event.stopPropagation();

    editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

        const anchorNode = selection.anchor.getNode();
        const currentNode =
            $isUSFMTextNode(anchorNode) && anchorNode.getKey() === targetNodeKey
                ? anchorNode
                : $isUSFMTextNode(anchorNode)
                  ? anchorNode.getNextSibling()
                  : null;

        if (!$isUSFMTextNode(currentNode)) return;
        if (currentNode.getKey() !== targetNodeKey) return;

        currentNode.setTextContent(nextTextWithInsertedChar);
        currentNode.select(nextOffset, nextOffset);
    });

    return isHandled;
}

/**
 * In regular mode, a caret at the start of a verse number or at the end of its hidden
 * marker can visually mean "delete the linebreak before this verse". Prefer removing that
 * linebreak over deleting `\\v` and leaving the marker/number pair broken apart.
 */
export function handleBackspaceToRemoveLinebreakBeforeVerse(
    editor: LexicalEditor,
    event: KeyboardEvent,
): boolean {
    if (event.key !== "Backspace") return false;

    let isHandled = false;
    let action:
        | {
              kind: "remove-linebreak";
              linebreakKey: string;
              verseNumberKey: string;
              reselectionOffset: number;
          }
        | {
              kind: "merge-paragraph";
              parentParagraphKey: string;
              previousParagraphKey: string;
              verseNumberKey: string;
              reselectionOffset: number;
          }
        | null = null;

    editor.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

        const anchorNode = selection.anchor.getNode();
        const anchorOffset = selection.anchor.offset;
        if (!$isUSFMTextNode(anchorNode)) return;

        const anchorTokenType = anchorNode.getTokenType();
        const anchorText = anchorNode.getTextContent();
        const leadingWhitespaceLength =
            anchorText.match(/^\s*/u)?.[0].length ?? 0;
        const trailingTrimmedLength = anchorText.trimEnd().length;
        const isVerseNumberStart =
            anchorTokenType === UsfmTokenTypes.numberRange &&
            anchorOffset <= leadingWhitespaceLength;
        const isVerseMarkerBoundary =
            anchorTokenType === UsfmTokenTypes.marker &&
            CHAPTER_VERSE_MARKERS.has(anchorNode.getMarker() ?? "") &&
            anchorOffset >= trailingTrimmedLength;

        if (!isVerseNumberStart && !isVerseMarkerBoundary) return;

        const verseMarker = isVerseNumberStart
            ? anchorNode.getPreviousSibling()
            : anchorNode;
        if (!$isUSFMTextNode(verseMarker)) return;
        if (
            verseMarker.getTokenType() !== UsfmTokenTypes.marker ||
            !CHAPTER_VERSE_MARKERS.has(verseMarker.getMarker() ?? "")
        ) {
            return;
        }

        const verseNumber = isVerseNumberStart
            ? anchorNode
            : verseMarker.getNextSibling();
        if (!$isUSFMTextNode(verseNumber)) return;
        if (verseNumber.getTokenType() !== UsfmTokenTypes.numberRange) return;
        if (!verseNumber.getTextContent().trim().length) return;

        const verseNumberLeadingWhitespaceLength =
            verseNumber.getTextContent().match(/^\s*/u)?.[0].length ?? 0;
        const reselectionOffset = isVerseMarkerBoundary
            ? verseNumberLeadingWhitespaceLength
            : Math.min(
                  Math.max(anchorOffset, 0),
                  verseNumberLeadingWhitespaceLength,
              );
        const previousSibling = verseMarker.getPreviousSibling();
        const parentParagraph = verseMarker.getParent();
        if ($isUSFMParagraphNode(parentParagraph)) {
            const paragraphMarker = parentParagraph.getMarker();
            const previousParagraph = parentParagraph.getPreviousSibling();
            const firstMeaningfulChild = parentParagraph
                .getChildren()
                .find((child) => !$isLineBreakNode(child));
            const isParagraphBoundaryBreak =
                Boolean(paragraphMarker) &&
                isValidParaMarker(paragraphMarker ?? "") &&
                $isUSFMParagraphNode(previousParagraph) &&
                firstMeaningfulChild === verseMarker;

            if (isParagraphBoundaryBreak && previousParagraph) {
                isHandled = true;
                action = {
                    kind: "merge-paragraph",
                    parentParagraphKey: parentParagraph.getKey(),
                    previousParagraphKey: previousParagraph.getKey(),
                    verseNumberKey: verseNumber.getKey(),
                    reselectionOffset,
                };
                return;
            }
        }

        if ($isLineBreakNode(previousSibling)) {
            isHandled = true;
            action = {
                kind: "remove-linebreak",
                linebreakKey: previousSibling.getKey(),
                verseNumberKey: verseNumber.getKey(),
                reselectionOffset,
            };
            return;
        }
    });

    if (!isHandled || !action) return false;

    event.preventDefault();
    event.stopPropagation();

    editor.update(() => {
        if (!action) return;

        if (action.kind === "remove-linebreak") {
            const linebreakNode = $getNodeByKey(action.linebreakKey);
            const verseNumberNode = $getNodeByKey(action.verseNumberKey);
            if ($isLineBreakNode(linebreakNode)) {
                linebreakNode.remove();
            }
            if ($isUSFMTextNode(verseNumberNode)) {
                verseNumberNode.select(
                    action.reselectionOffset,
                    action.reselectionOffset,
                );
            }
            return;
        }

        const parentParagraph = $getNodeByKey(action.parentParagraphKey);
        const previousParagraph = $getNodeByKey(action.previousParagraphKey);
        const verseNumberNode = $getNodeByKey(action.verseNumberKey);
        if (
            !$isUSFMParagraphNode(parentParagraph) ||
            !$isUSFMParagraphNode(previousParagraph)
        ) {
            return;
        }

        const previousParagraphLastChild = previousParagraph.getLastChild();
        if ($isLineBreakNode(previousParagraphLastChild)) {
            previousParagraphLastChild.remove();
        }

        const currentChildren = [...parentParagraph.getChildren()];
        for (const child of currentChildren) {
            if (child === currentChildren[0] && $isLineBreakNode(child)) {
                continue;
            }
            previousParagraph.append(child);
        }
        parentParagraph.remove();

        if ($isUSFMTextNode(verseNumberNode)) {
            verseNumberNode.select(
                action.reselectionOffset,
                action.reselectionOffset,
            );
        }
    });

    return isHandled;
}

/**
 * Handles "Enter" key at the start of a number range node by inserting a linebreak
 * BEFORE the preceding marker (if it exists).
 */
export function handleEnterOnStartOfVerse(
    editor: LexicalEditor,
    event: KeyboardEvent,
): boolean {
    if (event.key !== "Enter") return false;

    let isHandled = false;
    editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

        const anchorNode = selection.anchor.getNode();
        const offset = selection.anchor.offset;

        if (!$isUSFMTextNode(anchorNode)) return;

        // Check if we are at the start of a number range
        if (
            anchorNode.getTokenType() === UsfmTokenTypes.numberRange &&
            offset === 0
        ) {
            const prevSibling = anchorNode.getPreviousSibling();

            // Check if previous sibling is a marker node (e.g., \v)
            if (
                prevSibling &&
                $isUSFMTextNode(prevSibling) &&
                prevSibling.getTokenType() === UsfmTokenTypes.marker
            ) {
                // Insert linebreak before the marker
                const lineBreak = $createLineBreakNode();
                prevSibling.insertBefore(lineBreak);

                // Prevent default behavior (don't split the number range)
                event.preventDefault();
                event.stopPropagation();
                isHandled = true;
            }
        }
    });

    return isHandled;
}

/**
 * Handles backslash ("\") key at the start of a number range node by creating
 * a new text node BEFORE the preceding marker (if it exists) and focusing it.
 */
export function handleBackslashOnStartOfVerse(
    editor: LexicalEditor,
    event: KeyboardEvent,
): boolean {
    if (event.key !== "\\") return false;

    let isHandled = false;
    editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

        const anchorNode = selection.anchor.getNode();
        const offset = selection.anchor.offset;

        if (!$isUSFMTextNode(anchorNode)) return;

        // Check if we are at the start of a number range
        if (
            anchorNode.getTokenType() === UsfmTokenTypes.numberRange &&
            offset === 0
        ) {
            const prevSibling = anchorNode.getPreviousSibling();

            // Check if previous sibling is a marker node (e.g., \v)
            if (
                prevSibling &&
                $isUSFMTextNode(prevSibling) &&
                prevSibling.getTokenType() === UsfmTokenTypes.marker
            ) {
                const newTextNode = $createUSFMTextNode("\\", {
                    id: guidGenerator(),
                    tokenType: UsfmTokenTypes.text,
                    inPara: prevSibling.getInPara(),
                    sid: prevSibling.getSid(),
                    isMutable: true,
                    show: true,
                });

                prevSibling.insertBefore(newTextNode);
                newTextNode.select();

                event.preventDefault();
                event.stopPropagation();
                isHandled = true;
            }
        }
    });

    return isHandled;
}
