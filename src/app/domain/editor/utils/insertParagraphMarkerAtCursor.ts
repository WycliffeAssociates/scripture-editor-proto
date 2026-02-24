import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import {
    $insertPara,
    type BaseInsertArgs,
} from "@/app/domain/editor/utils/insertMarkerOperations.ts";
import { calculateIsStartOfLine } from "@/app/domain/editor/utils/nodePositionUtils.ts";
import { resolveTextInsertionAnchor } from "@/app/domain/editor/utils/resolveTextInsertionAnchor.ts";
import { VALID_PARA_MARKERS } from "@/core/data/usfm/tokens.ts";

export function insertParagraphMarkerAtCursor({
    editor,
    marker,
    languageDirection,
    editorMode,
}: {
    editor: LexicalEditor;
    marker: string;
    languageDirection: "ltr" | "rtl";
    editorMode: EditorModeSetting;
}): boolean {
    let inserted = false;

    editor.update(() => {
        if (!VALID_PARA_MARKERS.has(marker)) return;

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
        const anchorNode = resolvedAnchor.anchorNode;

        const { isStartOfLine, actualAnchorNode, actualAnchorOffset } =
            calculateIsStartOfLine(anchorNode, resolvedAnchor.anchorOffset, {
                editor,
                editorMode,
            });

        const args: BaseInsertArgs = {
            anchorNode: actualAnchorNode,
            anchorOffsetToUse: actualAnchorOffset,
            marker,
            isStartOfLine,
            restOfText: "",
            languageDirection,
            isTypedInsertion: false,
            editorMode,
        };

        $insertPara(args);
        inserted = true;
    });

    return inserted;
}
