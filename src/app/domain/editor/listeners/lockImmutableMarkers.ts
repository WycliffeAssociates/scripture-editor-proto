import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  CUT_COMMAND,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
} from "lexical";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import {guidGenerator} from "@/core/data/utils/generic";

export function lockImmutableMarkersOnCut(editor: LexicalEditor) {
  return editor.registerCommand(
    CUT_COMMAND,
    (event: ClipboardEvent) => {
      const anchorNode = editor.getEditorState().read($getActiveUSFMTextNode);
      if (!anchorNode) return false;

      // Block paste entirely if the node is locked
      if (
        $isInLockedUSFMTextNode(anchorNode) ||
        !$isShowingUSFMTextNode(anchorNode)
      ) {
        console.log("Prevented cut in locked USFMTextNode or node is hidden");
        event.preventDefault();
        return true;
      }
      return true;
    },
    COMMAND_PRIORITY_HIGH // Use high priority to run before the default handler
  );
}

export function lockImmutableMarkersOnPaste(editor: LexicalEditor) {
  return editor.registerCommand(
    PASTE_COMMAND,
    (event: ClipboardEvent) => {
      const anchorNode = editor.getEditorState().read($getActiveUSFMTextNode);
      if (!anchorNode) return false;

      // Block paste entirely if the node is locked
      if (
        $isInLockedUSFMTextNode(anchorNode) ||
        !$isShowingUSFMTextNode(anchorNode)
      ) {
        console.log("Prevented paste in locked USFMTextNode or node is hidden");
        return true;
      }

      // Handle custom paste logic
      // todo: split out elsewhere to highlier level paste listener with subtasks such as this one
      editor.update(() => {
        const clipboardText = event.clipboardData?.getData("text/plain");
        if (!clipboardText) return;

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

        const [_leftPart, rightPart] = anchorNode.splitText(
          selection.anchor.offset
        );
        const pastedNode = $createUSFMTextNode(clipboardText, {
          id: guidGenerator(),
          sid: anchorNode.getSid(),
          inPara: anchorNode.getInPara(),
          tokenType: "text",
        });

        _leftPart.insertAfter(pastedNode);
        pastedNode.selectEnd();
        if (rightPart.getTextContent() === "") rightPart.remove();
      });

      return true;
    },
    COMMAND_PRIORITY_HIGH // Use high priority to run before the default handler
  );
}
type LockMarkersCommandArgs = {
  editor: LexicalEditor;
  event: KeyboardEvent;
};
export function lockImutableMarkersOnType({
  editor,
  event,
}: LockMarkersCommandArgs) {
  if (isNonEditingKey(event)) return false;

  const anchorNode = editor.getEditorState().read($getActiveUSFMTextNode);
  if (!anchorNode) return false;

  if (
    $isInLockedUSFMTextNode(anchorNode) ||
    !$isShowingUSFMTextNode(anchorNode)
  ) {
    console.log("Prevented key input in locked USFMTextNode or node is hidden");
    event.preventDefault();
    return true;
  }

  return false;
}

function isNonEditingKey(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return true;
  const nonEditingKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  return nonEditingKeys.includes(event.key);
}

function $getActiveUSFMTextNode(): USFMTextNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  return $isUSFMTextNode(selection.anchor.getNode())
    ? (selection.anchor.getNode() as USFMTextNode)
    : null;
}

/** Checks whether the given node (or active node if omitted) is locked (immutable). */
function $isInLockedUSFMTextNode(node?: USFMTextNode | null): boolean {
  const target = node ?? $getActiveUSFMTextNode();
  return target ? target.getMutable() === false : false;
}
function $isShowingUSFMTextNode(node?: USFMTextNode | null): boolean {
  const target = node ?? $getActiveUSFMTextNode();
  return target ? target.getShow() : false;
}
