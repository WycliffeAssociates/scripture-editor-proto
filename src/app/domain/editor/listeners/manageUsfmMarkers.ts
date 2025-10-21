import { $reverseDfsIterator } from "@lexical/utils";
import {
    $getRoot,
    $getSelection,
    $isRangeSelection,
    HISTORY_MERGE_TAG,
    type LexicalEditor,
    type LexicalNode,
} from "lexical";
import {
    type EditorMarkersMutableState,
    EditorMarkersMutableStates,
    type EditorMarkersViewState,
    EditorMarkersViewStates,
    type EditorMode,
    EditorModes,
    UsfmTokenTypes,
} from "@/app/data/editor";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import { type ParsedReference, parseSid } from "@/core/data/bible/bible";
import { ALL_USFM_MARKERS } from "@/core/data/usfm/tokens";
import { guidGenerator } from "@/core/data/utils/generic";

const markerTokenMatchLineStartOptTrailingSpace = /^\\([\w\d]+-?\w*)\s*/;
const markerTokenMatchLineStartSpaceReq = /^\\([\w\d]+-?\w*)\s+$/;
const markerTokenMatchLineMid = /\s+\\([\w\d]+-?\w*)\s/;
// opt whitespace, 1+ digits, (opt hyphen, 1+ digits), opt whitespace
const verseRangeValidRegex = /^\s*\d+(-\d+)?\s*$/;

type TextNodeTransformParams = {
    node: USFMTextNode;
    editor: LexicalEditor;
    editorMode: EditorMode;
    markersMutableState: EditorMarkersMutableState;
    markersViewState: EditorMarkersViewState;
};
export function textNodeTransform({
    node,
    editor,
    editorMode,
    markersMutableState,
    markersViewState,
}: TextNodeTransformParams) {
    // noop in src mode
    if (editorMode === EditorModes.SOURCE) return;
    const text = node.getTextContent();
    const tokenType = node.getTokenType();
    if (tokenType !== UsfmTokenTypes.text) return;
    const markerMatch = text.match(markerTokenMatchLineStartSpaceReq); // example: \v , \c , \q
    const inMidMatch = text.match(markerTokenMatchLineMid);
    if (!markerMatch && !inMidMatch) return;

    const marker = markerMatch?.[1] || inMidMatch?.[1];
    if (!marker) return;
    const isValidMarker = ALL_USFM_MARKERS.has(marker);
    const isStartOfLine = markerMatch !== null;
    if (!isValidMarker) return;

    const insertArg = {
        anchorNode: node,
        marker,
        isStartOfLine,
        markersMutableState,
        markersViewState,
    };
    switch (marker) {
        case "v": {
            return $handleVerseInsert(insertArg);
        }
        default: {
            break;
        }
    }
}

type HandleVerseInsert = {
    anchorNode: USFMTextNode;
    marker: string;
    isStartOfLine: boolean;
    markersMutableState: EditorMarkersMutableState;
    markersViewState: EditorMarkersViewState;
};
function $handleVerseInsert({
    anchorNode,
    marker,
    isStartOfLine,
    markersMutableState,
    markersViewState,
}: HandleVerseInsert) {
    // --- 1. Get context ---
    const { nearestParaMarker, prevSidInfo } =
        findContextForVerseInsert(anchorNode);

    // --- 2. Compute new SID ---
    const prevVerseEnd = prevSidInfo?.verseEnd ?? 1;
    const newSid = `${prevSidInfo?.book} ${prevSidInfo?.chapter}:${
        prevVerseEnd + 1
    }`;

    // --- 3. Create new nodes ---
    const markerNode = $createUSFMTextNode(`\\${marker}`, {
        id: guidGenerator(),
        inPara: nearestParaMarker ?? "",
        tokenType: UsfmTokenTypes.marker,
        marker,
        sid: newSid,
        isMutable: markersMutableState === EditorMarkersMutableStates.MUTABLE,
        show:
            markersViewState === EditorMarkersViewStates.ALWAYS ||
            markersViewState === EditorMarkersViewStates.WHEN_EDITING,
    });

    const verseRangeNode = $createUSFMTextNode(` ${prevVerseEnd + 1}`, {
        id: guidGenerator(),
        inPara: nearestParaMarker ?? "",
        tokenType: UsfmTokenTypes.numberRange,
        sid: newSid,
        isMutable: markersMutableState === EditorMarkersMutableStates.MUTABLE,
    });

    const blankTextNode = $createUSFMTextNode(" ", {
        id: guidGenerator(),
        inPara: nearestParaMarker ?? "",
        tokenType: UsfmTokenTypes.text,
        sid: newSid,
    });

    // --- 4. Determine split or replacement ---
    const selection = $getSelection();
    const offset = $isRangeSelection(selection)
        ? selection.anchor.offset
        : anchorNode.getTextContentSize();
    if (!isStartOfLine) {
        const [left, right] = anchorNode.splitText(offset);
        // take out the marker but leave the trailing space
        const woMarker = `${left
            .getTextContent()
            .trimEnd()
            .slice(0, -markerNode.getTextContentSize())} `;
        left?.setTextContent(woMarker);
        if ($isUSFMTextNode(right)) right.setSid(newSid);
        left.insertAfter(markerNode);
        markerNode.insertAfter(verseRangeNode);
        // todo: extract the unicode constant here to named reusable const
        right?.setTextContent(`\u00A0${right.getTextContent()}`);
        right?.selectStart();
        if (!selection || !$isRangeSelection(selection)) return;
        if (!right) {
            verseRangeNode.selectEnd();
        }
    } else {
        const sibling = anchorNode.getNextSibling();
        anchorNode.replace(markerNode);
        const alreadyHasVerseRangeSibling =
            sibling &&
            $isUSFMTextNode(sibling) &&
            sibling.getTokenType() === UsfmTokenTypes.numberRange;
        if (!alreadyHasVerseRangeSibling) {
            markerNode.insertAfter(verseRangeNode);
            verseRangeNode.insertAfter(blankTextNode);
            blankTextNode.select();
        } else {
            sibling?.selectStart();
        }
    }
}

function findContextForVerseInsert(anchorNode: LexicalNode): {
    nearestParaMarker: string | null;
    prevSidInfo: ParsedReference | null;
} {
    let nearestParaMarker: string | null = null;
    let prevSidInfo: ParsedReference | null = null;

    for (const { node } of $reverseDfsIterator(anchorNode, $getRoot())) {
        if ($isUSFMTextNode(node)) {
            const tokenType = node.getTokenType();

            if (!prevSidInfo && tokenType === UsfmTokenTypes.numberRange) {
                prevSidInfo = parseSid(node.getSid() ?? "");
            }

            if (!nearestParaMarker && tokenType === UsfmTokenTypes.marker) {
                const marker = node.getMarker() ?? "";
                if (ALL_USFM_MARKERS.has(marker)) {
                    nearestParaMarker = marker;
                }
            }

            // stop once both are found
            if (prevSidInfo && nearestParaMarker) break;
        }
    }

    return { nearestParaMarker, prevSidInfo };
}

export function inverseTextNodeTransform({
    editor,
    editorMode,
    markersMutableState,
    markersViewState,
    node,
}: TextNodeTransformParams) {
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
        const match = content.match(markerTokenMatchLineStartOptTrailingSpace);
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

    // if (nodeTokenType === UsfmTokenTypes.numberRange) {
    //   // ;
    //   // if it's no longer a valid verse range, keep it, but flag it as invalid
    //   const isValid = content.match(verseRangeValidRegex);
    //   const currentClassNames = node.getClassNames();
    //   const shouldBeInvalid = !isValid;
    //   const hasInvalidClass = currentClassNames.includes("verseRangeInvalid");

    //   if (shouldBeInvalid === hasInvalidClass) return;
    //   editor.update(
    //     () => {
    //       node.setClassName("verseRangeInvalid", shouldBeInvalid);
    //       node.selectEnd();
    //     },
    //     {
    //       tag: [HISTORY_MERGE_TAG, "programatic"],
    //       // immediately flush this change
    //       discrete: true,
    //     }
    //   );
    //   // const replacement = $createUSFMTextNode(textNode.getTextContent(), {
    //   //   id: textNode.getId(),
    //   //   sid: textNode.getSid(),
    //   //   inPara: textNode.getInPara(),
    //   //   tokenType: validTokenTypes.text,
    //   // });
    //   // textNode.replace(replacement);
    //   // replacement.select();
    // }
}
