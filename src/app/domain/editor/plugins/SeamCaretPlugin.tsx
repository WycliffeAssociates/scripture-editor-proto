import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type EditorState,
} from "lexical";
import { useEffect } from "react";

import type {
  SeamAffordance,
  SeamPredicate,
} from "@/app/domain/editor/selection/seamSelection.ts";

const AFFORDANCE_ATTR = "data-caret-affordance";

/**
 * Flat-shape (usfm/plain) seam affordance: when the caret sits on a token that
 * participates in a managed seam, ask the `affordance` policy what to render
 * for that token and mirror its variant onto `data-caret-affordance` for CSS
 * to style. The two concerns stay separate — `isSeam` decides where the caret
 * has reachable stops; `affordance` decides what (if anything) is shown there.
 *
 * Model-driven (reads the anchor node, never the DOM caret) and presentation
 * only. The generic, mode-agnostic twin of NumberedCaretPlugin's attribute
 * mirror; bar-vs-tint-per-state is the policy's job, not this plugin's.
 */
export function SeamCaretPlugin({
  isSeam,
  affordance,
}: {
  isSeam: SeamPredicate;
  affordance: SeamAffordance;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Sentinel forces the first apply to write unconditionally — after a
    // remount the tracked key resets but stale DOM attributes survive.
    let prevKey: string | null | "__init__" = "__init__";

    // The active token's affordance variant, or null when the caret isn't on a
    // managed seam (or the policy declines this token, e.g. prose).
    const $activeSeam = (): { key: string; variant: string } | null => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        return null;
      const node = selection.anchor.getNode();
      if (!$isTextNode(node)) return null;
      const prev = node.getPreviousSibling();
      const next = node.getNextSibling();
      const onSeam =
        ($isTextNode(prev) && isSeam(prev, node)) ||
        ($isTextNode(next) && isSeam(node, next));
      if (!onSeam) return null;
      const variant = affordance(node);
      return variant ? { key: node.getKey(), variant } : null;
    };

    const apply = (editorState: EditorState) => {
      const root = editor.getRootElement();
      const active = editorState.read(() => $activeSeam());
      const nextKey = active?.key ?? null;
      if (nextKey === prevKey) return;
      if (prevKey === "__init__") {
        root?.querySelectorAll(`[${AFFORDANCE_ATTR}]`).forEach((el) => {
          el.removeAttribute(AFFORDANCE_ATTR);
        });
      } else if (prevKey) {
        editor.getElementByKey(prevKey)?.removeAttribute(AFFORDANCE_ATTR);
      }
      if (active) {
        editor
          .getElementByKey(active.key)
          ?.setAttribute(AFFORDANCE_ATTR, active.variant);
      }
      prevKey = nextKey;
    };

    apply(editor.getEditorState());
    return editor.registerUpdateListener(({ editorState }) =>
      apply(editorState),
    );
  }, [editor, isSeam, affordance]);

  return null;
}
