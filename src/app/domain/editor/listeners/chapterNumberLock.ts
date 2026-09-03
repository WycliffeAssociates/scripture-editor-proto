import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  DRAGSTART_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  PASTE_COMMAND,
  type RangeSelection,
  REMOVE_TEXT_COMMAND,
} from "lexical";

import {
  $isUSFMNumberedMarkerNode,
  type USFMNumberedMarkerNode,
} from "@/app/domain/editor/nodes/USFMNumberedMarkerNode.ts";
import { isChapterMarker } from "@/core/domain/usfm/onionMarkers.ts";

/**
 * The chapter number (`\c N`) is immutable in the editor.
 *
 * Every downstream consumer keys a chapter by its label: the mirror's Braid
 * state applies a chapter update by looking the label up in the book, so a
 * chapter whose `\c` was deleted (select-all + cut, paste-over, backspace)
 * or renumbered fails the update (`replacementLabelMismatch`) and lint and
 * proofreading drift out of sync with what is on screen. Rather than teach
 * every consumer to recover, the editor refuses the gesture: any command
 * that would remove a chapter-number node or change its digits is swallowed
 * before the default handlers run.
 *
 * Verse numbers are deliberately NOT locked — renumbering and removing them
 * is ordinary revision work, and they keep the two-stage delete behaviour
 * owned by the numbered-marker node.
 */
const $isChapterNumber = (
  node: LexicalNode | null | undefined,
): node is USFMNumberedMarkerNode =>
  $isUSFMNumberedMarkerNode(node) && isChapterMarker(node.getMarker() ?? "");

/** A non-collapsed range that includes any part of a chapter number. */
const $rangeReachesChapter = (selection: RangeSelection): boolean =>
  !selection.isCollapsed() && selection.getNodes().some($isChapterNumber);

/** The caret sits inside a chapter number (any offset). */
const $caretInChapter = (selection: RangeSelection): boolean =>
  selection.isCollapsed() && $isChapterNumber(selection.anchor.getNode());

/**
 * A collapsed delete that would eat into a neighbouring chapter number:
 * backspace at the start of the node right after it, or forward-delete at
 * the end of the node right before it.
 */
const $collapsedDeleteReachesChapter = (
  selection: RangeSelection,
  isBackward: boolean,
): boolean => {
  if (!selection.isCollapsed()) return false;
  const node = selection.anchor.getNode();
  if ($isChapterNumber(node)) return true;
  const offset = selection.anchor.offset;
  if (isBackward) {
    return offset === 0 && $isChapterNumber(node.getPreviousSibling());
  }
  return (
    offset >= node.getTextContentSize() &&
    $isChapterNumber(node.getNextSibling())
  );
};

const $current = (): RangeSelection | null => {
  const selection = $getSelection();
  return $isRangeSelection(selection) ? selection : null;
};

const swallow = (event: Event | null | undefined): true => {
  event?.preventDefault();
  return true;
};

export function registerChapterNumberLock(editor: LexicalEditor) {
  const unregisters = [
    // Deletes: character, word, line.
    ...[DELETE_CHARACTER_COMMAND, DELETE_WORD_COMMAND, DELETE_LINE_COMMAND].map(
      (command) =>
        editor.registerCommand<boolean>(
          command,
          (isBackward) => {
            const selection = $current();
            if (!selection) return false;
            return (
              $rangeReachesChapter(selection) ||
              $collapsedDeleteReachesChapter(selection, isBackward)
            );
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
    ),

    // Range replacements: cut, drag-out, composition/drag deletes.
    ...[CUT_COMMAND, REMOVE_TEXT_COMMAND, DRAGSTART_COMMAND].map((command) =>
      editor.registerCommand<Event | null>(
        command,
        (event) => {
          const selection = $current();
          if (!selection || !$rangeReachesChapter(selection)) return false;
          return swallow(event);
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    ),

    // Insertions that replace the selection or land inside the number.
    editor.registerCommand<Event | null>(
      PASTE_COMMAND,
      (event) => {
        const selection = $current();
        if (!selection) return false;
        if (!$rangeReachesChapter(selection) && !$caretInChapter(selection)) {
          return false;
        }
        return swallow(event);
      },
      COMMAND_PRIORITY_CRITICAL,
    ),
    editor.registerCommand<string | InputEvent>(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (payload) => {
        const selection = $current();
        if (!selection) return false;
        if (!$rangeReachesChapter(selection) && !$caretInChapter(selection)) {
          return false;
        }
        return swallow(typeof payload === "string" ? null : payload);
      },
      COMMAND_PRIORITY_CRITICAL,
    ),
    // Uncontrolled typing inside the number never reaches a text-insertion
    // command (the browser mutates the DOM and Lexical reconciles), so the
    // keystroke itself is stopped. Space is left alone: at the number's end it
    // is the number→prose jump, which does not touch the digits.
    editor.registerCommand<KeyboardEvent>(
      KEY_DOWN_COMMAND,
      (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return false;
        if (event.key.length !== 1 || event.key === " ") return false;
        const selection = $current();
        if (!selection) return false;
        if (!$rangeReachesChapter(selection) && !$caretInChapter(selection)) {
          return false;
        }
        return swallow(event);
      },
      COMMAND_PRIORITY_CRITICAL,
    ),

    // Enter over a range that reaches the number, or strictly inside it.
    ...[
      INSERT_PARAGRAPH_COMMAND,
      INSERT_LINE_BREAK_COMMAND,
      KEY_ENTER_COMMAND,
    ].map((command) =>
      editor.registerCommand<unknown>(
        command,
        (payload) => {
          const selection = $current();
          if (!selection) return false;
          if ($rangeReachesChapter(selection)) {
            return swallow(payload instanceof Event ? payload : null);
          }
          if (!$caretInChapter(selection)) return false;
          const offset = selection.anchor.offset;
          const size = selection.anchor.getNode().getTextContentSize();
          if (offset === 0 || offset >= size) return false;
          return swallow(payload instanceof Event ? payload : null);
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    ),
  ];

  return () => {
    for (const unregister of unregisters) unregister();
  };
}
