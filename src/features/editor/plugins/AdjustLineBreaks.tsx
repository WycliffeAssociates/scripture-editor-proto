import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
    $isRangeSelection,
    $getSelection,
    $createLineBreakNode,
    COMMAND_PRIORITY_EDITOR,
    KEY_ENTER_COMMAND,
} from "lexical";

export function UseLineBreaks() {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerCommand(
            KEY_ENTER_COMMAND,
            (event) => {
                event?.preventDefault();
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    const lineBreakNode = $createLineBreakNode();
                    selection.insertNodes([lineBreakNode]);
                    return true; // handled
                }
                return true; // allow default behavior otherwise
            },
            COMMAND_PRIORITY_EDITOR,
        );
    }, [editor]);

    return null;
}
