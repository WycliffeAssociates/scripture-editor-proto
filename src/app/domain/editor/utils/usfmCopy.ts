import {
  $generateJSONFromSelectedNodes,
  $getClipboardDataFromSelection,
  setLexicalClipboardDataTransfer,
} from "@lexical/clipboard";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  COPY_COMMAND,
  CUT_COMMAND,
  type LexicalEditor,
  type SerializedLexicalNode,
} from "lexical";

import { isSerializedUSFMTextNode } from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { materializeFlatTokensArray } from "@/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts";

/**
 * Regular-mode copy/cut: external `text/plain` carries USFM BYTES, not the
 * rendered text (which would silently drop every hidden/structured marker —
 * a verse pasted into another app would lose its `\v 6`). The bytes are
 * assembled through the same materialize waist that save/lint use, so copy
 * can't drift from serialization. Internal fidelity rides the native
 * `application/x-lexical-editor` flavor untouched — custom nodes round-trip
 * with zero custom code (plan §5.4).
 *
 * Flat modes need none of this: markers are visible text there, so default
 * copy IS the bytes.
 */
function $usfmBytesFromSelection(editor: LexicalEditor): string | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;
  const { nodes } = $generateJSONFromSelectedNodes(editor, selection);
  const flat = materializeFlatTokensArray(nodes as SerializedLexicalNode[]);
  let bytes = "";
  for (const node of flat) {
    if (node.type === "linebreak") {
      bytes += "\n";
      continue;
    }
    if (isSerializedUSFMTextNode(node)) {
      bytes += node.text ?? "";
    }
  }
  return bytes;
}

function $writeUsfmClipboard(
  editor: LexicalEditor,
  event: ClipboardEvent,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
  if (!event.clipboardData) return false;
  const bytes = $usfmBytesFromSelection(editor);
  if (bytes === null) return false;

  const data = $getClipboardDataFromSelection(selection);
  data["text/plain"] = bytes;
  setLexicalClipboardDataTransfer(event.clipboardData, data);
  event.preventDefault();
  return true;
}

export function registerUsfmCopy(editor: LexicalEditor) {
  const unregisterCopy = editor.registerCommand(
    COPY_COMMAND,
    (payload) => {
      const event = payload instanceof ClipboardEvent ? payload : null;
      if (!event) return false;
      return $writeUsfmClipboard(editor, event);
    },
    COMMAND_PRIORITY_HIGH,
  );
  const unregisterCut = editor.registerCommand(
    CUT_COMMAND,
    (payload) => {
      const event = payload instanceof ClipboardEvent ? payload : null;
      if (!event) return false;
      if (!$writeUsfmClipboard(editor, event)) return false;
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.removeText();
      return true;
    },
    COMMAND_PRIORITY_HIGH,
  );
  return () => {
    unregisterCopy();
    unregisterCut();
  };
}
