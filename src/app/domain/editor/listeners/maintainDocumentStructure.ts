import { $dfsIterator, type DFSNode } from "@lexical/utils";
import {
  $getRoot,
  $isLineBreakNode,
  type EditorState,
  type LexicalEditor,
} from "lexical";

import {
  EDITOR_TAGS_USED,
  type UsfmTokenType,
  UsfmTokenTypes,
} from "@/app/data/editor.ts";
import type { Settings } from "@/app/data/settings.ts";
import { $isUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
  $isUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { markerTrimNoSlash } from "@/core/domain/usfm/lex.ts";
import { ALL_CHAR_MARKERS } from "@/core/domain/usfm/onionMarkers.ts";

export type DocStructureFxnArgs = {
  node: USFMTextNode;
  tokenType: UsfmTokenType;
  appSettings: Settings;
  updates: Array<{
    dbgLabel: string;
    dbgDetail?: string;
    run: () => void;
  }>;
};
export type MainDocumentStrutureFxn = (args: DocStructureFxnArgs) => void;

/**
 * Residual repair sweep for hidden CHARACTER markers only.
 *
 * The chapter/verse repair family (split/malformed/orphan-number/
 * reparenting/ensure-adjacency) is gone: marker bytes for the numbered
 * family live in USFMNumberedMarkerNode state, so those failure states are
 * unrepresentable rather than repaired (lint surfaces the representable bad
 * states). What remains is the one repair for char markers (\add, \nd, …),
 * whose open/close bytes are still hidden editable text nodes — it dies
 * with the char-element node (plan §5.5).
 */
export function maintainDocumentStructure(
  editorState: EditorState,
  editor: LexicalEditor,
  appSettings: Settings,
) {
  const allNodes = editorState.read(() => [...$dfsIterator()]);

  for (const dfsNode of allNodes) {
    const nodeUpdates: Array<{
      dbgLabel: string;
      run: () => void;
    }> = [];

    editorState.read(() => {
      const node = dfsNode.node;
      if (!$isUSFMTextNode(node) || !node.isAttached()) return;
      editCharOpenAndCloseTogether({
        node,
        tokenType: node.getTokenType(),
        appSettings,
        updates: nodeUpdates,
      });
    });

    if (nodeUpdates.length) {
      editor.update(
        () => {
          nodeUpdates.forEach((u) => {
            u.run();
          });
        },
        {
          tag: [
            EDITOR_TAGS_USED.historyMerge,
            EDITOR_TAGS_USED.programmaticStructuralFix,
          ],
        },
      );
    }
  }
}

/**
 * Ensures Regular mode root children are all USFMParagraphNode containers.
 * Stray nodes at root level are wrapped into a default paragraph container.
 */
/* function enforceRegularModeParagraphStructure(editor: LexicalEditor): void {
    editor.update(
        () => {
            const root = $getRoot();
            const children = root.getChildren();
            const strayRun: LexicalNode[] = [];

            const ensureParagraphHasEditableFallback = (
                para: USFMParagraphNode,
            ) => {
                const hasAnyTextNode = para.getChildren().some($isUSFMTextNode);
                if (hasAnyTextNode) return;
                const placeholder = $createUSFMTextNode(" ", {
                    id: guidGenerator(),
                    tokenType: UsfmTokenTypes.text,
                });
                para.append(placeholder);
            };

            const flushStrayRunBefore = (anchor: LexicalNode | null) => {
                if (strayRun.length === 0) return;
                const para = $createUSFMParagraphNode({
                    id: guidGenerator(),
                    marker: "p",
                });

                if (anchor) {
                    anchor.insertBefore(para);
                } else {
                    root.append(para);
                }

                for (const stray of strayRun) {
                    para.append(stray);
                }
                strayRun.length = 0;
                ensureParagraphHasEditableFallback(para);
            };

            for (const child of children) {
                if ($isUSFMParagraphNode(child)) {
                    flushStrayRunBefore(child);
                    ensureParagraphHasEditableFallback(child);
                    continue;
                }

                if ($isElementNode(child) && child.getType() === "paragraph") {
                    // Only treat Lexical built-in paragraph nodes as legacy wrappers.
                    // Each wrapper becomes its own USFMParagraphNode (no cross-wrapper merges).
                    flushStrayRunBefore(child);

                    const wrapperChildren = child.getChildren();
                    if (
                        wrapperChildren.length === 1 &&
                        $isUSFMParagraphNode(wrapperChildren[0])
                    ) {
                        // Legacy shape: root -> paragraph -> usfm-paragraph-node
                        // Hoist the existing paragraph container without unwrapping anything else.
                        child.insertBefore(wrapperChildren[0]);
                        child.remove();
                        ensureParagraphHasEditableFallback(
                            wrapperChildren[0] as USFMParagraphNode,
                        );
                        continue;
                    }

                    const para = $createUSFMParagraphNode({
                        id: guidGenerator(),
                        marker: "p",
                    });
                    child.insertBefore(para);
                    for (const wrapperChild of wrapperChildren) {
                        para.append(wrapperChild);
                    }
                    child.remove();
                    ensureParagraphHasEditableFallback(para);
                    continue;
                }

                // Do not unwrap arbitrary root element nodes; preserve them as-is.
                // If they are at root, wrap the entire node into a default paragraph container.
                strayRun.push(child);
            }

            // Handle remaining stray nodes at the end
            flushStrayRunBefore(null);

            // Ensure root has at least one paragraph
            if (root.getChildrenSize() === 0) {
                const defaultParagraph = $createUSFMParagraphNode({
                    id: guidGenerator(),
                    marker: "p",
                });
                const placeholder = $createUSFMTextNode(" ", {
                    id: guidGenerator(),
                    tokenType: UsfmTokenTypes.text,
                });
                defaultParagraph.append(placeholder);
                root.append(defaultParagraph);
            }
        },
        {
            tag: [EDITOR_TAGS_USED.historyMerge],
        },
    );
} */

/**
 * Debounced wrapper for the broader structure-maintenance sweep.
 *
 * Some repairs are valuable but too expensive or disruptive to run on every
 * keystroke. This version is used where we want the document to settle back
 * into shape shortly after editing without fighting copy/paste or rapid input.
 */
export function maintainDocumentStructureDebounced(
  editorState: EditorState,
  editor: LexicalEditor,
  appSettings: Settings,
) {
  const updates: Array<{
    dbgLabel: string;
    run: () => void;
  }> = [];

  editorState.read(() => {
    const allNodes = [...$dfsIterator()];
    mergeAdjacentTextNodesOfSameType({
      allNodes,
      updates,
      appSettings,
    });
    // pushTrailingHorizontalWhitespaceToNextSibling({
    //     allNodes,
    //     updates,
    //     appSettings,
    // });
    // ensureSiblingsHaveAtLeastOneSpace({
    //     allNodes,
    //     updates,
    //     appSettings,
    // });
  });

  if (updates.length) {
    editor.update(
      () => {
        updates.forEach((u) => {
          u.run();
        });
      },
      {
        tag: [
          EDITOR_TAGS_USED.historyMerge,
          //   EDITOR_TAGS_USED.programaticIgnore,
        ],
      },
    );
  }
  // console.timeEnd("maintainDocumentStructure");
}

type DebouncedStructuralUpdatesArgs = {
  allNodes: Array<DFSNode>;
  appSettings: Settings;
  updates: Array<{
    dbgLabel: string;
    dbgDetail?: string;
    run: () => void;
  }>;
};

// for lint which depends on tokens, it's actually needed to merge things are logically same type same sid together.
const mergeAdjacentTextNodesOfSameType = ({
  allNodes,
  updates,
}: DebouncedStructuralUpdatesArgs) => {
  const tokenTypesToMerge: Array<string> = [
    UsfmTokenTypes.text,
    UsfmTokenTypes.error,
  ];

  const allTextNodes: Array<USFMTextNode> = [];
  for (const dfsNode of allNodes) {
    const n = dfsNode.node;
    if ($isUSFMTextNode(n) && tokenTypesToMerge.includes(n.getTokenType())) {
      allTextNodes.push(n);
    }
  }
  // Group consecutive nodes with same sid + tokenType
  const groups: USFMTextNode[][] = [];
  let currentGroup: USFMTextNode[] = [];

  for (let i = 0; i < allTextNodes.length; i++) {
    const node = allTextNodes[i];
    const prev = allTextNodes[i - 1];

    const shouldMergeWithPrev =
      i > 0 &&
      prev.getNextSibling() === node && // consecutive in the tree
      prev.getSid() === node.getSid() &&
      prev.getTokenType() === node.getTokenType();

    if (shouldMergeWithPrev) {
      currentGroup.push(node);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [node];
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Now reduce each group down to one node
  for (const group of groups) {
    if (group.length <= 1) continue;
    const [first, ...rest] = group;
    updates.push({
      dbgLabel: "mergeAdjacentTextNodesOfSameTypeBatch",
      run: () => {
        const mergedText = group.map((n) => n.getTextContent()).join("");
        first.setTextContent(mergedText);
        rest.forEach((n) => {
          n.remove();
        });
      },
    });
  }
};

const editCharOpenAndCloseTogether: MainDocumentStrutureFxn = ({
  node,
  tokenType,
  updates,
}) => {
  const isMarker = tokenType === UsfmTokenTypes.marker;
  const marker = node.getMarker();
  if (!isMarker || !marker) return;
  const isChar = ALL_CHAR_MARKERS.has(marker);
  if (!isChar) return;
  const lastNodeInEditor = $getRoot().getLastChild();
  if (!lastNodeInEditor) return;

  // look forward until we find a closeMarker, or a para el, line break, or next footnote marker:  The last 3 cases are the hard stops for a char:
  let matchedEnd: USFMTextNode | null = null;
  for (const nextNode of $dfsIterator(node, lastNodeInEditor)) {
    // check break conditions:
    const next = nextNode.node;
    if ($isLineBreakNode(next)) break;
    if ($isUSFMNestedEditorNode(next)) break;

    if (!$isUSFMTextNode(next)) continue;
    const isEndMarker = next.getTokenType() === UsfmTokenTypes.endMarker;
    if (isEndMarker) {
      const endMarker = next.getMarker();
      if (!endMarker) continue;
      if (endMarker !== marker) continue;
      matchedEnd = next;
      break;
    }
  }
  if (matchedEnd) {
    const endMatchingTxt = `${node.getTextContent().trim()}*`;
    if (matchedEnd.getTextContent().trim() !== endMatchingTxt) {
      updates.push({
        dbgLabel: "editCharOpenAndCloseTogether",
        run: () => {
          // set the marker of both nodes:
          const newMarker = markerTrimNoSlash(node.getTextContent());
          if (ALL_CHAR_MARKERS.has(newMarker)) {
            node.setMarker(newMarker);
            matchedEnd.setMarker(newMarker);
          }
          matchedEnd.setTextContent(endMatchingTxt);
        },
      });
    }
  }
};
