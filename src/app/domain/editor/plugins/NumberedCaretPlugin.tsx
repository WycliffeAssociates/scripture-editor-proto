import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, type EditorState } from "lexical";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { $isUSFMNumberedMarkerNode } from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";

type CaretBox = {
    left: number;
    top: number;
    height: number;
};

/**
 * Caret affordances for numbered-marker nodes: when the caret is inside a
 * number, the editing target visibly changes species.
 *
 * Two synced signals, both driven by the MODEL selection (never by which DOM
 * node happens to hold the browser caret — those disagree at canonicalized
 * clicks and around empty nodes, and a caret-colored lie is worse than no
 * affordance):
 *
 * - `data-caret-in-number` on the editor root + `data-caret-inside` on the
 *   node's element — CSS keys the native-caret color and the ghost chip tint
 *   off these (see usfm.css.ts).
 * - A painted bar caret (3px, glow, no blink) portaled into the editor
 *   container, since the native caret can't change width or height and is
 *   nearly invisible on superscript digits. The native caret stays present
 *   underneath (transparent) so IME anchoring and focus semantics are
 *   untouched. Pure presentation: reads selection, never writes it.
 */
export function NumberedCaretPlugin() {
    const [editor] = useLexicalComposerContext();
    const [box, setBox] = useState<CaretBox | null>(null);

    // Attribute mirror (chip tint + native-caret color).
    useEffect(() => {
        // Sentinel forces the first apply to write attributes
        // unconditionally — after a remount the tracked key resets but stale
        // DOM attributes survive.
        let prevKey: string | null | "__init__" = "__init__";
        const apply = (editorState: EditorState) => {
            const nextKey = editorState.read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection) || !selection.isCollapsed())
                    return null;
                const node = selection.anchor.getNode();
                return $isUSFMNumberedMarkerNode(node) ? node.getKey() : null;
            });
            const root = editor.getRootElement();
            if (nextKey === prevKey) return;
            if (prevKey === "__init__") {
                root?.querySelectorAll("[data-caret-inside]").forEach((el) => {
                    el.removeAttribute("data-caret-inside");
                });
            } else if (prevKey) {
                editor
                    .getElementByKey(prevKey)
                    ?.removeAttribute("data-caret-inside");
            }
            if (nextKey) {
                editor
                    .getElementByKey(nextKey)
                    ?.setAttribute("data-caret-inside", "true");
                root?.setAttribute("data-caret-in-number", "true");
            } else {
                root?.removeAttribute("data-caret-in-number");
            }
            prevKey = nextKey;
        };
        apply(editor.getEditorState());
        return editor.registerUpdateListener(({ editorState }) =>
            apply(editorState),
        );
    }, [editor]);

    // Painted bar caret.
    useEffect(() => {
        const repaint = () => {
            editor.getEditorState().read(() => {
                const root = editor.getRootElement();
                const container = root?.parentElement;
                const selection = $getSelection();
                if (
                    !root ||
                    !container ||
                    document.activeElement !== root || // native carets hide on blur; so do we
                    !$isRangeSelection(selection) ||
                    !selection.isCollapsed()
                ) {
                    setBox(null);
                    return;
                }
                const node = selection.anchor.getNode();
                if (!$isUSFMNumberedMarkerNode(node)) {
                    setBox(null);
                    return;
                }
                const span = editor.getElementByKey(node.getKey());
                const textDom = span?.firstChild;
                if (!span) {
                    setBox(null);
                    return;
                }
                const containerRect = container.getBoundingClientRect();
                const offset = selection.anchor.offset;
                const size = node.getTextContentSize();

                // Character-cell rects (collapsed-range rects are unreliable
                // at boundaries): the cell after the caret, the cell before
                // it at node end, or the padded span box for an empty node.
                let x: number;
                let top: number;
                let height: number;
                if (size === 0 || textDom?.nodeType !== Node.TEXT_NODE) {
                    const rect = span.getBoundingClientRect();
                    x = rect.left + rect.width / 2;
                    top = rect.top;
                    height = rect.height;
                } else if (offset < size) {
                    const range = document.createRange();
                    range.setStart(textDom, offset);
                    range.setEnd(textDom, offset + 1);
                    const rect = range.getBoundingClientRect();
                    x = rect.left;
                    top = rect.top;
                    height = rect.height;
                } else {
                    const range = document.createRange();
                    range.setStart(textDom, size - 1);
                    range.setEnd(textDom, size);
                    const rect = range.getBoundingClientRect();
                    x = rect.right;
                    top = rect.top;
                    height = rect.height;
                }
                setBox({
                    left: x - containerRect.left,
                    top: top - containerRect.top,
                    height,
                });
            });
        };
        const unregister = editor.registerUpdateListener(repaint);
        const rootEl = editor.getRootElement();
        rootEl?.addEventListener("scroll", repaint);
        rootEl?.addEventListener("focus", repaint);
        rootEl?.addEventListener("blur", repaint);
        window.addEventListener("resize", repaint);
        repaint();
        return () => {
            unregister();
            rootEl?.removeEventListener("scroll", repaint);
            rootEl?.removeEventListener("focus", repaint);
            rootEl?.removeEventListener("blur", repaint);
            window.removeEventListener("resize", repaint);
        };
    }, [editor]);

    const container = editor.getRootElement()?.parentElement;
    if (!box || !container) return null;
    return createPortal(
        <div
            className="usfm-numbered-caret"
            style={{
                left: box.left - 1.5,
                top: box.top - 3,
                height: box.height + 6,
            }}
        />,
        container,
    );
}
