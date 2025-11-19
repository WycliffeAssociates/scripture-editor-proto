import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createLineBreakNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_EDITOR,
  KEY_ENTER_COMMAND,
  type LineBreakNode,
} from "lexical";
import { useEffect } from "react";

/**
 * This plugin is responsible for creating a new line when the user presses Enter in the editor.
 * It creates a `<LineBreakNode>` which is a wrapper node for the root node of the editor.
 * The reason for this is that we want a new line on enter, but we don't want the "para" marker in the USFM sense.
 * So we create a new line by inserting a new `<LineBreakNode>` which is a new line character.
 */

export function UseLineBreaks() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        event?.preventDefault();

        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode();
          const offset = selection.anchor.offset;
          let lineBreak: LineBreakNode;

          if ($isTextNode(anchorNode)) {
            const size = anchorNode.getTextContentSize();

            if (offset === size) {
              // Cursor at END
              lineBreak = $createLineBreakNode();
              anchorNode.insertAfter(lineBreak);
            } else if (offset === 0) {
              // Cursor at START
              lineBreak = $createLineBreakNode();
              anchorNode.insertBefore(lineBreak);
            } else {
              // Cursor in MIDDLE: split
              const [_left, right] = anchorNode.splitText(offset);
              lineBreak = $createLineBreakNode();
              right.insertBefore(lineBreak);
              right.select(0, 0);
              return true;
            }
          } else {
            lineBreak = $createLineBreakNode();
            selection.insertNodes([lineBreak]);
          }

          // Default: caret after the line break
          lineBreak.selectNext();
          return true;
        }

        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
