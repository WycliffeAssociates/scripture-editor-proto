import {
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_HIGH,
    CUT_COMMAND,
    type LexicalEditor,
    PASTE_COMMAND,
} from "lexical";
import {
    type EditorMarkersMutableState,
    EditorMarkersMutableStates,
} from "@/app/data/editor.ts";
import {
    $isLockedUSFMTextNode,
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";

export function lockImmutableMarkersOnCut(editor: LexicalEditor) {
    return editor.registerCommand(
        CUT_COMMAND,
        (event: ClipboardEvent) => {
            const selectionInfo = $getSelectionInfo();
            if (!selectionInfo) return false;
            const { nodes, selection } = selectionInfo;
            if (selectionInfo.crossesLockedNodes) {
                // don't handle and don't stop propagation
                console.log(
                    "Prevented cut in locked USFMTextNode or node is hidden",
                );
                event.preventDefault();
                event.stopPropagation();

                // Get text from only unlocked nodes
                const unlockedNodes = nodes
                    .filter(
                        (node) =>
                            $isUSFMTextNode(node) &&
                            !$isLockedUSFMTextNode(node),
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
                editor.update(
                    () => {
                        const startEnd = selection.getStartEndPoints();
                        if (!startEnd) {
                            return;
                        }
                        const [start, end] = startEnd;

                        for (const node of unlockedNodes) {
                            const text = node.getTextContent();

                            const startOffset =
                                node === start.getNode() ? start.offset : 0;
                            const endOffset =
                                node === end.getNode()
                                    ? end.offset
                                    : text.length;

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
                    },
                    {
                        tag: [],
                    },
                );
                return true;
            }
            return false;
        },
        COMMAND_PRIORITY_HIGH,
    );
}

export function lockImmutableMarkersOnPaste(editor: LexicalEditor) {
    return editor.registerCommand(
        PASTE_COMMAND,
        (_event: ClipboardEvent) => {
            console.log("PASTE COMMAND CATCHED");
            const selectionInfo = $getSelectionInfo();
            if (!selectionInfo) return false;
            if (selectionInfo.crossesLockedNodes) {
                // don't handle and don't stop propagation
                console.log(
                    "Prevented paste in locked USFMTextNode or node is hidden",
                );
                return true;
            }
            if (!selectionInfo.isCollapsed) {
                return false;
            }

            return false;
        },
        COMMAND_PRIORITY_HIGH,
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
    // true = to stop propagation. false = cont
    // inue

    if (isNonEditingKey(event) || isKnownCommonKeyCombo(event)) {
        return false;
    }
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
        isAtEndBoundary,
        isAtStartBoundary,
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

    //   enter + collapsed + at  boundary = new line
    if (
        event.key === "Enter" &&
        isCollapsed &&
        (isAtEndBoundary || isAtStartBoundary)
    ) {
        return false;
    }

    //   if we are at offset 0 of the anchor and we press backspace and the prevNode is not locked too, just allow event
    const prevNode = anchorNode.getPreviousSibling();
    if (
        selection.anchor.offset === 0 &&
        event.key === "Backspace" &&
        prevNode &&
        !$isLockedUSFMTextNode(prevNode)
    ) {
        return false;
    }
    //   ;
    if (event.code === "Space" && isAtEndBoundary) {
        // space at the end of a locked marker is fine. It'll get trimmed on write out
        return false;
    }

    // at this point, whether destructive or additive, we have decided to ahndle it
    killEvent(event);
    if (isDestructive) {
        // with modifiers, we need to account for a bit more:
        // if crossing locked boundaries but deleting, computing all unlocked ranges and call delete on each
        editor.update(
            () => {
                // if collapsed, check for modifiers to copy normal behavior of delete to previous word boundary or line:
                if (hasModKey) {
                    // delete from current offset back to previous line boundary or locked node
                    // if (!$isUSFMTextNode(anchorNode)) return;
                    const anchorOffset = selection.anchor.offset;
                    const focusOffset = selection.focus.offset;
                    if (nodes.length === 1 && $isUSFMTextNode(anchorNode)) {
                        const furthest = Math.max(anchorOffset, focusOffset);
                        const after = anchorNode
                            .getTextContent()
                            .slice(furthest);
                        if (!$isLockedUSFMTextNode(anchorNode)) {
                            anchorNode.setTextContent(after);
                            // move the cursor to the start of the node:
                            anchorNode.selectStart();
                        }
                        // for one node selected, just take the furthest spot and clear back
                        return; //only one node to handle in collapsed;
                    } else {
                        // since wepan multiple nodes, the earliest node get cleared
                        const nodeToClear = isBackward
                            ? selection.focus.getNode()
                            : selection.anchor.getNode();
                        if (
                            $isUSFMTextNode(nodeToClear) &&
                            !$isLockedUSFMTextNode(nodeToClear)
                        ) {
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
                    .filter(
                        (node) =>
                            $isUSFMTextNode(node) && node.getMutable() === true,
                    )
                    .map((node) => node as USFMTextNode);

                if (filteredNodes.length === 0) {
                    return true;
                }
                for (const node of filteredNodes) {
                    const textContent = node.getTextContent();
                    const startOffset =
                        node === start.getNode() ? start.offset : 0;
                    const endOffset =
                        node === end.getNode()
                            ? end.offset
                            : textContent.length;
                    const before = textContent.slice(0, startOffset);
                    const after = textContent.slice(endOffset);
                    const newContent = `${before}${after}`;
                    node.setTextContent(newContent);
                    // node.selectEnd();
                }
                filteredNodes[0].selectEnd();
            },
            {
                tag: [],
            },
        );
    }
    return true;
}

function isNonEditingKey(event: KeyboardEvent): boolean {
    // if (event.altKey || event.ctrlKey) return true;
    const nonEditingKeys = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
        "Escape",
        "CapsLock",
        "Control",
        "Alt",
        "Meta",
        "Shift",
    ];
    return nonEditingKeys.includes(event.key);
}

function isKnownCommonKeyCombo(event: KeyboardEvent): boolean {
    const undoKeyCombo = event.metaKey && event.key === "z";
    const redoKeyCombo = event.metaKey && event.key === "y";
    const selectAllKeyCombo = event.metaKey && event.key === "a";
    const cut = event.metaKey && event.key === "x";
    const copy = event.metaKey && event.key === "c";
    const paste = event.metaKey && event.key === "v";
    return (
        undoKeyCombo ||
        redoKeyCombo ||
        selectAllKeyCombo ||
        cut ||
        copy ||
        paste
    );
}

export function $getSelectionInfo() {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return false;
    const nodes = selection.getNodes();
    const crossesLockedNodes = nodes.some((node) =>
        $isLockedUSFMTextNode(node),
    );
    const anchorOffset = selection.anchor.offset;
    const anchorNode = selection.anchor.getNode();
    const textLength = anchorNode.getTextContentSize();
    const isAtEndBoundary = anchorOffset === textLength;
    const isAtStartBoundary = anchorOffset === 0;
    return {
        selection,
        crossesLockedNodes,
        nodes,
        isCollapsed: selection.isCollapsed(),
        anchorNode,
        anchorOffset,
        textLength,
        focusNode: selection.focus.getNode(),
        focusOffset: selection.focus.offset,
        isBackward: selection.isBackward(),
        isAtEndBoundary,
        isAtStartBoundary,
    };
}

function killEvent(event: Event) {
    event.preventDefault();
    event.stopPropagation();
}
