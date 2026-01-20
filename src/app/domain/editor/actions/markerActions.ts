import {
    $getSelection,
    $isElementNode,
    $isLineBreakNode,
    $isRangeSelection,
    type LexicalEditor,
} from "lexical";
import { AlignLeft, Hash, IndentIncrease, Pilcrow, Type } from "lucide-react";
import React from "react";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $createUSFMTextNode,
    $isUSFMTextNode,
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

export const MARKER_ACTIONS: EditorAction[] = [
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
