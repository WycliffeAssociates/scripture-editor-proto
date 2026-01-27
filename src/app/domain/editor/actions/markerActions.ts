import {
    $getSelection,
    $isRangeSelection,
    type ElementNode,
    type LexicalEditor,
    type LexicalNode,
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
import type {
    EditorMarkersMutableState,
    EditorMarkersViewState,
} from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
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
} from "@/app/domain/editor/utils/insertMarkerOperations.ts";
import { calculateIsStartOfLine } from "@/app/domain/editor/utils/nodePositionUtils.ts";
import type { EditorAction, EditorContext } from "./types.ts";

function insertMarker(
    editor: LexicalEditor,
    context: EditorContext,
    markerNoSlash: string,
) {
    editor.update(() => {
        const selection = $getSelection();
        if (!selection || !$isRangeSelection(selection)) return;

        // Most transforms assume collapsed selection, except char/note wrapping
        // The shared utils handle collapsed vs range checks internally for char/note
        // For others, we might want to ensure collapsed?
        // Actually, the original textNodeTransform checked for collapsed.
        // But for button clicks, we might want to allow replacing selection?
        // The shared utils like $insertPara seem to handle splitText which implies collapsed or acting on anchor.
        // Let's rely on the shared utils which generally use anchorNode.

        const anchorNode = selection.anchor.getNode();
        if (!$isUSFMTextNode(anchorNode)) return;

        const isEndMarker = false; // Buttons usually insert start markers. End markers are implicit or specific actions?
        // If we want to support end markers via buttons, we'd need to know.
        // Assuming these are start markers for now.

        const insertType = mapMarkerToInsertionType(markerNoSlash, isEndMarker);

        // For non-wrapping types, we generally want collapsed selection
        if (
            insertType !== InsertionTypes.char &&
            insertType !== InsertionTypes.note &&
            !selection.isCollapsed()
        ) {
            // If range selected for para/verse/chapter, what should happen?
            // Standard behavior might be to collapse to start or end?
            // For now let's just use anchor.
        }

        // For manual insertion:
        const anchorOffset = selection.anchor.offset;

        const {
            isStartOfLine: isStartOfLineCalculated,
            actualAnchorNode,
            actualAnchorOffset,
        } = calculateIsStartOfLine(anchorNode as USFMTextNode, anchorOffset);

        const args: BaseInsertArgs = {
            anchorNode: actualAnchorNode,
            anchorOffsetToUse: actualAnchorOffset,
            marker: markerNoSlash,
            isStartOfLine: isStartOfLineCalculated,
            markersMutableState:
                context.markersMutableState as EditorMarkersMutableState,
            markersViewState:
                context.markersViewState as EditorMarkersViewState,
            restOfText: "", // Not really used for button insertion in the same way?
            languageDirection: context.languageDirection,
            isTypedInsertion: false,
        };

        switch (insertType) {
            case InsertionTypes.verse:
                return $insertVerse(args);
            case InsertionTypes.chapter:
                return $insertChapter(args);
            case InsertionTypes.para:
                return $insertPara(args);
            case InsertionTypes.char:
                return $insertChar(args);
            case InsertionTypes.note:
                return $insertNote(args);
            case InsertionTypes.endMarker:
                return $insertEndMarker(args);
        }
    });
}

function createMarkerAction(
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
        execute: (editor, context) => {
            insertMarker(editor, context, marker);
            return undefined;
        },
    };
}

const AVAILABLE_MARKERS_FOR_CHANGE = [
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

const CHANGE_MARKER_ACTION: EditorAction = {
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
            let curr: LexicalNode | ElementNode | null = anchorNode;
            while (curr) {
                if ($isUSFMTextNode(curr) && curr.getTokenType() === "marker") {
                    markerNode = curr;
                    break;
                }
                const prev: LexicalNode | null = curr.getPreviousSibling();
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
