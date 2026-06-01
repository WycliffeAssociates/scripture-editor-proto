// historySelection.ts
//
// Selection + scroll helpers for the undo/redo history layer. Kept out of the
// hook so the hook stays orchestration, not DOM/Lexical plumbing.
//
// Selection is keyed by USFMTextNode `data-id` rather than Lexical key: Lexical
// keys regenerate on every `parseEditorState`, so key-based selection
// serializations can't survive undo/redo replays. `data-id` is preserved across
// re-serialization, so a CapturedSelection re-resolves if the anchor/focus nodes
// still exist in the target tree.

import { $dfsIterator } from "@lexical/utils";
import {
    $createRangeSelection,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $setSelection,
} from "lexical";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

export type CapturedSelection = {
    anchorId: string;
    anchorOffset: number;
    focusId: string;
    focusOffset: number;
};

export type ChapterCursor = CapturedSelection | null;

export function cloneCursor(cursor: ChapterCursor): ChapterCursor {
    return cursor ? { ...cursor } : null;
}

/**
 * Walk up from the contenteditable to find the nearest scrolling ancestor.
 * Used so undo/redo can snapshot + restore scroll position across an editor
 * state swap.
 */
export function findScrollAncestor(
    start: HTMLElement | null,
): HTMLElement | null {
    let current: HTMLElement | null = start;
    while (current) {
        const cs = window.getComputedStyle(current);
        const canScrollY =
            /(auto|scroll|overlay)/.test(cs.overflowY) &&
            current.scrollHeight > current.clientHeight;
        if (canScrollY) return current;
        current = current.parentElement;
    }
    return null;
}

/**
 * Read the current Lexical selection (range selections only) and capture
 * its anchor/focus by USFMTextNode `data-id`. Returns null when there's
 * nothing to preserve (non-range selection, selection sits on a non-USFM
 * node, or nodes lack ids). MUST be called from inside `editor.read` or
 * `editor.update`.
 */
export function $captureCurrentSelection(): CapturedSelection | null {
    const sel = $getSelection();
    if (!$isRangeSelection(sel)) return null;
    const anchorNode = sel.anchor.getNode();
    const focusNode = sel.focus.getNode();
    if (!$isUSFMTextNode(anchorNode) || !$isUSFMTextNode(focusNode)) {
        return null;
    }
    const anchorId = anchorNode.getId();
    const focusId = focusNode.getId();
    if (!anchorId || !focusId) return null;
    return {
        anchorId,
        anchorOffset: sel.anchor.offset,
        focusId,
        focusOffset: sel.focus.offset,
    };
}

/**
 * Find USFMTextNodes in the current editor state by `data-id`. Single
 * DFS walk, returns both anchor and focus nodes (which may be the same).
 * MUST be called from inside `editor.read` or `editor.update`.
 */
function $findUsfmTextNodesById(
    anchorId: string,
    focusId: string,
): { anchorNode: USFMTextNode | null; focusNode: USFMTextNode | null } {
    let anchorNode: USFMTextNode | null = null;
    let focusNode: USFMTextNode | null = null;
    for (const dfsNode of $dfsIterator($getRoot())) {
        const node = dfsNode.node;
        if (!$isUSFMTextNode(node)) continue;
        const id = node.getId();
        if (anchorNode === null && id === anchorId) anchorNode = node;
        if (focusNode === null && id === focusId) focusNode = node;
        if (anchorNode && focusNode) break;
    }
    return { anchorNode, focusNode };
}

/**
 * Restore selection by `data-id` after a state replay. If both anchor
 * and focus nodes are found in the new tree, set a RangeSelection at the
 * same (clamped) offsets. If either is missing (the change deleted the
 * node the cursor was sitting on), leave the selection cleared. MUST be
 * called from inside `editor.update`.
 */
export function $restoreSelectionById(captured: CapturedSelection): boolean {
    const { anchorNode, focusNode } = $findUsfmTextNodesById(
        captured.anchorId,
        captured.focusId,
    );
    if (!anchorNode || !focusNode) return false;
    const sel = $createRangeSelection();
    const anchorTextLen = anchorNode.getTextContentSize();
    const focusTextLen = focusNode.getTextContentSize();
    sel.anchor.set(
        anchorNode.getKey(),
        Math.min(captured.anchorOffset, anchorTextLen),
        "text",
    );
    sel.focus.set(
        focusNode.getKey(),
        Math.min(captured.focusOffset, focusTextLen),
        "text",
    );
    $setSelection(sel);
    return true;
}
