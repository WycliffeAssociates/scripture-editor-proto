import {
    $getSelection,
    $isElementNode,
    $isLineBreakNode,
    $isRangeSelection,
    type LexicalEditor,
} from "lexical";
import {
    AlignLeft,
    Edit3,
    Hash,
    IndentIncrease,
    Pilcrow,
    Type,
} from "lucide-react";
import React from "react";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { EditorAction } from "./types.ts";

export function insertMarker(_editor: LexicalEditor, markerNoSlash: string) {
    const selection = $getSelection();
    if (!selection || !$isRangeSelection(selection)) return;
    if (!selection.isCollapsed()) return;

    const slashMarker = `\\${markerNoSlash}`;
    const slashMarkerPadded = ` ${slashMarker} `;
    const currentNode = selection.anchor.getNode();

    if ($isUSFMTextNode(currentNode)) {
        const ct = currentNode.getTextContent();
        const content = `${ct.slice(0, selection.anchor.offset)} ${slashMarkerPadded} ${ct.slice(selection.anchor.offset)}`;
        currentNode.setTextContent(content);
        currentNode.select(
            selection.anchor.offset + slashMarkerPadded.length,
            selection.anchor.offset + slashMarkerPadded.length,
        );
    } else if ($isElementNode(currentNode)) {
        const newNode = $createUSFMTextNode(slashMarkerPadded, {
            id: guidGenerator(),
            inPara: "",
            marker: markerNoSlash,
            tokenType: UsfmTokenTypes.text,
        });
        const nthChild = currentNode.getChildAtIndex(selection.anchor.offset);
        if ($isLineBreakNode(nthChild)) {
            nthChild.insertBefore(newNode);
        }
        newNode.selectEnd();
    }
}

export function createMarkerAction(
    id: string,
    label: string,
    marker: string,
    icon?: React.ReactNode,
): EditorAction {
    return {
        id,
        label,
        category: "Markers",
        marker,
        icon,
        isVisible: () => true,
        execute: (editor) => insertMarker(editor, marker),
    };
}

export const AVAILABLE_MARKERS_FOR_CHANGE = [
    { label: "Verse", value: "v" },
    { label: "Paragraph", value: "p" },
    { label: "Margin Paragraph", value: "m" },
    { label: "Chapter Label", value: "cl" },
    { label: "Poetry (Level 1)", value: "q1" },
    { label: "Poetry (Level 2)", value: "q2" },
    { label: "Poetry (Level 3)", value: "q3" },
    { label: "Section Heading", value: "s" },
    { label: "Descriptive Title", value: "d" },
];

export const CHANGE_MARKER_ACTION: EditorAction = {
    id: "change-marker",
    label: "Change previous marker to...",
    category: "Markers",
    icon: React.createElement(Edit3, { size: 16 }),
    isVisible: (context) => !!context.currentMarker,
    execute: () => ({
        id: "select-new-marker",
        label: "Select new marker",
        type: "select",
        options: AVAILABLE_MARKERS_FOR_CHANGE,
        onComplete: (newValue) => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const anchorNode = selection.anchor.getNode();
            let markerNode: USFMTextNode | null = null;

            // Search backward for the nearest marker node
            let curr: any = anchorNode;
            while (curr) {
                if ($isUSFMTextNode(curr) && curr.getTokenType() === "marker") {
                    markerNode = curr;
                    break;
                }
                const prev = curr.getPreviousSibling();
                if (prev) {
                    curr = prev;
                } else {
                    curr = curr.getParent();
                }
            }

            if (markerNode) {
                markerNode.setMarker(newValue);
                markerNode.setTextContent(`\\${newValue} `);
            }
        },
    }),
};

export const MARKER_ACTIONS: EditorAction[] = [
    CHANGE_MARKER_ACTION,
    createMarkerAction(
        "insert-v",
        "Verse",
        "v",
        React.createElement(Hash, { size: 16 }),
    ),
    createMarkerAction(
        "insert-p",
        "Paragraph",
        "p",
        React.createElement(Pilcrow, { size: 16 }),
    ),
    createMarkerAction(
        "insert-cl",
        "Chapter Label",
        "cl",
        React.createElement(Type, { size: 16 }),
    ),
    createMarkerAction(
        "insert-m",
        "Margin Paragraph",
        "m",
        React.createElement(AlignLeft, { size: 16 }),
    ),
    createMarkerAction(
        "insert-q1",
        "Poetry (Level 1)",
        "q1",
        React.createElement(IndentIncrease, { size: 16 }),
    ),
    createMarkerAction(
        "insert-q2",
        "Poetry (Level 2)",
        "q2",
        React.createElement(IndentIncrease, { size: 16 }),
    ),
    createMarkerAction(
        "insert-q3",
        "Poetry (Level 3)",
        "q3",
        React.createElement(IndentIncrease, { size: 16 }),
    ),
];
