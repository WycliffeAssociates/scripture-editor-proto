import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_EDITOR,
    COMMAND_PRIORITY_LOW,
    type LexicalEditor,
    SELECTION_CHANGE_COMMAND,
} from "lexical";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode";

export function syncReferencePaneSid(
    editor: LexicalEditor,
    referenceProjectId: string | undefined,
) {
    return editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
            if (!referenceProjectId) return false;
            const wasHandled = false;
            const selection = $getSelection();
            if (!selection || !$isRangeSelection(selection)) return wasHandled;
            const highestNodeVisually = selection.anchor.isBefore(
                selection.focus,
            )
                ? selection.anchor
                : selection.focus;
            const node = highestNodeVisually.getNode();
            if (!$isUSFMTextNode(node)) return wasHandled;
            const sid = node.getSid();
            const refPanel = document.querySelector(
                "[data-js='reference-editor-container']",
            );
            if (!refPanel) return wasHandled;
            const sidInThatPanel = refPanel.querySelector(
                `[data-sid='${sid}']`,
            );
            if (!sidInThatPanel) return wasHandled;
            if (sidInThatPanel) {
                sidInThatPanel.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }
            return wasHandled;
        },
        COMMAND_PRIORITY_LOW,
    );
}
