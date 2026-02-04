import { $reverseDfsIterator } from "@lexical/utils";
import { $getRoot } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { CHAPTER_VERSE_MARKERS } from "@/core/data/usfm/tokens.ts";

const LEADING_VERSE_NUMBER_WITH_TEXT_PATTERN = /^(\s*)(\d+(?:-\d+)?)(\s+)(.*)$/;

function isMarkerExpectingNumberRange(marker: string | undefined): boolean {
    return !!marker && CHAPTER_VERSE_MARKERS.has(marker);
}

function findPreviousMarkerNode(anchorNode: USFMTextNode): USFMTextNode | null {
    let isFirst = true;
    for (const { node } of $reverseDfsIterator(anchorNode, $getRoot())) {
        if (isFirst) {
            isFirst = false;
            continue;
        }
        if (
            $isUSFMTextNode(node) &&
            node.getTokenType() === UsfmTokenTypes.marker
        ) {
            return node;
        }
    }
    return null;
}

export function getLeadingVerseNumberFromText(text: string): {
    leadingWhitespace: string;
    verseNumber: string;
    rest: string;
} | null {
    const match = text.match(LEADING_VERSE_NUMBER_WITH_TEXT_PATTERN);
    if (!match) return null;
    return {
        leadingWhitespace: match[1],
        verseNumber: match[2],
        rest: match[4],
    };
}

export function canPromoteLeadingVerseNumber(anchorNode: USFMTextNode): {
    verseNumber: string;
    leadingWhitespace: string;
    rest: string;
} | null {
    if (anchorNode.getTokenType() !== UsfmTokenTypes.text) return null;
    const match = getLeadingVerseNumberFromText(anchorNode.getTextContent());
    if (!match) return null;
    const prevNode = anchorNode.getPreviousSibling();
    if (
        $isUSFMTextNode(prevNode) &&
        prevNode.getTokenType() === UsfmTokenTypes.marker &&
        isMarkerExpectingNumberRange(prevNode.getMarker())
    ) {
        // already a marker expecting a number before this possible verse number
        return null;
    }
    return match;
}
