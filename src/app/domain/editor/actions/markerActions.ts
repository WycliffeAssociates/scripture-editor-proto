import { $dfsIterator, $reverseDfsIterator } from "@lexical/utils";
import {
    $getRoot,
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
    Trash2,
    Type,
} from "lucide-react";
import React from "react";
import { type EditorModeSetting, UsfmTokenTypes } from "@/app/data/editor.ts";
import { $isUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import { $isUSFMParagraphNode } from "@/app/domain/editor/nodes/USFMParagraphNode.ts";
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
import { deriveVerseNumberForInsertionFromTokens } from "@/app/domain/editor/utils/verseNumberHeuristics.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import { VALID_PARA_MARKERS } from "@/core/data/usfm/tokens.ts";
import type { EditorAction, EditorContext } from "./types.ts";

function isWhitespaceOnly(text: string): boolean {
    return /^[\s\u00A0\u200B]*$/.test(text);
}

function deriveVerseNumberForInsertion(anchorNode: USFMTextNode): string {
    const textNodes = [...$dfsIterator()]
        .map((n) => n.node)
        .filter($isUSFMTextNode);
    const anchorIndex = textNodes.findIndex(
        (n) => n.getKey() === anchorNode.getKey(),
    );
    return deriveVerseNumberForInsertionFromTokens({
        tokens: textNodes.map((n) => ({
            tokenType: n.getTokenType(),
            marker: n.getMarker(),
            text: n.getTextContent(),
        })),
        anchorIndex,
    });
}

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

        // For range selections, treat the insertion point as the start of the selection.
        // Lexical uses anchor/focus order based on selection direction.
        const insertionPoint = selection.isBackward()
            ? selection.focus
            : selection.anchor;

        const anchorNode = insertionPoint.getNode();
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
        const anchorOffset = insertionPoint.offset;

        const {
            isStartOfLine: isStartOfLineCalculated,
            actualAnchorNode,
            actualAnchorOffset,
        } = calculateIsStartOfLine(anchorNode as USFMTextNode, anchorOffset, {
            editor,
            editorMode: context.editorMode as EditorModeSetting,
        });

        const args: BaseInsertArgs = {
            anchorNode: actualAnchorNode,
            anchorOffsetToUse: actualAnchorOffset,
            marker: markerNoSlash,
            isStartOfLine: isStartOfLineCalculated,
            restOfText: "", // Not really used for button insertion in the same way?
            languageDirection: context.languageDirection,
            isTypedInsertion: false,
            editorMode: context.editorMode as EditorModeSetting,
        };

        switch (insertType) {
            case InsertionTypes.verse:
                return $insertVerse(
                    args,
                    deriveVerseNumberForInsertion(actualAnchorNode),
                );
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
    label: "Change previous paragraph marker to...",
    category: "Markers",
    icon: React.createElement(Edit3, { size: 16 }),
    isVisible: (context) => !!context.currentMarker,
    execute: () => ({
        id: "select-new-marker",
        label: "Select new marker",
        type: "select",
        options: AVAILABLE_MARKERS_FOR_CHANGE,
        onComplete: (newValue) => {
            if (!VALID_PARA_MARKERS.has(newValue)) return;

            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            const anchorNode = selection.anchor.getNode();

            // Regular mode: paragraph markers live on the paragraph container.
            // Treat the containing paragraph's marker as the "previous paragraph marker".
            let curr: LexicalNode | ElementNode | null = anchorNode;
            while (curr) {
                if ($isUSFMParagraphNode(curr)) {
                    const marker = curr.getMarker();
                    if (marker && VALID_PARA_MARKERS.has(marker)) {
                        const prevText = curr.getMarkerText() ?? `\\${marker} `;
                        const trailing = prevText.endsWith("\n") ? "\n" : " ";
                        curr.setMarker(newValue);
                        curr.setMarkerText(`\\${newValue}${trailing}`);
                        return;
                    }
                    break;
                }
                curr = curr.getParent();
            }

            // Walk backward in document order and find the nearest *paragraph* marker.
            // - Regular mode: paragraph markers live on USFMParagraphNode containers
            // - Source mode: paragraph markers are marker USFMTextNodes
            let isFirst = true;
            for (const { node } of $reverseDfsIterator(
                anchorNode,
                $getRoot(),
            )) {
                if (isFirst) {
                    isFirst = false;
                    continue; // ensure this is "previous", not the node at cursor
                }

                if ($isUSFMParagraphNode(node)) {
                    const marker = node.getMarker();
                    if (!marker || !VALID_PARA_MARKERS.has(marker)) continue;

                    const prevText = node.getMarkerText() ?? `\\${marker} `;
                    const trailing = prevText.endsWith("\n") ? "\n" : " ";

                    node.setMarker(newValue);
                    node.setMarkerText(`\\${newValue}${trailing}`);
                    return;
                }

                if (
                    $isUSFMTextNode(node) &&
                    node.getTokenType() === "marker" &&
                    VALID_PARA_MARKERS.has(node.getMarker() ?? "")
                ) {
                    node.setMarker(newValue);
                    node.setTextContent(`\\${newValue} `);
                    return;
                }
            }
        },
    }),
};

const REMOVE_EMPTY_VERSES_ACTION: EditorAction = {
    id: "remove-empty-verses",
    label: "Remove empty verses",
    category: "Formatting",
    icon: React.createElement(Trash2, { size: 16 }),
    isVisible: (context) =>
        context.editorMode !== "plain" &&
        !!parseSid(context.currentVerse ?? ""),
    execute: (_editor, context) => {
        const current = parseSid(context.currentVerse ?? "");
        if (!current) return undefined;

        const isInCurrentChapter = (sid: string | undefined) => {
            if (!sid) return false;
            const parsed = parseSid(sid);
            if (!parsed) return false;
            return (
                parsed.book === current.book &&
                parsed.chapter === current.chapter
            );
        };

        const all = [...$dfsIterator()].map((n) => n.node);
        const toRemove = new Set<string>();

        for (let i = 0; i < all.length; i++) {
            const node = all[i];
            if (!$isUSFMTextNode(node)) continue;
            if (node.getTokenType() !== UsfmTokenTypes.marker) continue;
            if (node.getMarker() !== "v") continue;
            if (!isInCurrentChapter(node.getSid())) continue;

            const next = all[i + 1];
            const numberNode =
                next &&
                $isUSFMTextNode(next) &&
                next.getTokenType() === UsfmTokenTypes.numberRange
                    ? next
                    : null;

            let j = i + 1;
            if (numberNode) j++;

            let hasContent = false;
            for (; j < all.length; j++) {
                const curr = all[j];

                // Stop once we've left the paragraph container.
                if ($isUSFMParagraphNode(curr)) break;

                if ($isUSFMNestedEditorNode(curr)) {
                    hasContent = true;
                    break;
                }

                if ($isUSFMTextNode(curr)) {
                    // If we crossed out of the current chapter, stop.
                    if (!isInCurrentChapter(curr.getSid())) break;

                    const tokenType = curr.getTokenType();

                    if (tokenType === UsfmTokenTypes.verticalWhitespace) {
                        continue;
                    }

                    if (tokenType === UsfmTokenTypes.marker) {
                        const m = curr.getMarker() ?? "";
                        if (
                            m === "v" ||
                            m === "c" ||
                            VALID_PARA_MARKERS.has(m)
                        ) {
                            break;
                        }
                        hasContent = true;
                        break;
                    }

                    if (tokenType === UsfmTokenTypes.text) {
                        if (!isWhitespaceOnly(curr.getTextContent())) {
                            hasContent = true;
                            break;
                        }
                        continue;
                    }

                    // Any other token types (e.g. endMarker) count as content.
                    hasContent = true;
                    break;
                }
            }

            if (hasContent) continue;

            toRemove.add(node.getKey());
            if (numberNode) toRemove.add(numberNode.getKey());

            // Remove immediate whitespace-only text nodes following the verse number.
            let k = i + (numberNode ? 2 : 1);
            while (k < all.length) {
                const curr = all[k];
                if (
                    $isUSFMTextNode(curr) &&
                    curr.getTokenType() === UsfmTokenTypes.text
                ) {
                    if (isWhitespaceOnly(curr.getTextContent())) {
                        toRemove.add(curr.getKey());
                        k++;
                        continue;
                    }
                }
                break;
            }
        }

        for (const n of all) {
            if (!n.isAttached()) continue;
            if (toRemove.has(n.getKey())) {
                n.remove();
            }
        }

        return undefined;
    },
};

export const MARKER_ACTIONS: EditorAction[] = [
    CHANGE_MARKER_ACTION,
    REMOVE_EMPTY_VERSES_ACTION,
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
