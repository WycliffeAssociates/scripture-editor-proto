import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_LOW,
    type LexicalEditor,
    SELECTION_CHANGE_COMMAND,
} from "lexical";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

function isVisibleElement(element: Element): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false;
    if (element.getClientRects().length === 0) return false;
    return getComputedStyle(element).display !== "none";
}

export function findBestReferenceScrollTarget(
    refPanel: ParentNode,
    sid: string,
): HTMLElement | null {
    const sidSelector = `[data-sid='${sid}']`;
    const visibleTextToken = Array.from(
        refPanel.querySelectorAll(`${sidSelector}[data-token-type='text']`),
    ).find(isVisibleElement);
    if (visibleTextToken) return visibleTextToken;

    const visibleSidMatch = Array.from(
        refPanel.querySelectorAll(sidSelector),
    ).find(isVisibleElement);
    if (visibleSidMatch) return visibleSidMatch;

    const fallback = refPanel.querySelector(sidSelector);
    return fallback instanceof HTMLElement ? fallback : null;
}

export function syncReferencePaneSid(
    editor: LexicalEditor,
    referenceProjectId: string | undefined,
    isSyncEnabled: boolean,
) {
    return editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
            if (!referenceProjectId || !isSyncEnabled) return false;
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
            const sidInThatPanel = findBestReferenceScrollTarget(refPanel, sid);
            if (!sidInThatPanel) return wasHandled;
            sidInThatPanel.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
            return wasHandled;
        },
        COMMAND_PRIORITY_LOW,
    );
}
