import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";

import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

/**
 * Multi-modal verse/chapter-number drafting behavior, factored like
 * `registerSeamSelection`: one content-agnostic mechanism, parameterized by a
 * per-shape `isNumberNode` predicate and the shape's seam `hold`.
 *
 * Both editor shapes phrase the same rule — when the caret is at a number's
 * end and its space delimiter is present, a keystroke belongs to the verse's
 * PROSE, not the number. In a revision file that prose token already exists; on
 * a skeleton (`\v 1 ` with no following text) it doesn't, so we materialize it,
 * anchored to the number's verse (sid/inPara) so write-back emits the text
 * under the right verse. The single delimiter space lives in exactly one place:
 * if the number carries a trailing space (regular always does; flat skeletons
 * do), the prose starts bare; otherwise the prose owns the leading space.
 *
 * Number-private editing (two-stage delete, retype-into-empty) is NOT here —
 * that's about a number's own bytes and lives with the numbered-marker node.
 *
 * @param isNumberNode Recognizes this shape's number node (regular: the
 *   numbered-marker node; flat: a `numberRange`-typed text node). Both are
 *   `USFMTextNode`, so the body reads sid/inPara/siblings uniformly.
 * @param hold The shape's seam `hold` — pins the prose `text@0` after a jump so
 *   the model doesn't bounce the caret back to the number end (a no-op when the
 *   landing offset isn't the seam edge; the seam releases it on next move).
 */
export function registerNumberProseDrafting(
  editor: LexicalEditor,
  isNumberNode: (node: LexicalNode) => node is USFMTextNode,
  hold: (rightKey: string | null) => void,
) {
  // The existing prose sibling, or a freshly created one anchored to the
  // number's verse. Returns null only when the next sibling is some other
  // non-prose node we shouldn't displace.
  const $ensureProseSibling = (numberNode: USFMTextNode): USFMTextNode => {
    const next = numberNode.getNextSibling();
    if ($isUSFMTextNode(next) && next.getTokenType() === UsfmTokenTypes.text) {
      return next;
    }
    const numberHasTerminator = /\s$/u.test(numberNode.getTextContent());
    const prose = $createUSFMTextNode(numberHasTerminator ? "" : " ", {
      id: crypto.randomUUID(),
      sid: numberNode.getSid(),
      inPara: numberNode.getInPara(),
      tokenType: UsfmTokenTypes.text,
    });
    numberNode.insertAfter(prose);
    return prose;
  };

  // Space at the number's end: the delimiter already exists, so another space
  // would be superfluous bytes — jump the caret to the prose instead, creating
  // it on a skeleton. Falls through (native space → number's delimiter) only
  // when the number is not yet delimited and has no prose to jump to.
  const $redirectSpaceToProse = (event: KeyboardEvent): boolean => {
    if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
      return false;
    }
    if (editor.isComposing()) return false;
    const sel = $getSelection();
    if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;
    const node = sel.anchor.getNode();
    if (!isNumberNode(node)) return false;
    const text = node.getTextContent();
    // At or past the digits (not before them, not mid-number).
    if (sel.anchor.offset < text.trim().length) return false;

    const next = node.getNextSibling();
    const hasProse =
      $isUSFMTextNode(next) && next.getTokenType() === UsfmTokenTypes.text;
    const numberHasTerminator = /\s$/u.test(text);
    if (!hasProse && !numberHasTerminator) return false;

    event.preventDefault();
    event.stopPropagation();
    editor.update(() => {
      const prose = $ensureProseSibling(node);
      // Keep exactly one delimiter space between number and prose: when the
      // number itself isn't terminated, the prose must carry the leading one.
      let content = prose.getTextContent();
      if (!/\s$/u.test(node.getTextContent()) && !content.startsWith(" ")) {
        content = ` ${content}`;
        prose.setTextContent(content);
      }
      const offset = content.startsWith(" ") ? 1 : 0;
      hold(prose.getKey());
      prose.select(offset, offset);
    });
    return true;
  };

  // Type the first prose character of a skeleton verse: caret past the
  // delimiter of a non-empty number with no prose sibling. The keystroke would
  // land in the number, so create the prose, seed it with the char, and put
  // the caret after it. Gated on the delimiter so it never hijacks number
  // editing (`\v 1` + digit is still the user extending the number).
  const $redirectTypingToProse = (event: KeyboardEvent): boolean => {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (editor.isComposing()) return false;
    if (event.key.length !== 1 || event.key === " ") return false;
    const sel = $getSelection();
    if (!$isRangeSelection(sel) || !sel.isCollapsed()) return false;
    const node = sel.anchor.getNode();
    if (!isNumberNode(node)) return false;
    const text = node.getTextContent();
    // True end only — a caret within/right-after the digits is number editing.
    if (text === "" || sel.anchor.offset < text.length) return false;
    if (!/\s$/u.test(text)) return false;
    const next = node.getNextSibling();
    if ($isUSFMTextNode(next) && next.getTokenType() === UsfmTokenTypes.text) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    editor.update(() => {
      const prose = $ensureProseSibling(node);
      prose.setTextContent(`${prose.getTextContent()}${event.key}`);
      const end = prose.getTextContentSize();
      hold(prose.getKey());
      prose.select(end, end);
    });
    return true;
  };

  const keydown = editor.registerCommand<KeyboardEvent>(
    KEY_DOWN_COMMAND,
    (event) =>
      event.key === " "
        ? $redirectSpaceToProse(event)
        : $redirectTypingToProse(event),
    COMMAND_PRIORITY_LOW,
  );

  return () => {
    keydown();
  };
}
