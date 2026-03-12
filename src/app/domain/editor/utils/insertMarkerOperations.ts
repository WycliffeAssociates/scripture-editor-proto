import { $reverseDfsIterator } from "@lexical/utils";
import {
    $createLineBreakNode,
    $getRoot,
    $getSelection,
    $isLineBreakNode,
    $isRangeSelection,
    type LexicalNode,
} from "lexical";
import { type EditorModeSetting, UsfmTokenTypes } from "@/app/data/editor.ts";
import { $createUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
    $createUSFMParagraphNode,
    $isUSFMParagraphNode,
} from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
    type USFMTextNodeMetadata,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { type ParsedReference, parseSid } from "@/core/data/bible/bible.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import {
    isValidParaMarker,
    VALID_CHAR_MARKERS,
    VALID_NOTE_MARKERS,
    VALID_PARA_MARKERS,
} from "@/core/domain/usfm/onionMarkers.ts";

export const InsertionTypes = {
    chapter: "chapter",
    verse: "verse",
    para: "para",
    char: "char",
    note: "note",
    endMarker: "endMarker",
} as const;

export type InsertionType =
    (typeof InsertionTypes)[keyof typeof InsertionTypes];

export type BaseInsertArgs = {
    anchorNode: USFMTextNode;
    anchorOffsetToUse: number;
    marker: string;
    isStartOfLine: boolean;
    restOfText: string;
    languageDirection: "ltr" | "rtl";
    isTypedInsertion?: boolean;
    editorMode: EditorModeSetting;
};

type InsertContext = {
    nearestParaMarker: string;
    prevSidInfo: ParsedReference | null;
    currentSidAsString: string;
    newSid: string;
};

// ============================================================================
// Shared Context & Node Creation
// ============================================================================

/**
 * Gets common context needed for all marker insertions
 */
function $getInsertionContext(anchorNode: USFMTextNode): InsertContext {
    const { nearestParaMarker, prevSidInfo } =
        findContextForVerseInsert(anchorNode);

    const prevVerseEnd = prevSidInfo?.verseEnd ?? 1;
    const newSid = `${prevSidInfo?.book} ${prevSidInfo?.chapter}:${
        prevVerseEnd + 1
    }`;

    return {
        nearestParaMarker: nearestParaMarker ?? "",
        prevSidInfo,
        currentSidAsString: prevSidInfo?.toSidString() ?? "",
        newSid,
    };
}

/**
 * Creates a USFM marker node with common properties
 */
type CreatMarkerNodeArgs = {
    marker: string;
    context: InsertContext;
    tokenType: (typeof UsfmTokenTypes)[keyof typeof UsfmTokenTypes];
    sid: string;
    inCharMarkers?: string[];
    isEndMarker?: boolean;
};
function $createMarkerNode({
    marker,
    context,
    tokenType,
    sid,
    inCharMarkers,
    isEndMarker,
}: CreatMarkerNodeArgs): USFMTextNode {
    const markerText = isEndMarker ? `\\${marker}*` : `\\${marker}`;
    return $createUSFMTextNode(markerText, {
        id: guidGenerator(),
        inPara: context.nearestParaMarker,
        tokenType: tokenType,
        marker,
        sid,
        inChars: inCharMarkers,
    });
}

/**
 * Creates a text node with common properties
 */
type CreateContextTextNodeArgs = {
    text: string;
    context: InsertContext;
    tokenType: (typeof UsfmTokenTypes)[keyof typeof UsfmTokenTypes];
    extraProps?: Partial<USFMTextNodeMetadata>;
};
function $createContextTextNode({
    text,
    context,
    tokenType,
    extraProps,
}: CreateContextTextNodeArgs): USFMTextNode {
    return $createUSFMTextNode(text, {
        id: guidGenerator(),
        inPara: context.nearestParaMarker,
        tokenType: tokenType,
        sid: context.currentSidAsString,
        ...extraProps,
    });
}

/**
 * Ensures a linebreak precedes the given node
 */
function $ensureLineBreakBefore(node: USFMTextNode): void {
    const prevSibling = node.getPreviousSibling();
    const isLineBreak = prevSibling && $isLineBreakNode(prevSibling);

    if (!isLineBreak) {
        const lineBreakNode = $createLineBreakNode();
        node.insertBefore(lineBreakNode);
    }
}
// ============================================================================
// Insertion Type Mapping
// ============================================================================

export function mapMarkerToInsertionType(
    marker: string,
    isEndMarker: boolean,
): InsertionType {
    if (isEndMarker) {
        return InsertionTypes.endMarker;
    }
    if (marker === "v") {
        return InsertionTypes.verse;
    }
    if (marker === "c") {
        return InsertionTypes.chapter;
    }
    if (VALID_PARA_MARKERS.has(marker)) {
        return InsertionTypes.para;
    }
    if (VALID_CHAR_MARKERS.has(marker)) {
        return InsertionTypes.char;
    }
    if (VALID_NOTE_MARKERS.has(marker)) {
        return InsertionTypes.note;
    }
    return InsertionTypes.para; // default fallback
}

function findContextForVerseInsert(anchorNode: LexicalNode): {
    nearestParaMarker: string | null;
    prevSidInfo: ParsedReference | null;
} {
    let nearestParaMarker: string | null = null;
    let prevSidInfo: ParsedReference | null = null;

    //   todo: what if this is verse one? or at start of blank chap. We could just I guess return a default #, but that could be annoying to delete as opposed ot knowing the pickedBook andChapter
    for (const { node } of $reverseDfsIterator(anchorNode, $getRoot())) {
        if ($isUSFMTextNode(node)) {
            const tokenType = node.getTokenType();

            if (!prevSidInfo && tokenType === UsfmTokenTypes.numberRange) {
                prevSidInfo = parseSid(node.getSid() ?? "");
            }

            if (!nearestParaMarker && tokenType === UsfmTokenTypes.marker) {
                const marker = node.getMarker() ?? "";
                if (isValidParaMarker(marker)) {
                    nearestParaMarker = marker;
                }
            }

            // stop once both are found
            if (prevSidInfo && nearestParaMarker) break;
        }
    }

    return { nearestParaMarker, prevSidInfo };
}

export function $insertEndMarker(args: BaseInsertArgs): void {
    const { anchorNode, marker, isStartOfLine, isTypedInsertion } = args;

    const context = $getInsertionContext(anchorNode);

    // Create nodes
    const markerNode = $createMarkerNode({
        marker,
        context,
        tokenType: UsfmTokenTypes.endMarker,
        sid: anchorNode.getSid(),
        isEndMarker: true,
    });

    if (!isStartOfLine) {
        const [left, right] = anchorNode.splitText(args.anchorOffsetToUse);
        const textContent = left.getTextContent().trimEnd();
        const woMarker = isTypedInsertion
            ? `${textContent.slice(0, -markerNode.getTextContentSize())}`
            : textContent;
        left?.setTextContent(woMarker);
        if ($isUSFMTextNode(right) && right.getSid() !== anchorNode.getSid()) {
            right.setSid(anchorNode.getSid());
        }

        left.insertAfter(markerNode);
        right?.setTextContent(` ${right.getTextContent().trimStart()}`);
        if (!right) {
            markerNode.selectEnd();
        } else {
            right.selectStart();
        }
    } else {
        if (isTypedInsertion) {
            anchorNode.replace(markerNode);
        } else {
            anchorNode.insertBefore(markerNode);
        }
        markerNode.selectEnd();
    }
}

export function $insertVerse(args: BaseInsertArgs, verseNumber?: string): void {
    const { anchorNode, marker, isStartOfLine, isTypedInsertion } = args;

    const context = $getInsertionContext(anchorNode);

    // Create nodes
    const markerNode = $createMarkerNode({
        marker,
        context,
        tokenType: UsfmTokenTypes.marker,
        sid: context.newSid,
    });

    const createNumberRange = (text: string) =>
        $createContextTextNode({
            text:
                /^\s/u.test(text) || text.trim().length === 0
                    ? text
                    : ` ${text}`,
            context,
            tokenType: UsfmTokenTypes.numberRange,
            extraProps: { sid: context.newSid },
        });

    if (!isStartOfLine) {
        // Mid-line insertion
        const [left, right] = anchorNode.splitText(args.anchorOffsetToUse);
        const textContent = left.getTextContent().trimEnd();
        const woMarker = isTypedInsertion
            ? `${textContent.slice(0, -markerNode.getTextContentSize())}`
            : textContent;
        left?.setTextContent(woMarker);
        if ($isUSFMTextNode(right)) right.setSid(context.newSid);

        left.insertAfter(markerNode);

        const numberRange = createNumberRange(verseNumber || " ");
        markerNode.insertAfter(numberRange);

        right?.setTextContent(` ${right.getTextContent().trimStart()}`);

        numberRange.select();
    } else {
        // Start of line insertion
        const sibling = anchorNode.getNextSibling();

        if (isTypedInsertion) {
            anchorNode.replace(markerNode);
        } else {
            anchorNode.insertBefore(markerNode);
        }

        // check if there is a number range sibling already?
        // If so, select it. If not, create one and select it.
        if (
            sibling &&
            $isUSFMTextNode(sibling) &&
            sibling.getTokenType() === UsfmTokenTypes.numberRange
        ) {
            sibling.selectStart();
        } else {
            const numberRange = createNumberRange(verseNumber || " ");
            markerNode.insertAfter(numberRange);
            numberRange.select();
        }
    }
}

// ============================================================================
// Chapter Insertion
// ============================================================================
// todo: we actually shouldn't allow inserting chapters since we break on as a ux division of edit per chapter
export function $insertChapter(args: BaseInsertArgs): void {
    const { anchorNode, marker, isStartOfLine, isTypedInsertion } = args;

    const context = $getInsertionContext(anchorNode);

    // Create nodes
    const markerNode = $createMarkerNode({
        marker,
        context,
        tokenType: UsfmTokenTypes.marker,
        sid: context.currentSidAsString,
    });

    const createEmptyNumberRange = () =>
        $createContextTextNode({
            text: " ",
            context,
            tokenType: UsfmTokenTypes.numberRange,
        });

    if (!isStartOfLine) {
        // Chapter must be at start of line - split and insert linebreak
        const [left] = anchorNode.splitText(args.anchorOffsetToUse);
        const textContent = left.getTextContent().trimEnd();
        const woMarker = isTypedInsertion
            ? textContent.slice(0, -markerNode.getTextContentSize())
            : textContent;
        left?.setTextContent(woMarker);

        // Insert linebreak
        const lineBreakNode = $createLineBreakNode();
        left.insertAfter(lineBreakNode);
        lineBreakNode.insertAfter(markerNode);

        // Let maintainMetadata recompute SIDs from markers; do not force a new SID.

        const numberRange = createEmptyNumberRange();
        markerNode.insertAfter(numberRange);
        numberRange.select();
    } else {
        // Ensure linebreak before
        $ensureLineBreakBefore(anchorNode);

        if (isTypedInsertion) {
            anchorNode.replace(markerNode);
        } else {
            anchorNode.insertBefore(markerNode);
        }

        const sibling = markerNode.getNextSibling();

        if (
            sibling &&
            $isUSFMTextNode(sibling) &&
            sibling.getTokenType() === UsfmTokenTypes.numberRange
        ) {
            sibling.selectStart();
        } else {
            const numberRange = createEmptyNumberRange();
            markerNode.insertAfter(numberRange);
            numberRange.select();
        }
    }
}

// ============================================================================
// Para Insertion
// ============================================================================

export function $insertPara(args: BaseInsertArgs): void {
    // Regular mode uses tree structure with USFMParagraphNode containers
    if (args.editorMode === "regular") {
        $insertParaRegularMode(args);
    } else {
        $insertParaSourceMode(args);
    }
}

/**
 * Regular-mode paragraph insertion: split current paragraph container at caret
 * and move remainder children into a new paragraph container.
 */
function $insertParaRegularMode(args: BaseInsertArgs): void {
    const { anchorNode, anchorOffsetToUse, marker, isTypedInsertion } = args;

    // Find the parent paragraph container
    const parentParagraph = anchorNode.getParent();
    if (!parentParagraph || !$isUSFMParagraphNode(parentParagraph)) {
        // Fallback to source mode behavior if not in a paragraph container
        $insertParaSourceMode(args);
        return;
    }

    const children = parentParagraph.getChildren();
    const anchorIndex = children.indexOf(anchorNode);
    if (anchorIndex === -1) {
        $insertParaSourceMode(args);
        return;
    }

    const context = $getInsertionContext(anchorNode);

    const ensureTrailingLineBreak = (para: LexicalNode) => {
        if (!$isUSFMParagraphNode(para)) return;
        const last = para.getLastChild();
        if (!last || !$isLineBreakNode(last)) {
            para.append($createLineBreakNode());
        }
    };

    const moveSiblingsIntoNewParagraph = (start: LexicalNode | null) => {
        if (!start) return;

        // Paragraph containers in Regular mode typically end with a LineBreakNode.
        // That newline is needed so the *next* container marker doesn't serialize
        // on the same line (e.g. `\\q \\p ...`). Keep that terminator with the
        // original paragraph and add a new terminator to the inserted paragraph.
        const terminator = (() => {
            const last = parentParagraph.getLastChild();
            return last && $isLineBreakNode(last) ? last : null;
        })();

        let curr: LexicalNode | null = start;
        while (curr && curr !== terminator) {
            const nextSibling: LexicalNode | null = curr.getNextSibling();
            if (curr.isAttached()) {
                newParagraph.append(curr);
            }
            curr = nextSibling;
        }
    };

    // Determine if we need to split the anchor node itself
    const textContent = anchorNode.getTextContent();
    const needsSplit =
        anchorOffsetToUse > 0 && anchorOffsetToUse < textContent.length;

    // Create the new paragraph container
    const newParagraph = $createUSFMParagraphNode({
        id: guidGenerator(),
        marker,
        tokenType: UsfmTokenTypes.marker,
    });

    // Insert the new paragraph after the current one
    parentParagraph.insertAfter(newParagraph);

    if (needsSplit) {
        // Split the anchor node at caret position
        let splitOffset = anchorOffsetToUse;
        if (isTypedInsertion) {
            // Remove the typed marker text from the left side
            const markerTextLength = marker.length + 1; // \marker
            splitOffset = Math.max(0, anchorOffsetToUse - markerTextLength);
        }

        const [left, right] = anchorNode.splitText(splitOffset) as [
            USFMTextNode,
            USFMTextNode | undefined,
        ];

        // Clean up left side
        if (left && isTypedInsertion) {
            const leftText = left.getTextContent().trimEnd();
            left.setTextContent(leftText);
        }

        // Move right portion and all subsequent siblings to new paragraph.
        // Do NOT mutate SIDs here; paragraph markers do not create new verse SIDs.
        moveSiblingsIntoNewParagraph(right ?? null);
    } else if (anchorOffsetToUse === 0) {
        // Caret at start of anchor node - move anchor and all subsequent siblings
        if (isTypedInsertion) {
            // Remove the typed marker from the anchor
            const cleanText = textContent.replace(
                new RegExp(`^\\\\${marker}\\s*`),
                "",
            );
            anchorNode.setTextContent(cleanText || " ");
        }

        // Move anchor and all subsequent siblings to new paragraph (keep terminator on original)
        moveSiblingsIntoNewParagraph(anchorNode);
    } else {
        // Caret at end of anchor - move all subsequent siblings (keep terminator on original)
        moveSiblingsIntoNewParagraph(anchorNode.getNextSibling());
    }

    // Ensure the new paragraph has at least one editable child
    if (newParagraph.getChildrenSize() === 0) {
        const placeholder = $createUSFMTextNode(" ", {
            id: guidGenerator(),
            tokenType: UsfmTokenTypes.text,
            sid: context.currentSidAsString,
        });
        newParagraph.append(placeholder);
    }

    // Ensure the original paragraph still has content
    if (parentParagraph.getChildrenSize() === 0) {
        const placeholder = $createUSFMTextNode(" ", {
            id: guidGenerator(),
            tokenType: UsfmTokenTypes.text,
            sid: context.currentSidAsString,
        });
        parentParagraph.append(placeholder);
    }

    // Ensure both paragraphs remain line-terminated so subsequent markers don't run inline.
    ensureTrailingLineBreak(parentParagraph);
    ensureTrailingLineBreak(newParagraph);

    // Canonical whitespace placement: if the paragraph begins with plain text,
    // ensure it carries the separator whitespace as leading whitespace.
    const firstEditable = newParagraph
        .getChildren()
        .find(
            (c) =>
                $isUSFMTextNode(c) && c.getTokenType() === UsfmTokenTypes.text,
        ) as USFMTextNode | undefined;
    if (firstEditable) {
        const content = firstEditable.getTextContent();
        if (content.length > 0 && !/^\s/u.test(content)) {
            firstEditable.setTextContent(` ${content}`);
        }
    }

    // Select the start of the new paragraph
    const firstChild = newParagraph.getFirstChild();
    if (firstChild && $isUSFMTextNode(firstChild)) {
        firstChild.selectStart();
    }
}

/**
 * Source-mode paragraph insertion: flat token stream, insert marker node with linebreaks.
 */
function $insertParaSourceMode(args: BaseInsertArgs): void {
    const { anchorNode, marker, isStartOfLine, isTypedInsertion } = args;

    const context = $getInsertionContext(anchorNode);
    const markerNode = $createMarkerNode({
        marker,
        context,
        tokenType: UsfmTokenTypes.marker,
        sid: context.currentSidAsString,
    });

    if (!isStartOfLine) {
        // Para should be at start of line - split and insert linebreak
        const [left, right] = anchorNode.splitText(args.anchorOffsetToUse) as [
            USFMTextNode,
            USFMTextNode,
        ];
        const textContent = left.getTextContent().trimEnd();
        const woMarker = isTypedInsertion
            ? `${textContent.slice(0, -markerNode.getTextContentSize())}`
            : textContent;
        left?.setTextContent(woMarker);
        left.insertAfter(markerNode);
        right?.setTextContent(` ${right.getTextContent().trimStart()}`);
        $ensureLineBreakBefore(markerNode);

        if ($isUSFMTextNode(right)) {
            right.setInPara(marker);
            right.selectStart();
        }
        const nextSibling = anchorNode.getNextSibling();
        if (nextSibling && $isUSFMTextNode(nextSibling)) {
            nextSibling.selectStart();
        } else {
            const blankTextNode = $createContextTextNode({
                text: " ",
                context,
                tokenType: UsfmTokenTypes.text,
                extraProps: { inPara: marker },
            });
            markerNode.insertAfter(blankTextNode);
            blankTextNode.selectStart();
        }
    } else {
        $ensureLineBreakBefore(anchorNode);

        const nextSibling = anchorNode.getNextSibling();

        if (isTypedInsertion) {
            anchorNode.replace(markerNode);
        } else {
            anchorNode.insertBefore(markerNode);
        }

        if ($isUSFMTextNode(nextSibling)) {
            if (
                nextSibling.getTokenType() === UsfmTokenTypes.text &&
                nextSibling.getTextContent().length > 0 &&
                !/^\s/u.test(nextSibling.getTextContent())
            ) {
                nextSibling.setTextContent(` ${nextSibling.getTextContent()}`);
            }
            nextSibling.selectStart();
        } else {
            // No suitable sibling - create empty text node
            const blankTextNode = $createContextTextNode({
                text: " ",
                context,
                tokenType: UsfmTokenTypes.text,
                extraProps: { inPara: marker },
            });
            markerNode.insertAfter(blankTextNode);
            blankTextNode.select();
        }
    }
}

// ============================================================================
// Char Insertion (wraps selection)
// ============================================================================

export function $insertChar(args: BaseInsertArgs): void {
    const { anchorNode, marker, isStartOfLine, isTypedInsertion } = args;

    const context = $getInsertionContext(anchorNode);
    const selection = $getSelection();

    if (!$isRangeSelection(selection)) return;
    const common: CreatMarkerNodeArgs = {
        marker,
        context,
        tokenType: UsfmTokenTypes.marker,
        inCharMarkers: [marker],
        sid: context.currentSidAsString,
    };
    const openingMarker = $createMarkerNode(common);
    const closingMarker = $createMarkerNode({
        ...common,
        tokenType: UsfmTokenTypes.endMarker,
        isEndMarker: true,
    });

    if (selection.isCollapsed()) {
        // No selection - insert empty char markers with space between
        const emptyTextNode = $createContextTextNode({
            text: " ",
            context,
            tokenType: UsfmTokenTypes.text,
            extraProps: { inChars: [marker] },
        });

        const offset = selection.anchor.offset;

        if (!isStartOfLine) {
            // Mid-line: remove marker from text, split, and insert
            const letterAtOffset = anchorNode.getTextContent().charAt(offset);
            const trueOffset =
                isTypedInsertion && letterAtOffset === "\\"
                    ? offset + openingMarker.getTextContentSize()
                    : offset;
            const [left, right] = anchorNode.splitText(trueOffset);
            const textContent = left.getTextContent().trimEnd();
            const woMarker = isTypedInsertion
                ? `${textContent.slice(0, -openingMarker.getTextContentSize())} `
                : `${textContent} `;
            left?.setTextContent(woMarker);

            left.insertAfter(openingMarker);
            openingMarker.insertAfter(emptyTextNode);
            emptyTextNode.insertAfter(closingMarker);

            right?.setTextContent(`\u00A0${right.getTextContent()}`);
            emptyTextNode.select();
        } else {
            // Start of line: replace anchor node
            const sibling = anchorNode.getNextSibling();
            if (isTypedInsertion) {
                anchorNode.replace(openingMarker);
            } else {
                anchorNode.insertBefore(openingMarker);
            }

            openingMarker.insertAfter(emptyTextNode);
            emptyTextNode.insertAfter(closingMarker);

            if (sibling && $isUSFMTextNode(sibling)) {
                // No SID changes for char wrapping; maintainMetadata will keep things consistent.
            }

            emptyTextNode.select();
        }
    } else {
        // Wrap selection
        const { anchor, focus } = selection;
        const isBackward = selection.isBackward();

        const startOffset = isBackward ? focus.offset : anchor.offset;
        const endOffset = isBackward ? anchor.offset : focus.offset;

        // First, remove the marker text from the beginning
        const textContent = anchorNode.getTextContent();
        const markerPattern = new RegExp(`\\\\${marker}\\s*`);
        const markerMatch = textContent.match(markerPattern);

        if (markerMatch && markerMatch.index !== undefined) {
            const markerLength = markerMatch[0].length;
            const cleanedText =
                textContent.slice(0, markerMatch.index) +
                textContent.slice(markerMatch.index + markerLength);
            anchorNode.setTextContent(cleanedText);

            // Adjust offsets since we removed the marker
            const adjustedStart =
                startOffset > markerMatch.index
                    ? Math.max(markerMatch.index, startOffset - markerLength)
                    : startOffset;
            const adjustedEnd =
                endOffset > markerMatch.index
                    ? Math.max(markerMatch.index, endOffset - markerLength)
                    : endOffset;

            // Split at adjusted selection boundaries
            const [before, middle] = anchorNode.splitText(adjustedStart);
            const [selected] = (middle || before).splitText(
                adjustedEnd - adjustedStart,
            );

            // Insert markers around selection
            selected.insertBefore(openingMarker);
            selected.insertAfter(closingMarker);

            // Restore selection
            selected.select();
        }
    }
}

// ============================================================================
// Note Insertion (placeholder - similar to char)
// ============================================================================

export function $insertNote(args: BaseInsertArgs): void {
    const { anchorNode, marker, isStartOfLine, isTypedInsertion } = args;

    const context = $getInsertionContext(anchorNode);
    const selection = $getSelection();

    if (!$isRangeSelection(selection)) return;

    if (args.editorMode !== "regular") {
        // In USFM/Plain mode, notes are edited inline as flat tokens (no nested decorator).
        // Insert a minimal `\f + \f*` scaffold and place the cursor inside.
        const openingMarker = $createUSFMTextNode(`\\${marker} `, {
            id: guidGenerator(),
            inPara: context.nearestParaMarker,
            tokenType: UsfmTokenTypes.marker,
            marker,
            sid: context.currentSidAsString,
        });
        const caller = $createContextTextNode({
            text: "+",
            context,
            tokenType: UsfmTokenTypes.text,
        });
        const inner = $createContextTextNode({
            text: " ",
            context,
            tokenType: UsfmTokenTypes.text,
        });
        const closingMarker = $createUSFMTextNode(`\\${marker}*`, {
            id: guidGenerator(),
            inPara: context.nearestParaMarker,
            tokenType: UsfmTokenTypes.endMarker,
            marker,
            sid: context.currentSidAsString,
        });

        const offset = selection.anchor.offset;

        if (!isStartOfLine) {
            const letterAtOffset = anchorNode.getTextContent().charAt(offset);
            const trueOffset =
                isTypedInsertion && letterAtOffset === "\\"
                    ? offset + openingMarker.getTextContentSize()
                    : offset;
            const [left, right] = anchorNode.splitText(trueOffset);
            const textContent = left.getTextContent().trimEnd();
            const woMarker = isTypedInsertion
                ? `${textContent.slice(0, -openingMarker.getTextContentSize())}`
                : textContent;
            left?.setTextContent(woMarker);

            left.insertAfter(openingMarker);
            openingMarker.insertAfter(caller);
            caller.insertAfter(inner);
            inner.insertAfter(closingMarker);

            right?.setTextContent(` ${right.getTextContent().trimStart()}`);
            inner.select();
        } else {
            const sibling = anchorNode.getNextSibling();

            if (isTypedInsertion) {
                anchorNode.replace(openingMarker);
            } else {
                anchorNode.insertBefore(openingMarker);
            }

            openingMarker.insertAfter(caller);
            caller.insertAfter(inner);
            inner.insertAfter(closingMarker);

            if (sibling && $isUSFMTextNode(sibling)) {
                sibling.setTextContent(
                    ` ${sibling.getTextContent().trimStart()}`,
                );
            }
            inner.select();
        }

        return;
    }

    // Notes often use implicit closure (e.g., \f...\f*)
    const noteNode = $createUSFMNestedEditorNode({
        text: `\\${marker} `,
        marker,
        id: guidGenerator(),
        usfmType: marker,
        languageDirection: args.languageDirection,
        sid: context.currentSidAsString,
        lintErrors: [],
        isOpen: true,
    });
    const offset = $isRangeSelection(selection)
        ? selection.anchor.offset
        : anchorNode.getTextContentSize();

    if (!isStartOfLine) {
        const letterAtOffset = anchorNode.getTextContent().charAt(offset);
        const trueOffset =
            isTypedInsertion && letterAtOffset === "\\"
                ? offset + noteNode.getTextContentSize()
                : offset;
        const [left, right] = anchorNode.splitText(trueOffset);
        const textContent = left.getTextContent().trimEnd();
        const woMarker = isTypedInsertion
            ? `${textContent.slice(0, -noteNode.getTextContentSize())}`
            : textContent;
        left?.setTextContent(woMarker);
        left.insertAfter(noteNode);
        right?.setTextContent(` ${right.getTextContent().trimStart()}`);
    } else {
        if (isTypedInsertion) {
            anchorNode.replace(noteNode);
        } else {
            anchorNode.insertBefore(noteNode);
        }
    }
}
