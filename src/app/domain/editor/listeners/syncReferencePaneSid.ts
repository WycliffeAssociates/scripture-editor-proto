import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_LOW,
    type LexicalEditor,
    SELECTION_CHANGE_COMMAND,
} from "lexical";
import { DATA_JS } from "@/app/data/constants.ts";
import { $isUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";

function isVisibleElement(element: Element): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false;
    if (element.getClientRects().length === 0) return false;
    return getComputedStyle(element).display !== "none";
}

/**
 * Pick the best DOM target inside the reference pane for a given scripture id.
 *
 * The reference pane may contain multiple DOM nodes for one SID, especially in
 * read-only scripture where markers and text tokens render separately. Prefer a
 * visible text token when possible so scrolling lands on what the user can
 * actually read.
 */
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
    /**
     * Keep the read-only reference pane visually aligned with the user's caret
     * in the main editor when scripture sync is enabled.
     */
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
                `[data-js="${DATA_JS.referenceEditorContainer}"]`,
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
