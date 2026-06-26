import {
  $create,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  $setState,
  COMMAND_PRIORITY_LOW,
  createState,
  DELETE_CHARACTER_COMMAND,
  type EditorConfig,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type TextNode,
} from "lexical";

import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
  type SerializedUSFMTextNode,
  USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { registerNumberProseDrafting } from "@/app/domain/editor/selection/numberProseDrafting.ts";
import { registerSeamSelection } from "@/app/domain/editor/selection/seamSelection.ts";
import {
  idState,
  inParaState,
  markerState,
  sidState,
  tokenTypeState,
} from "@/app/domain/editor/states.ts";

const USFM_NUMBERED_MARKER_NODE_TYPE = "usfm-numbered-marker-node" as const;

/** Token type carried by numbered-marker nodes — see UsfmTokenTypes. */
const NUMBERED_MARKER_TOKEN_TYPE = UsfmTokenTypes.numberedMarker;

// --- Node-specific NodeState ---
// These states exist only on numbered-marker nodes, so they live here rather
// than in the shared states.ts.

/**
 * The opening marker's bytes verbatim, including its absorbed required
 * delimiter (e.g. "\\v " or "\\vp "). Never part of the editable text.
 */
const openBytesState = createState("openBytes", {
  parse: (value) => (typeof value === "string" ? value : ""),
});

/**
 * End-marker bytes as given by the lexer (e.g. "\\vp*"), or null when the
 * marker family never closes (\c, \v, \cp) or the close was absent in the
 * file. Whether a close is *expected* is a catalog question
 * (closingBehavior), not stored here.
 */
const closeBytesState = createState("closeBytes", {
  parse: (value) => (typeof value === "string" ? value : null),
});

/** Original token id of the opening marker token. */
const openIdState = createState("openId", {
  parse: (value) => (typeof value === "string" ? value : ""),
});

/** Original token id of the endMarker token, when one exists. */
const closeIdState = createState("closeId", {
  parse: (value) => (typeof value === "string" ? value : null),
});

export type SerializedUSFMNumberedMarkerNode = SerializedUSFMTextNode & {
  openBytes: string;
  closeBytes: string | null;
  openId: string;
  closeId: string | null;
};

/**
 * Inline node for the marker+number-payload family (\c, \v, \cp, \ca, \va,
 * \vp — catalog `payload: "numberRange"`).
 *
 * The marker's bytes live in NodeState (`openBytes`/`closeBytes`); only the
 * Number token's source is editable text. The caret therefore cannot reach
 * marker bytes at the model level — the hidden-editable-bytes failure class
 * is unrepresentable rather than repaired.
 *
 * `textContent` is the Number token source VERBATIM: any excess leading
 * whitespace the lexer parked forward, plus the number's own trailing
 * argument-terminator space. It may be "" — a legitimate transient bad state
 * (surfaced by lint, never silently repaired).
 *
 * Token identity: the node's base `id` is the Number token's id (findings
 * anchor to the visible content); `openId`/`closeId` retain the marker and
 * endMarker token ids so findings on those tokens survive round-trips.
 *
 * Emission is shape-derived: open marker token · Number token ·
 * [endMarker token iff closeBytes != null].
 */
export class USFMNumberedMarkerNode extends USFMTextNode {
  static getType(): string {
    return USFM_NUMBERED_MARKER_NODE_TYPE;
  }

  $config() {
    return this.config(USFM_NUMBERED_MARKER_NODE_TYPE, {
      extends: USFMTextNode,
      stateConfigs: [
        { flat: true, stateConfig: openBytesState },
        { flat: true, stateConfig: closeBytesState },
        { flat: true, stateConfig: openIdState },
        { flat: true, stateConfig: closeIdState },
      ],
    });
  }

  exportJSON(): SerializedUSFMNumberedMarkerNode {
    return {
      ...super.exportJSON(),
      lexicalType:
        USFM_NUMBERED_MARKER_NODE_TYPE as unknown as SerializedUSFMTextNode["lexicalType"],
      openBytes: this.getOpenBytes(),
      closeBytes: this.getCloseBytes(),
      openId: this.getOpenId(),
      closeId: this.getCloseId(),
    };
  }

  // --- Getters / setters ---
  getOpenBytes(): string {
    return $getState(this.getLatest(), openBytesState);
  }
  getCloseBytes(): string | null {
    return $getState(this.getLatest(), closeBytesState);
  }
  getOpenId(): string {
    return $getState(this.getLatest(), openIdState);
  }
  getCloseId(): string | null {
    return $getState(this.getLatest(), closeIdState);
  }
  setOpenBytes(openBytes: string): this {
    $setState(this.getWritable(), openBytesState, openBytes);
    return this;
  }
  setCloseBytes(closeBytes: string | null): this {
    $setState(this.getWritable(), closeBytesState, closeBytes);
    return this;
  }

  /**
   * The bytes this node contributes to the serialized stream:
   * openBytes · number source · closeBytes.
   */
  getUsfmBytes(): string {
    return (
      this.getOpenBytes() + this.getTextContent() + (this.getCloseBytes() ?? "")
    );
  }

  /**
   * Marker bytes can never split off — they aren't in the text — but a
   * split would fragment the Number token into number + spurious text
   * siblings (created as plain text nodes by Lexical's splitText), breaking
   * token fidelity. Numbered nodes refuse to split; range operations clamp
   * to whole-content semantics instead.
   *
   * Known consequence: callers that index into the split result
   * (formatText) would misbehave — the scripture editor dispatches no text
   * format commands, and the playground swallows FORMAT_TEXT_COMMAND.
   */
  splitText(..._splitOffsets: number[]): TextNode[] {
    return [this.getLatest()];
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    element.classList.add("usfm-numbered-marker");
    // The node answers for ALL its token ids: data-id (base) carries the
    // Number token id; these carry the marker/endMarker ids so findings
    // anchored to any of the 2–3 emitted tokens resolve to this element
    // (FindingsOverlayPlugin indexes them alongside data-id).
    element.dataset.openId = this.getOpenId();
    const closeId = this.getCloseId();
    if (closeId) element.dataset.closeId = closeId;
    if (this.getTextContent() === "") {
      element.dataset.empty = "true";
    }
    return element;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    // data-empty rides on the DOM element; recreate it when emptiness
    // flips so the empty-state affordance stays in sync. `prevNode` is a
    // previous snapshot — read its text directly, NOT via getters (they
    // call getLatest(), collapsing the prev/next comparison).
    const wasEmpty = prevNode.__text === "";
    const isEmpty = this.__text === "";
    if (wasEmpty !== isEmpty) return true;
    return super.updateDOM(prevNode, dom, config);
  }
}

export function $isUSFMNumberedMarkerNode(
  node: unknown,
): node is USFMNumberedMarkerNode {
  return node instanceof USFMNumberedMarkerNode;
}

export type USFMNumberedMarkerNodeMetadata = {
  /** Number token id — becomes the node's base id (findings anchor). */
  numberId: string;
  openId: string;
  closeId?: string | null;
  openBytes: string;
  closeBytes?: string | null;
  marker: string;
  sid?: string;
  inPara?: string;
};

export function $createUSFMNumberedMarkerNode(
  /** Number token source verbatim (may be "" for an unpaired marker). */
  numberText: string,
  metadata: USFMNumberedMarkerNodeMetadata,
): USFMNumberedMarkerNode {
  const node = $create(USFMNumberedMarkerNode).setTextContent(numberText);
  const writable = node.getWritable();
  $setState(writable, idState, metadata.numberId);
  $setState(writable, openIdState, metadata.openId);
  $setState(writable, closeIdState, metadata.closeId ?? null);
  $setState(writable, openBytesState, metadata.openBytes);
  $setState(writable, closeBytesState, metadata.closeBytes ?? null);
  $setState(writable, markerState, metadata.marker);
  $setState(writable, tokenTypeState, NUMBERED_MARKER_TOKEN_TYPE);
  if (metadata.sid) $setState(writable, sidState, metadata.sid);
  $setState(writable, inParaState, metadata.inPara);
  return node;
}

/**
 * Serialized-JSON factory for the pairing waist (which runs over serialized
 * trees with no Lexical editor in scope). Mirrors what exportJSON of a
 * $createUSFMNumberedMarkerNode-built node produces, so paired-at-load and
 * round-tripped nodes are indistinguishable.
 */
export function createSerializedUSFMNumberedMarkerNode(
  numberText: string,
  metadata: USFMNumberedMarkerNodeMetadata,
): SerializedUSFMNumberedMarkerNode {
  return {
    type: USFM_NUMBERED_MARKER_NODE_TYPE,
    lexicalType:
      USFM_NUMBERED_MARKER_NODE_TYPE as unknown as SerializedUSFMTextNode["lexicalType"],
    version: 1,
    text: numberText,
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    id: metadata.numberId,
    openId: metadata.openId,
    closeId: metadata.closeId ?? null,
    openBytes: metadata.openBytes,
    closeBytes: metadata.closeBytes ?? null,
    marker: metadata.marker,
    tokenType: NUMBERED_MARKER_TOKEN_TYPE,
    sid: metadata.sid ?? "",
    inPara: metadata.inPara,
  };
}

export function isSerializedUSFMNumberedMarkerNode(
  node: { type?: string } | null | undefined,
): node is SerializedUSFMNumberedMarkerNode {
  return node?.type === USFM_NUMBERED_MARKER_NODE_TYPE;
}

/**
 * Two-stage delete for numbered-marker nodes (one synchronous command guard;
 * no timers, no async caret moves):
 *
 * 1. A deletion entirely within one numbered node that would leave no number
 *    content (whitespace-only counts as none — the content carries the
 *    number's argument-terminator space) empties the node instead. The caret
 *    stays inside the still-number-typed node, so typing the replacement
 *    digit immediately renders as a number.
 * 2. A delete on an already-empty node removes it whole — structure,
 *    delimiter and all, in one gesture.
 *
 * Everything else falls through to default Lexical behavior: offset-0
 * backspace reaches the previous sibling (no hidden bytes to eat), and
 * multi-node range deletes remove visibly-selected nodes whole.
 *
 * Stage 1's @0 placement is an affinity-armed position like the arrow
 * stops' — without arming, ingestion would normalize the caret out of the
 * just-emptied node and the replacement digit would land in the previous
 * text node.
 */
function registerDeletion(editor: LexicalEditor, clearProseEdge: () => void) {
  return editor.registerCommand<boolean>(
    DELETE_CHARACTER_COMMAND,
    (isBackward) => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return false;
      const anchorNode = selection.anchor.getNode();

      // Backspace at the prose edge (`text@0` held by the arrow defense,
      // previous sibling a number). The number's SOLE trailing space is
      // onion's argument delimiter — deleting it natively would strand
      // the digits ("8The" — model diverges from bytes, I2). But EXTRA
      // trailing spaces (from disk) are ordinary content: delete those
      // one at a time. So only intervene when the delete would remove the
      // last remaining delimiter.
      if (
        selection.isCollapsed() &&
        isBackward &&
        selection.anchor.offset === 0 &&
        $isTextNode(anchorNode) &&
        !$isUSFMNumberedMarkerNode(anchorNode)
      ) {
        const prev = anchorNode.getPreviousSibling();
        if ($isUSFMNumberedMarkerNode(prev)) {
          const ptext = prev.getTextContent();
          const digits = ptext.replace(/\s+$/u, "");
          if (digits === "") {
            // Empty placeholder — backspace removes the whole
            // number (stage 2 from the prose side; the empty inline
            // node can't be deleted natively).
            clearProseEdge();
            prev.remove();
            anchorNode.select(0, 0);
            return true;
          }
          const raw = ptext.slice(0, -1); // native: drop prev's last char
          if (/\s$/u.test(ptext) && !/\s$/u.test(raw)) {
            // That last char was the sole delimiter — don't strand
            // the digits; drop the last digit instead.
            clearProseEdge();
            const next = raw.slice(0, -1); // raw == digits, no WS
            if (next.trim() === "") {
              prev.setTextContent("");
              prev.select(0, 0);
            } else {
              prev.setTextContent(`${next} `);
              prev.select(next.length, next.length);
            }
            return true;
          }
          // Excess trailing space — let native delete one of them.
          return false;
        }
      }

      if (!$isUSFMNumberedMarkerNode(anchorNode)) return false;

      const text = anchorNode.getTextContent();

      // Stage 2: the node is already empty — remove it whole.
      if (selection.isCollapsed() && text === "") {
        const prev = anchorNode.getPreviousSibling();
        const parent = anchorNode.getParent();
        const index = anchorNode.getIndexWithinParent();
        anchorNode.remove();
        if ($isTextNode(prev)) {
          prev.selectEnd();
        } else if (parent?.isAttached()) {
          parent.select(index, index);
        }
        return true;
      }

      // Empty the node to its I2-clean placeholder ("" — no lone
      // terminator, which would re-lex as part of the next word) and
      // keep the caret inside. The empty inline node can't host a DOM
      // caret, but $typeIntoEmptyNumber catches the retype keystroke and
      // the painted caret (NumberedCaretPlugin) reads the model anchor,
      // so the affordance + retype work without an affinity defense.
      const $emptyInPlace = (): true => {
        anchorNode.setTextContent("");
        anchorNode.select(0, 0);
        return true;
      };

      // The number's content is "<digits><WS terminator>". The terminator
      // is onion's argument delimiter (railroad: VERSE then `'' | WS`),
      // which the lexer collapses into the number token — so stranding
      // the digits without ANY trailing space ("6" before "Then") makes
      // the bytes re-lex as "6Then" (an I2 divergence). But only the LAST
      // remaining space is that delimiter: extra trailing spaces (from
      // disk) are ordinary, deletable one at a time. So we step in only
      // when a delete would remove the final space and strand the digits.
      if (selection.isCollapsed()) {
        const offset = selection.anchor.offset;
        if (isBackward) {
          if (offset === 0) return false; // boundary → prev sibling
          const raw = text.slice(0, offset - 1) + text.slice(offset);
          if (raw.trim() === "") return $emptyInPlace();
          // Removing the sole delimiter strands the digits — drop the
          // last digit instead (keep one terminator).
          if (/\s$/u.test(text) && !/\s$/u.test(raw)) {
            const next = raw.slice(0, -1); // raw == digits, no WS
            if (next.trim() === "") return $emptyInPlace();
            anchorNode.setTextContent(`${next} `);
            anchorNode.select(next.length, next.length);
            return true;
          }
          return false; // digit, or one of several excess spaces
        }

        // Forward delete (mirror): swallow only when it would strip the
        // sole delimiter; excess spaces / digits delete natively.
        if (offset >= text.length) return false; // boundary → default
        const raw = text.slice(0, offset) + text.slice(offset + 1);
        if (raw.trim() === "") return $emptyInPlace();
        if (/\s$/u.test(text) && !/\s$/u.test(raw)) return true;
        return false;
      }

      // Non-collapsed: only handle a range fully inside this node;
      // empty out when it would clear every digit, else defer.
      const focusNode = selection.focus.getNode();
      if (focusNode !== anchorNode) return false; // multi-node → default
      const start = Math.min(selection.anchor.offset, selection.focus.offset);
      const end = Math.max(selection.anchor.offset, selection.focus.offset);
      const remaining = text.slice(0, start) + text.slice(end);
      return remaining.trim() === "" ? $emptyInPlace() : false;
    },
    COMMAND_PRIORITY_LOW,
  );
}

/**
 * The number/prose seam: a numbered-marker node (always the left member) butts
 * up against a following non-numbered text node. This is the boundary whose two
 * stops (`num@end`, `text@0`) the generic seam selection makes reachable.
 */
const isNumberedSeam = (left: TextNode, right: TextNode): boolean =>
  $isUSFMNumberedMarkerNode(left) &&
  $isTextNode(right) &&
  !$isUSFMNumberedMarkerNode(right);

/**
 * All numbered-marker caret/editing behavior. The seam navigation — boundary
 * arrow stops and the canonicalization defenses that hold the prose `text@0` —
 * is the generic `registerSeamSelection` (regular mode's number/prose seam is
 * just `isNumberedSeam`). Layered on top here are the behaviors specific to a
 * number's *bytes*: two-stage delete, empty-node retype, and the space-jump.
 *
 * While a seam edge is armed, `registerSeamSelection` marks the root with
 * `data-seam-held` so NumberedCaretPlugin keeps the caret black through the
 * transient canonicalization (no blue flicker). The number-content behaviors
 * drive that same armed state via `seam.hold(...)`.
 */
export function registerNumberedMarkerBehaviors(editor: LexicalEditor) {
  const seam = registerSeamSelection(editor, isNumberedSeam);

  // Two-stage delete (backspace last digit → empty placeholder; backspace
  // again → remove the whole node), terminator-aware so the number's WS
  // delimiter is never orphaned (see registerDeletion).
  const del = registerDeletion(editor, () => seam.hold(null));

  // Type the first character into an EMPTY numbered node. An empty inline
  // node can't host a DOM caret, so the browser would route the keystroke to
  // the adjacent prose; the model anchor is correct, so write the char (plus
  // the restored terminator) straight into the number.
  const $typeIntoEmptyNumber = (event: KeyboardEvent): boolean => {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (editor.isComposing()) return false;
    if (event.key.length !== 1 || event.key === " ") return false;
    const sel = $getSelection();
    if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;
    const node = sel.anchor.getNode();
    if (!$isUSFMNumberedMarkerNode(node) || node.getTextContent() !== "") {
      return false;
    }
    event.preventDefault();
    node.setTextContent(`${event.key} `);
    node.select(1, 1);
    return true;
  };
  const typeEmpty = editor.registerCommand<KeyboardEvent>(
    KEY_DOWN_COMMAND,
    $typeIntoEmptyNumber,
    COMMAND_PRIORITY_LOW,
  );

  // Number→prose drafting (space-jump + skeleton prose creation) is the
  // shared multi-modal mechanism; the regular shape supplies its number-node
  // predicate and seam hold. (The flat shape wires the same mechanism with
  // its own predicate/seam in useEditorInput.)
  const drafting = registerNumberProseDrafting(
    editor,
    (node): node is USFMTextNode => $isUSFMNumberedMarkerNode(node),
    seam.hold,
  );

  return () => {
    seam.unregister();
    del();
    typeEmpty();
    drafting();
  };
}
