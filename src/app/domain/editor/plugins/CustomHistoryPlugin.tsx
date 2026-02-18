import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    COMMAND_PRIORITY_EDITOR,
    REDO_COMMAND,
    SELECTION_CHANGE_COMMAND,
    UNDO_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function CustomHistoryPlugin() {
    const [editor] = useLexicalComposerContext();
    const { history } = useWorkspaceContext();
    const { captureEditorUpdate, captureEditorSelection, undo, redo } = history;

    useEffect(() => {
        const unregisterUpdates = editor.registerUpdateListener(
            ({
                editorState,
                prevEditorState,
                dirtyElements,
                dirtyLeaves,
                tags,
            }) => {
                captureEditorUpdate({
                    editorState,
                    prevEditorState,
                    dirtyElements,
                    dirtyLeaves,
                    tags,
                });
            },
        );
        const unregisterSelection = editor.registerCommand(
            SELECTION_CHANGE_COMMAND,
            () => {
                captureEditorSelection(editor.getEditorState());
                return false;
            },
            COMMAND_PRIORITY_EDITOR,
        );
        const unregisterUndo = editor.registerCommand(
            UNDO_COMMAND,
            () => {
                undo();
                return true;
            },
            COMMAND_PRIORITY_EDITOR,
        );

        const unregisterRedo = editor.registerCommand(
            REDO_COMMAND,
            () => {
                redo();
                return true;
            },
            COMMAND_PRIORITY_EDITOR,
        );

        return () => {
            unregisterUpdates();
            unregisterSelection();
            unregisterUndo();
            unregisterRedo();
        };
    }, [editor, captureEditorUpdate, captureEditorSelection, undo, redo]);

    return null;
}
