import { $dfs, $dfsIterator, $reverseDfsIterator } from "@lexical/utils";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  type EditorState,
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
  UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
  $isUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

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
      {
        tag: [HISTORY_MERGE_TAG],
      },
    );
  }
}

/**
 * FINDS ALL NODES WITHIN THIS ACTIVE SID TO SHOW/HIDE
 */
function findRelevantConditionals(node: LexicalNode): USFMTextNode[] | null {
  if (!$isUSFMTextNode(node)) return null;

  const thisSid = node.getSid();
  if (!thisSid) return null;
  const collected: USFMTextNode[] = [];

  // --- Backward phase
  collected.push(...collectBackwardToggleable(node, thisSid));
  collected.push(...collectForwardToggleable(node, thisSid));

  // --- Forward phase if we're inside inChars
  const inChars = node.getInChars();
  if (inChars.length > 0) {
    collected.push(...collectForwardForInChars(node, thisSid, inChars));
  }

  return collected;
}

// --- helpers

function collectBackwardToggleable(
  node: USFMTextNode,
  _sid: string,
): USFMTextNode[] {
  const root = $getRoot();
  const collected: USFMTextNode[] = [];

  for (const prevNode of $reverseDfsIterator(node, root)) {
    // don't cross line breaks.
    if ($isLineBreakNode(prevNode.node)) break;
    if (!$isUSFMTextNode(prevNode.node)) continue;

    const tType = prevNode.node.getTokenType();
    // const s = prevNode.node.getSid();
    // if (s && s !== sid) break;

    if (TOKEN_TYPES_CAN_TOGGLE_HIDE.has(tType)) collected.push(prevNode.node);

    // const parent = prevNode.node.getParent();
    // if (!parent || !$isUSFMElementNode(parent)) continue;

    // const lastChild = parent.getLastChild();
    // if (!lastChild) continue;

    // for (const child of $dfs(parent, lastChild)) {
    //   if (!$isUSFMTextNode(child.node)) continue;

    //   const ctType = child.node.getTokenType();
    //   const cs = child.node.getSid();
    //   if (cs && cs !== sid) break;

    //   if (TOKEN_TYPES_CAN_TOGGLE_HIDE.has(ctType)) collected.push(child.node);
    // }
  }

  return collected;
}
function collectForwardToggleable(
  node: USFMTextNode,
  _sid: string,
): USFMTextNode[] {
  const root = $getRoot();
  const collected: USFMTextNode[] = [];
  const lastEl = root.getLastChild();
  if (!lastEl) return collected;
  for (const prevNode of $dfsIterator(node, lastEl)) {
    // don't cross line breaks.
    if ($isLineBreakNode(prevNode.node)) break;
    if (!$isUSFMTextNode(prevNode.node)) continue;
    const tType = prevNode.node.getTokenType();
    // const s = prevNode.node.getSid();
    // if (s && s !== sid) break;

    if (TOKEN_TYPES_CAN_TOGGLE_HIDE.has(tType)) collected.push(prevNode.node);
  }
  return collected;
}

function collectForwardForInChars(
  node: USFMTextNode,
  sid: string,
  inChars: string[],
): USFMTextNode[] {
  const root = $getRoot();
  const collected: USFMTextNode[] = [];
  const seenEnds = new Set<string>();

  for (const nextNode of $dfs(node, root)) {
    if (!$isUSFMTextNode(nextNode.node)) continue;

    const tType = nextNode.node.getTokenType();
    const s = nextNode.node.getSid();
    if (s && s !== sid) break;

    if (TOKEN_TYPES_CAN_TOGGLE_HIDE.has(tType)) collected.push(nextNode.node);

    for (const charName of inChars) {
      if (isEndMarkerForChar(nextNode.node, charName)) {
        seenEnds.add(charName);
        if (seenEnds.size === inChars.length) return collected;
      }
    }
  }

  return collected;
}

function isEndMarkerForChar(node: USFMTextNode, charName: string) {
  if (node.getTokenType() !== UsfmTokenTypes.endMarker) return false;
  const markerText = node.getTextContent().replace("\\", "").replace("*", "");
  return markerText === charName;
}
