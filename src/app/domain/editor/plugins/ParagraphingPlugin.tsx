import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_CRITICAL,
    type CommandListener,
    KEY_ENTER_COMMAND,
    KEY_TAB_COMMAND,
} from "lexical";
import { useEffect } from "react";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { useEditorContext } from "@/app/domain/editor/hooks/useEditorContext.ts";
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
import { useParagraphing } from "@/app/ui/contexts/ParagraphingContext.tsx";

export function ParagraphingPlugin() {
    const [editor] = useLexicalComposerContext();
    const {
        isParagraphingActive,
        currentParagraphingMarker,
        stampParagraphingMarker,
        skipParagraphingMarker,
        undoParagraphingMarker,
    } = useParagraphing();
    const { getContext } = useEditorContext();

    useEffect(() => {
        if (!isParagraphingActive) return;

        const onEnter: CommandListener<KeyboardEvent | null> = (event) => {
            if (!isParagraphingActive || !currentParagraphingMarker)
                return false;
            if (event) {
                event.preventDefault();
            }

            editor.update(() => {
                // AI-PARAGRAPHING-FOLLOWING-1-27-2026: the file @markerActions also has these next 50 or so lines of code for isStart of line calculated etc; Please abstract both into a shareed lexical utiltty and pass in any dependencies needed. For the base args and start of line calculated etc; Please deduplicate/abstract everything as needed in these shared blocks with what's in that file.
                const selection = $getSelection();
                if (!selection || !$isRangeSelection(selection)) return;

                const anchorNode = selection.anchor.getNode();
                if (!$isUSFMTextNode(anchorNode)) return;

                const context = getContext();
                const anchorOffset = selection.anchor.offset;

                const {
                    isStartOfLine: isStartOfLineCalculated,
                    actualAnchorNode,
                    actualAnchorOffset,
                } = calculateIsStartOfLine(
                    anchorNode as USFMTextNode,
                    anchorOffset,
                    {
                        editor,
                        editorMode: context.editorMode as EditorModeSetting,
                    },
                );

                const args: BaseInsertArgs = {
                    anchorNode: actualAnchorNode,
                    anchorOffsetToUse: actualAnchorOffset,
                    marker: currentParagraphingMarker.type,
                    isStartOfLine: isStartOfLineCalculated,
                    restOfText: "",
                    languageDirection: context.languageDirection,
                    isTypedInsertion: false,
                    editorMode: context.editorMode as EditorModeSetting,
                };

                const insertType = mapMarkerToInsertionType(
                    currentParagraphingMarker.type,
                    false,
                );

                switch (insertType) {
                    case InsertionTypes.verse: {
                        $insertVerse(
                            args,
                            currentParagraphingMarker.verseNumber,
                        );
                        break;
                    }
                    case InsertionTypes.chapter:
                        $insertChapter(args);
                        break;
                    case InsertionTypes.char:
                        $insertChar(args);
                        break;
                    case InsertionTypes.note:
                        $insertNote(args);
                        break;
                    case InsertionTypes.endMarker:
                        $insertEndMarker(args);
                        break;
                    case InsertionTypes.para:
                        $insertPara(args);
                        break;
                    default:
                        break;
                }

                // Call stamp to advance the queue
                stampParagraphingMarker();
            });

            return true;
        };

        const onTab: CommandListener<KeyboardEvent> = (event) => {
            if (!isParagraphingActive) return false;

            if (event.shiftKey) {
                event.preventDefault();
                undoParagraphingMarker();
                return true;
            }

            event.preventDefault();
            skipParagraphingMarker();
            return true;
        };

        const removeEnterListener = editor.registerCommand(
            KEY_ENTER_COMMAND,
            onEnter,
            COMMAND_PRIORITY_CRITICAL,
        );

        const removeTabListener = editor.registerCommand(
            KEY_TAB_COMMAND,
            onTab,
            COMMAND_PRIORITY_CRITICAL,
        );

        return () => {
            removeEnterListener();
            removeTabListener();
        };
    }, [
        editor,
        isParagraphingActive,
        currentParagraphingMarker,
        stampParagraphingMarker,
        skipParagraphingMarker,
        undoParagraphingMarker,
        getContext,
    ]);

    return null;
}
