import {
  $createRangeSelection,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  type LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  type TextNode,
} from "lexical";

/**
 * A managed *seam* is an ordered adjacency `(left, right)` of text nodes that
 * the editor wants the caret to treat as TWO distinct, reachable stops at the
 * one boundary pixel — `left@end` and `right@0` — rather than the single stop
 * the browser/Lexical canonicalize them into.
 *
 * `isSeam(left, right)` is a pure two-node predicate; the mechanism below is
 * otherwise content-agnostic. (The numbered-marker node layers number-specific
 * behaviors — delete staging, the WS-terminator contract, space-jump — on top
 * of this same idea; those are NOT here, because they're about a number's
 * bytes, not the seam.)
 */
export type SeamPredicate = (left: TextNode, right: TextNode) => boolean;

/**
 * Presentation policy for the caret affordance, decided per active token. The
 * plugin only consults this for a node already sitting on a managed seam; the
 * policy then returns a variant key (e.g. `"tint"`, `"bar"`) written to
 * `data-caret-affordance` for CSS to style — or `null` for no affordance (e.g.
 * the prose side of a number/text seam). One callback per (mode × predicate)
 * means each surface decides its own behavior.
 */
export type SeamAffordance = (node: TextNode) => string | null;

/**
 * Give every seam matched by `isSeam` two explicitly reachable caret stops and
 * defend the one the engine keeps collapsing.
 *
 * The boundary has two model positions at one pixel: `left@end` (model-stable)
 * and `right@0`. Native arrowing only ever rests at one of them per direction,
 * so we force the missing stop. `right@0` is the catch: Lexical canonicalizes
 * it to `left@end` (adjacent text nodes share the pixel, left wins), so once we
 * arm it we re-assert it on both SELECTION_CHANGE (navigation) and
 * CONTROLLED_TEXT_INSERTION (so a typed char lands on the right side, not the
 * left). Pure selection control: never inserts, deletes, or rewrites content.
 */
export function registerSeamSelection(
  editor: LexicalEditor,
  isSeam: SeamPredicate,
) {
  const isPlain = (e: KeyboardEvent) =>
    !(e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) &&
    !editor.isComposing();

  // The armed `right@0` stop: the key of the RIGHT node whose offset-0 we're
  // holding against canonicalization. null when no seam edge is held. Mirrored
  // onto the root as `data-seam-held` so presentation (e.g. NumberedCaretPlugin
  // suppressing its bar through the transient canonicalization) can read it.
  let heldRightKey: string | null = null;
  const setHeld = (key: string | null) => {
    heldRightKey = key;
    const root = editor.getRootElement();
    if (key) root?.setAttribute("data-seam-held", "true");
    else root?.removeAttribute("data-seam-held");
  };

  const $stop = (node: TextNode, offset: number, event: KeyboardEvent) => {
    event.preventDefault();
    node.select(offset, offset);
    return true;
  };

  // Map a physical arrow to a LOGICAL direction using the element's computed
  // text direction, so RTL needs no special-casing (string offsets are already
  // logical: 0 = start).
  const logicalDir = (
    physicalKey: "left" | "right",
    node: TextNode,
  ): "backward" | "forward" => {
    const el = editor.getElementByKey(node.getKey());
    const rtl = el ? getComputedStyle(el).direction === "rtl" : false;
    const forwardKey = rtl ? "left" : "right";
    return physicalKey === forwardKey ? "forward" : "backward";
  };

  const $handleArrow = (
    event: KeyboardEvent,
    physicalKey: "left" | "right",
  ): boolean => {
    if (!isPlain(event)) return false;
    const sel = $getSelection();
    if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;
    const node = sel.anchor.getNode();
    if (!$isTextNode(node)) return false;
    const offset = sel.anchor.offset;

    if (logicalDir(physicalKey, node) === "backward") {
      // Moving toward the start. If `node` is the RIGHT member of a seam, step
      // through its near edge explicitly.
      const prev = node.getPreviousSibling();
      if ($isTextNode(prev) && isSeam(prev, node)) {
        // The right side's own stop (`right@0`) — arm and hold it.
        if (offset === 1) {
          setHeld(node.getKey());
          return $stop(node, 0, event);
        }
        // Already at the held `right@0` → cross to `left@end` and release.
        if (offset === 0) {
          setHeld(null);
          return $stop(prev, prev.getTextContentSize(), event);
        }
        return false;
      }
      // `node` is (or may be) the LEFT member moving back into its interior —
      // release any held edge and let native walk the interior.
      const next = node.getNextSibling();
      if ($isTextNode(next) && isSeam(node, next)) setHeld(null);
      return false;
    }

    // Moving toward the end. At `left@end` with a seam to the next node, force
    // the `right@0` stop the browser would otherwise skip, and hold it.
    const next = node.getNextSibling();
    if (
      $isTextNode(next) &&
      isSeam(node, next) &&
      offset === node.getTextContentSize()
    ) {
      setHeld(next.getKey());
      return $stop(next, 0, event);
    }
    return false;
  };

  const left = editor.registerCommand<KeyboardEvent>(
    KEY_ARROW_LEFT_COMMAND,
    (event) => $handleArrow(event, "left"),
    COMMAND_PRIORITY_LOW,
  );
  const right = editor.registerCommand<KeyboardEvent>(
    KEY_ARROW_RIGHT_COMMAND,
    (event) => $handleArrow(event, "right"),
    COMMAND_PRIORITY_LOW,
  );

  // Restore the held `right@0` if the current selection is its canonicalized
  // alias (`left@end`). Returns:
  //   "intact"   — already at right@0, nothing to do
  //   "restored" — was the alias, put back via a fresh selection (node.select
  //                would mutate the possibly-frozen committed selection here)
  //   "gone"     — selection genuinely moved elsewhere; caller disarms
  const $reassertHeld = (): "intact" | "restored" | "gone" => {
    const sel = $getSelection();
    if (!$isRangeSelection(sel) || !sel.isCollapsed()) return "gone";
    const node = sel.anchor.getNode();
    if (node.getKey() === heldRightKey && sel.anchor.offset === 0) {
      return "intact";
    }
    if (
      $isTextNode(node) &&
      sel.anchor.offset === node.getTextContentSize() &&
      node.getNextSibling()?.getKey() === heldRightKey
    ) {
      const target = $getNodeByKey(heldRightKey ?? "");
      if ($isTextNode(target)) {
        const restored = $createRangeSelection();
        restored.anchor.set(target.getKey(), 0, "text");
        restored.focus.set(target.getKey(), 0, "text");
        $setSelection(restored);
        return "restored";
      }
    }
    return "gone";
  };

  // Navigation defense: DOM-selection ingestion rewrites the held `right@0`
  // back to `left@end`. Put it back. Converges because the DOM caret never
  // actually moved (the two share the pixel) — re-setting reconciles to a
  // position already occupied, firing no new event.
  const defend = editor.registerCommand(
    SELECTION_CHANGE_COMMAND,
    () => {
      if (heldRightKey === null) return false;
      if ($reassertHeld() === "gone") setHeld(null);
      return false;
    },
    COMMAND_PRIORITY_LOW,
  );

  // Typing defense: `beforeinput` re-canonicalizes the held edge to `left@end`
  // immediately before inserting, so a character typed at `right@0` would land
  // in the LEFT node. Re-assert before rich-text's inserter (which runs at
  // COMMAND_PRIORITY_EDITOR, below this) so the char lands on the right side.
  const insert = editor.registerCommand(
    CONTROLLED_TEXT_INSERTION_COMMAND,
    () => {
      if (heldRightKey !== null) $reassertHeld();
      return false; // never consume — rich-text still does the insert
    },
    COMMAND_PRIORITY_LOW,
  );

  return {
    /**
     * Arm (or release, with `null`) the held `right@0` stop programmatically —
     * for behaviors that move the caret to a seam edge themselves (e.g. a
     * number's space-jump to the following prose, or releasing on delete).
     */
    hold: (rightKey: string | null) => setHeld(rightKey),
    unregister: () => {
      left();
      right();
      defend();
      insert();
      editor.getRootElement()?.removeAttribute("data-seam-held");
    },
  };
}
