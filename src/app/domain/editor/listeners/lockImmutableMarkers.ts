import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  CUT_COMMAND,
  type LexicalEditor,
  PASTE_COMMAND,
} from "lexical";
import {
  EditorMarkersMutableState,
  EditorMarkersMutableStates,
} from "@/app/data/editor";
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
      const selectionInfo = $getSelectionInfo();
      if (!selectionInfo) return false;
      const {nodes, selection} = selectionInfo;
      if (selectionInfo.crossesLockedNodes) {
        // don't handle and don't stop propagation
        console.log("Prevented cut in locked USFMTextNode or node is hidden");
        event.preventDefault();
        event.stopPropagation();

        // Get text from only unlocked nodes
        const unlockedNodes = nodes
          .filter(
            (node) => $isUSFMTextNode(node) && !$isInLockedUSFMTextNode(node)
          )
          .map((node) => node as USFMTextNode);

        if (unlockedNodes.length === 0) {
          console.log("No unlocked text nodes to cut");
          return true;
        }

        // Build cut text
        const cutText = unlockedNodes
          .map((node) => node.getTextContent())
          .join("");

        // Copy to clipboard manually
        event.clipboardData?.setData("text/plain", cutText);
        // Mutate the editor
        editor.update(() => {
          const startEnd = selection.getStartEndPoints();
          if (!startEnd) {
            return;
          }
          const [start, end] = startEnd;

          for (const node of unlockedNodes) {
            const text = node.getTextContent();

            const startOffset = node === start.getNode() ? start.offset : 0;
            const endOffset = node === end.getNode() ? end.offset : text.length;

            const before = text.slice(0, startOffset);
            const after = text.slice(endOffset);

            // If entire node is selected, just remove it
            if (before === "" && after === "") {
              node.remove();
            } else {
              node.setTextContent(before + after);
            }
          }
          nodes[0].selectEnd();
        });
        return true;
      }
      return false;
    },
    COMMAND_PRIORITY_HIGH // Use high priority to run before the default handler
  );
}

export function lockImmutableMarkersOnPaste(editor: LexicalEditor) {
  return editor.registerCommand(
    PASTE_COMMAND,
    (event: ClipboardEvent) => {
      const selectionInfo = $getSelectionInfo();
      if (!selectionInfo) return false;
      if (selectionInfo.crossesLockedNodes) {
        // don't handle and don't stop propagation
        console.log("Prevented paste in locked USFMTextNode or node is hidden");
        return true;
      }

      // Handle custom paste logic
      // todo: split out elsewhere to highlier level paste listener with subtasks such as this one. This stuff is really for nested container elements like chars
      // editor.update(() => {
      //   const clipboardText = event.clipboardData?.getData("text/plain");
      //   if (!clipboardText) return;

      //   const {selection, anchorNode} = selectionInfo;
      //   if (!$isUSFMTextNode(anchorNode)) return;
      //   if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

      //   const [_leftPart, rightPart] = anchorNode.splitText(
      //     selection.anchor.offset
      //   );
      //   const pastedNode = $createUSFMTextNode(clipboardText, {
      //     id: guidGenerator(),
      //     sid: anchorNode.getSid(),
      //     inPara: anchorNode.getInPara(),
      //     tokenType: "text",
      //   });

      //   _leftPart.insertAfter(pastedNode);
      //   pastedNode.selectEnd();
      //   if (rightPart.getTextContent() === "") rightPart.remove();
      // });

      return false;
    },
    COMMAND_PRIORITY_HIGH // Use high priority to run before the default handler
  );
}
type LockMarkersCommandArgs = {
  editor: LexicalEditor;
  event: KeyboardEvent;
  markersMutableState: EditorMarkersMutableState;
};
export function lockImutableMarkersOnType({
  editor,
  event,
  markersMutableState,
}: LockMarkersCommandArgs) {
  if (markersMutableState !== EditorMarkersMutableStates.IMMUTABLE)
    return false;
  const isDestructive = event.key === "Backspace" || event.key === "Delete";
  // only handle destructive key touches
  // true = to stop propagation. false = continue
  if (!isDestructive) return false;
  const hasAltKey = event.altKey;
  const hasModKey = event.metaKey || event.ctrlKey;
  const selectionInfo = $getSelectionInfo();
  if (!selectionInfo) return false;
  const {
    crossesLockedNodes,
    isCollapsed,
    anchorNode,
    selection,
    nodes,
    isBackward,
  } = selectionInfo;
  // no modifiers, if we don't cross locked nodes, do nothing
  if (!crossesLockedNodes && !hasAltKey && !hasModKey) return false;
  // a collapsed section with alt key will just delete to next word boundary
  if (
    isCollapsed &&
    $isUSFMTextNode(anchorNode) &&
    anchorNode.getMutable() === true &&
    hasAltKey
  ) {
    return false;
  }

  if (isDestructive) {
    event.preventDefault();
    event.stopPropagation();
    // with modifiers, we need to account for a bit more:
    // if crossing locked boundaries but deleting, computing all unlocked ranges and call delete on each
    editor.update(() => {
      // if collapsed, check for modifiers to copy normal behavior of delete to previous word boundary or line:
      if (hasModKey) {
        // delete from current offset back to previous line boundary
        // if (!$isUSFMTextNode(anchorNode)) return;
        const anchorOffset = selection.anchor.offset;
        const focusOffset = selection.focus.offset;
        if (nodes.length === 1 && $isUSFMTextNode(anchorNode)) {
          const furthest = Math.max(anchorOffset, focusOffset);
          const after = anchorNode.getTextContent().slice(furthest);
          anchorNode.setTextContent(after);
          // move the cursor to the start of the node:
          anchorNode.selectStart();
          // for one node selected, just take the furthest spot and clear back
          return; //only one node to handle in collapsed;
        } else {
          // since wepan multiple nodes, the earliest node get cleared
          const nodeToClear = isBackward
            ? selection.focus.getNode()
            : selection.anchor.getNode();
          if ($isUSFMTextNode(nodeToClear)) {
            nodeToClear.setTextContent("");
          }
        }
      }

      const startEnd = selection.getStartEndPoints();
      if (!startEnd) {
        return;
      }
      let [start, end] = startEnd;
      if (isBackward) {
        [start, end] = [end, start];
      }
      const filteredNodes = nodes
        .filter((node) => $isUSFMTextNode(node) && node.getMutable() === true)
        .map((node) => node as USFMTextNode);

      if (filteredNodes.length === 0) {
        return true;
      }
      for (const node of filteredNodes) {
        const textContent = node.getTextContent();
        const startOffset = node === start.getNode() ? start.offset : 0;
        const endOffset =
          node === end.getNode() ? end.offset : textContent.length;
        const before = textContent.slice(0, startOffset);
        const after = textContent.slice(endOffset);
        const newContent = `${before}${after}`;
        node.setTextContent(newContent);
        // node.selectEnd();
      }
      filteredNodes[0].selectEnd();
    });
  }
  return true;
}

function isNonEditingKey(event: KeyboardEvent): boolean {
  // if (event.altKey || event.ctrlKey) return true;
  const nonEditingKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  return nonEditingKeys.includes(event.key);
}
function $getSelectionInfo() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const nodes = selection.getNodes();
  const crossesLockedNodes = nodes.some(
    (node) => $isUSFMTextNode(node) && $isInLockedUSFMTextNode(node)
  );
  return {
    selection,
    crossesLockedNodes,
    nodes,
    isCollapsed: selection.isCollapsed(),
    anchorNode: selection.anchor.getNode(),
    anchorOffset: selection.anchor.offset,
    focusNode: selection.focus.getNode(),
    focusOffset: selection.focus.offset,
    isBackward: selection.isBackward(),
  };
}

function $getActiveUSFMTextNode(): USFMTextNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor.getNode();
  return $isUSFMTextNode(anchor) ? anchor : null;
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
