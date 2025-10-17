import {$dfs, $reverseDfs} from "@lexical/utils";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  EditorState,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import {
  type EditorMarkersMutableState,
  EditorMarkersMutableStates,
  type EditorMarkersViewState,
  EditorMarkersViewStates,
  TOKEN_TYPES_CAN_TOGGLE_HIDE,
} from "@/app/data/editor";
import {$isUSFMElementNode} from "@/app/domain/editor/nodes/USFMElementNode";
import {
  $isUSFMTextNode,
  USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";

type toggleShowOnToggleableNodesArgs = {
  editor: LexicalEditor;
  editorState: EditorState;
  markersViewState: EditorMarkersViewState;
  currentActive: Set<NodeKey>;
  setCurrentActive: (activeNodes: Set<NodeKey>) => void;
  markersMutableState: EditorMarkersMutableState;
};

export function toggleShowOnToggleableNodes({
  editor,
  editorState,
  markersViewState,
  currentActive,
  setCurrentActive,
  markersMutableState,
}: toggleShowOnToggleableNodesArgs) {
  if (markersViewState !== EditorMarkersViewStates.WHEN_EDITING) {
    return;
  }
  let toDeactivate: NodeKey[] = [];
  let toActivate: NodeKey[] = [];

  editorState.read(() => {
    const selection = $getSelection();
    if (!selection || !$isRangeSelection(selection)) return;

    const newActive = new Set<NodeKey>();
    const selNodes = selection.getNodes();

    for (const node of selNodes) {
      const conditionals = findRelevantConditionals(node);
      if (conditionals) {
        for (const conditional of conditionals) {
          newActive.add(conditional.getKey());
        }
      }
    }

    const prevActive = currentActive;
    toDeactivate = [...prevActive].filter((k) => !newActive.has(k));
    toActivate = [...newActive].filter((k) => !prevActive.has(k));
    if (toDeactivate.length > 0 || toActivate.length > 0) {
      setCurrentActive(newActive);
    } else {
      toDeactivate = [];
      toActivate = [];
    }
  });
  if (toDeactivate.length > 0 || toActivate.length > 0) {
    editor.update(
      () => {
        for (const key of toDeactivate) {
          const node = $getNodeByKey(key);
          if ($isUSFMTextNode(node)) {
            node.setShow(false);
            node.setMutable(false);
          }
        }
        for (const key of toActivate) {
          const node = $getNodeByKey(key);
          if ($isUSFMTextNode(node)) {
            node.setShow(true);
            if (markersMutableState === EditorMarkersMutableStates.MUTABLE) {
              node.setMutable(true);
            }
          }
        }
      },
      {tag: HISTORY_MERGE_TAG}
    );
  }
}

/**
 * FINDS ALL NODES WITHIN THIS ACTIVE SID TO SHOW/HIDE
 */
function findRelevantConditionals(node: LexicalNode): USFMTextNode[] | null {
  // given a node: find the nearest sid backwards;
  // collect all sids that have a tokenType of tokenTypesToHideByDefault between this node and that one (inclusive);
  if (!$isUSFMTextNode(node)) return null;
  const thisSid = node.getSid();
  if (!thisSid) return null;
  const root = $getRoot();
  let endNode: USFMTextNode | null = null;
  const collected: USFMTextNode[] = [];
  for (const prevNode of $reverseDfs(node, root)) {
    if ($isUSFMTextNode(prevNode.node)) {
      const tokenType = prevNode.node.getTokenType();
      const sid = prevNode.node.getSid();
      if (sid && sid !== thisSid) break;
      if (TOKEN_TYPES_CAN_TOGGLE_HIDE.has(tokenType)) {
        collected.push(prevNode.node);
      }

      // in the event that we happen to this node happens to be char in a USFMElementNode, also check for all it's children:
      const parent = prevNode.node.getParent();
      if (!parent || !$isUSFMElementNode(parent)) {
        continue;
      }
      const lastChild = parent.getLastChild();
      if (!lastChild) continue;
      const children = $dfs(parent, lastChild);
      for (const child of children) {
        if ($isUSFMTextNode(child.node)) {
          const tokenType = child.node.getTokenType();
          const sid = child.node.getSid();
          if (sid && sid !== thisSid) break;
          if (TOKEN_TYPES_CAN_TOGGLE_HIDE.has(tokenType)) {
            collected.push(child.node);
          }
        }
      }
    }
  }

  return collected;
}
