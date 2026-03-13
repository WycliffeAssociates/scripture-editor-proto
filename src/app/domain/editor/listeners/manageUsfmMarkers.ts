import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";
import { type EditorModeSetting, UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { ALL_USFM_MARKERS } from "@/core/domain/usfm/onionMarkers.ts";
import {
    $insertChapter,
    $insertChar,
    $insertEndMarker,
    $insertNote,
    $insertPara,
    $insertVerse,
    type BaseInsertArgs,
    InsertionTypes,
    mapMarkerToInsertionType,
} from "../utils/insertMarkerOperations.ts";

const markerTokenMatchLineStartOptOptionalPadding =
    /^\s*\\(?:\+)?([\w\d]+-?\w*)\s*/u;
const markerTokenMatchLineStartSpaceReq = /^\\(?:\+)?([\w\d]+-?\w*)\*?\s+/u;
const markerTokenMatchLineMid = /\s+\\(?:\+)?([\w\d]+-?\w*)\*?\s/u;

// opt whitespace, 1+ digits, (opt hyphen, 1+ digits), opt whitespace
// const _verseRangeValidRegex = /^\s*\d+(-\d+)?\s*$/;

type TextNodeTransformParams = {
    node: USFMTextNode;
    editor: LexicalEditor;
    editorMode: EditorModeSetting;
    languageDirection: "ltr" | "rtl";
};
export function textNodeTransform({
    node,
    editorMode,
    languageDirection,
}: TextNodeTransformParams) {
    // Regular mode (WYSIWYG) currently inserts markers via UI actions, not typed USFM.
    if (editorMode === "regular" || editorMode === "view") return;

    const text = node.getTextContent();
    const tokenType = node.getTokenType();
    const selection = $getSelection();

    if (
        tokenType !== UsfmTokenTypes.text &&
        tokenType !== UsfmTokenTypes.marker &&
        tokenType !== UsfmTokenTypes.endMarker
    )
        return;

    // The transform should only fire when the user is actively typing,
    // which is best represented by a collapsed cursor (not a range selection).
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return;
    }
    const anchorNode = selection.anchor.getNode();

    // This transform runs for a specific `node`. We must ensure the cursor
    // is actually inside THIS node before proceeding.
    if (selection.anchor.key !== node.getKey()) {
        return;
    }
    const isAlreadyMarker = tokenType === UsfmTokenTypes.marker;
    const isAlreadyEndMarker = tokenType === UsfmTokenTypes.endMarker;
    if (
        (isAlreadyMarker || isAlreadyEndMarker) &&
        $isUSFMTextNode(anchorNode)
    ) {
        // if there is more than one \\, trim start, split on space index;
        const numSlashes = text.split("\\").length;
        if (numSlashes > 2) {
            const spaceIndex = text.trimStart().indexOf(" ");
            const [left, right] = anchorNode.splitText(spaceIndex);
            const markerOrEnd = isAlreadyMarker
                ? UsfmTokenTypes.marker
                : UsfmTokenTypes.endMarker;
            if ($isUSFMTextNode(left)) {
                const currentTokenTypeLeft = left.getTokenType();
                if (isAlreadyMarker && currentTokenTypeLeft !== markerOrEnd) {
                    left.setTokenType(markerOrEnd);
                }
            }
            if ($isUSFMTextNode(right)) {
                const currentTokenTypeRight = right.getTokenType();
                if (
                    isAlreadyEndMarker &&
                    currentTokenTypeRight !== markerOrEnd
                ) {
                    right.setTokenType(markerOrEnd);
                }
            }
        }
        return;
    }

    const markerMatch = text.match(markerTokenMatchLineStartSpaceReq); // example: \v , \c , \q
    // const isHandledVerseRangeNode = verseNumberTransform(node);
    // if (isHandledVerseRangeNode) return;

    const inMidMatch = text.match(markerTokenMatchLineMid);
    if (!markerMatch && !inMidMatch) return;
    const marker = markerMatch?.[1] || inMidMatch?.[1];
    if (!marker) return;
    const isEndMarker =
        !!markerMatch?.[0].includes("*") || !!inMidMatch?.[0].includes("*");
    const isValidMarker = ALL_USFM_MARKERS.has(marker);
    const anchorOffset = selection.anchor.offset;
    const isStartOfLine =
        selection.anchor.type === "text"
            ? anchorOffset === anchorNode.getTextContentSize() &&
              anchorOffset === markerMatch?.[0].length
            : false;

    let anchorOffsetToUse = anchorOffset;
    if (inMidMatch && inMidMatch.index !== undefined) {
        anchorOffsetToUse = inMidMatch.index + inMidMatch[0].trimEnd().length;
    } else if (markerMatch && markerMatch.index !== undefined) {
        anchorOffsetToUse = markerMatch.index + markerMatch[0].trimEnd().length;
    }
    // const isVeryEndOfLine = anchorOffset === anchorNode.getTextContentSize();
    if (!isValidMarker) return;
    // if we're collapsed, event though there's a space, wait til our cursor is in the space

    const insertType = mapMarkerToInsertionType(marker, isEndMarker);
    const restOfText = text.slice(markerMatch?.[0].length ?? 0);

    const baseArgs: BaseInsertArgs = {
        anchorNode: node,
        anchorOffsetToUse,
        marker,
        isStartOfLine,
        restOfText,
        languageDirection,
        isTypedInsertion: true,
        editorMode,
    };

    /* 
    simple: marker + space
    withNumberRange: marker + space + numberRange
    char + with open + close
    noteChar -> usually uses implicit closure

    there are rules for others as well, i.e. a para marker shouldn't be inline; Can start a line, but must be preceeded by a newline, so for those, if in middle, we split text + insert nl + para marker + rest of split text? 
    */
    switch (insertType) {
        case InsertionTypes.verse:
            return $insertVerse(baseArgs);
        // todo: decide on enable?
        case InsertionTypes.chapter:
            return $insertChapter(baseArgs);
        case InsertionTypes.para:
            return $insertPara(baseArgs);
        case InsertionTypes.char:
            return $insertChar(baseArgs);
        case InsertionTypes.note:
            return $insertNote(baseArgs);
        case InsertionTypes.endMarker:
            return $insertEndMarker(baseArgs);
    }
}

export function inverseTextNodeTransform({ node }: TextNodeTransformParams) {
    const undoableNodeTypes = [
        UsfmTokenTypes.marker,
        UsfmTokenTypes.numberRange,
    ];
    const nodeTokenType = node.getTokenType();
    // @ts-expect-error: set includsion dhceck.
    if (!undoableNodeTypes.includes(nodeTokenType)) return;
    const content = node.getTextContent();

    if (nodeTokenType === UsfmTokenTypes.marker) {
        // if it no longer is a valid marker, turn it back to a regular text node
        const match = content.match(
            markerTokenMatchLineStartOptOptionalPadding,
        );
        const marker = match?.[1];
        const isValid = marker ? ALL_USFM_MARKERS.has(marker) : false;
        if (isValid) return;

        const replacement = $createUSFMTextNode(
            node.getTextContent().trimEnd(),
            {
                id: node.getId(),
                sid: node.getSid(),
                inPara: node.getInPara(),
                tokenType: UsfmTokenTypes.text,
            },
        );
        node.replace(replacement);
        replacement.select();
    }
    if (nodeTokenType === UsfmTokenTypes.numberRange) {
        // const isValid = numRangeAtTokenStartWithWsRe.test(content);
        // if (isValid) return;
        // const replacement = $createUSFMTextNode(node.getTextContent().trimEnd(), {
        //   id: node.getId(),
        //   sid: node.getSid(),
        //   inPara: node.getInPara(),
        //   tokenType: UsfmTokenTypes.text,
        // });
        // node.replace(replacement);
        // replacement.select();
    }
}
