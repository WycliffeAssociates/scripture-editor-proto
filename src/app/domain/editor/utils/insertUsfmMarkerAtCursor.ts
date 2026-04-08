import { $dfsIterator } from "@lexical/utils";
import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import {
    $insertChapter,
    $insertNote,
    $insertPara,
    $insertVerse,
    type BaseInsertArgs,
    InsertionTypes,
    mapMarkerToInsertionType,
} from "@/app/domain/editor/utils/insertMarkerOperations.ts";
import { calculateIsStartOfLine } from "@/app/domain/editor/utils/nodePositionUtils.ts";
import { resolveTextInsertionAnchor } from "@/app/domain/editor/utils/resolveTextInsertionAnchor.ts";
import { deriveVerseNumberForInsertionFromTokens } from "@/app/domain/editor/utils/verseNumberHeuristics.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";

function deriveVerseNumberForInsertion(anchorNode: USFMTextNode): string {
    const textNodes = [...$dfsIterator()]
        .map((entry) => entry.node)
        .filter($isUSFMTextNode);
    const anchorIndex = textNodes.findIndex(
        (node) => node.getKey() === anchorNode.getKey(),
    );
    return deriveVerseNumberForInsertionFromTokens({
        tokens: textNodes.map((node) => ({
            tokenType: node.getTokenType(),
            marker: node.getMarker(),
            text: node.getTextContent(),
        })),
        anchorIndex,
    });
}

/**
 * Insert a USFM marker at the current caret position from toolbar/palette
 * controls without requiring typed marker input.
 */
export function insertUsfmMarkerAtCursor(args: {
    editor: LexicalEditor;
    marker: string;
    languageDirection: LanguageDirection;
    editorMode: EditorModeSetting;
}): boolean {
    let inserted = false;

    args.editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const insertionPoint = selection.isBackward()
            ? selection.focus
            : selection.anchor;
        const resolvedAnchor = resolveTextInsertionAnchor(
            insertionPoint.getNode(),
            insertionPoint.offset,
        );
        if (!resolvedAnchor) return;

        const { isStartOfLine, actualAnchorNode, actualAnchorOffset } =
            calculateIsStartOfLine(
                resolvedAnchor.anchorNode,
                resolvedAnchor.anchorOffset,
                {
                    editor: args.editor,
                    editorMode: args.editorMode,
                },
            );

        const insertArgs: BaseInsertArgs = {
            anchorNode: actualAnchorNode,
            anchorOffsetToUse: actualAnchorOffset,
            marker: args.marker,
            isStartOfLine,
            restOfText: "",
            languageDirection: args.languageDirection,
            isTypedInsertion: false,
            editorMode: args.editorMode,
        };

        const insertType = mapMarkerToInsertionType(args.marker, false);
        switch (insertType) {
            case InsertionTypes.verse:
                $insertVerse(
                    insertArgs,
                    deriveVerseNumberForInsertion(actualAnchorNode),
                );
                inserted = true;
                return;
            case InsertionTypes.chapter:
                $insertChapter(insertArgs);
                inserted = true;
                return;
            case InsertionTypes.note:
                $insertNote(insertArgs);
                inserted = true;
                return;
            case InsertionTypes.para:
                $insertPara(insertArgs);
                inserted = true;
                return;
            default:
                return;
        }
    });

    return inserted;
}
