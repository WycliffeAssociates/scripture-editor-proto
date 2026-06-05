import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_EDITOR, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { useEffect } from "react";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

/**
 * Redirects Lexical's undo/redo COMMANDS into the workspace-owned history
 * system (Cmd-Z / Cmd-Shift-Z land here; the app's history replaces
 * Lexical's built-in plugin).
 *
 * Commands only — history's update CAPTURE is fed by the single
 * lexical→app update listener in `WorkingFilesBridgePlugin`, which owns
 * the capture-before-publish ordering.
 */
export function CustomHistoryPlugin() {
    const [editor] = useLexicalComposerContext();
    const { history } = useWorkspaceContext();
    const { undo, redo } = history;

    useEffect(() => {
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
            unregisterUndo();
            unregisterRedo();
        };
    }, [editor, undo, redo]);

    return null;
}
