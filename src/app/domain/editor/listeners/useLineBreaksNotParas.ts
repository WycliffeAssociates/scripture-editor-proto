import {
  COMMAND_PRIORITY_LOW,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
} from "lexical";

/**
 * Redirect Lexical's default paragraph insertion into a line break inside the
 * scripture editor.
 *
 * Our regular-mode editor uses explicit USFM paragraph markers rather than raw
 * HTML paragraph nodes for structure, so pressing Enter should generally create
 * a line break and let the marker-aware listeners decide whether a new marker
 * line is needed.
 */
export function redirectParaInsertionToLineBreak(editor: LexicalEditor) {
  return editor.registerCommand(
    INSERT_PARAGRAPH_COMMAND,
    (_event: KeyboardEvent) => {
      editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
      return true;
    },
    COMMAND_PRIORITY_LOW,
  );
}
