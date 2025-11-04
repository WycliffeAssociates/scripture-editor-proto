import {$dfsIterator} from "@lexical/utils";
import {$getRoot, $isLineBreakNode, type LexicalEditor} from "lexical";
import {EDITOR_TAGS_USED, UsfmTokenTypes} from "@/app/data/editor";
import {$isUSFMNestedEditorNode} from "@/app/domain/editor/nodes/USFMNestedEditorNode";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  $isVerseRangeTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode";
import {ALL_CHAR_MARKERS, CHAPTER_VERSE_MARKERS} from "@/core/data/usfm/tokens";
import {guidGenerator} from "@/core/data/utils/generic";
import {markerRegex, markerTrimNoSlash} from "@/core/domain/usfm/lex";

export type MainDocumentStrutureFxn = (args: {
  node: USFMTextNode;
  tokenType: string;
  updates: Array<{dbgLabel: string; update: () => void}>;
}) => void;

// only works on 1 main editor
// This function is concnered with making sure the eidtor doesn't get into weird states where you can add text between a marker or after averse number cause you deleted it all. It also keeps the document flat by merging adjacent text nodes of the same type.
export function maintainDocumentStructure(
  // editorState: EditorState,
  // editor: LexicalEditor
  node: USFMTextNode,
  editor: LexicalEditor
) {
  const updates: Array<{
    dbgLabel: string;
    update: () => void;
  }> = [];
  // console.time("maintainDocumentStructure");
  // editorState.read(() => {
  //   const root = $getRoot();
  //   root.getAllTextNodes().forEach((node) => {
  //     if (!$isUSFMTextNode(node)) return;
  const tokenType = node.getTokenType();
  const args = {
    node,
    tokenType,
    updates,
  };
  mergeAdjacentTextNodesOfSameType(args);
  editCharOpenAndCloseTogether(args);
  ensureNumberRangeAlwaysFollowsMarkerExpectingNum(args);
  ensurePlainTextNodeAlwaysFollowsNumberRange(args);
  ensureCharOpensHaveEditableNextSibling(args);
  ensureCharCloseHasEditableNextSibling(args);
  trySplitOutMarkersFromKnownErrorTokens(args);
  ensureNodesSandwichedBetweenSameSidHasThatSid(args);
  removeEmptyNumberRangeNotPrecededByMarker(args);
  // });
  // });
  if (updates.length) {
    console.log(`maintain documnet structure updates ${updates.length}`);
    editor.update(() => {
      updates.forEach(
        (update) => {
          update.update();
        },
        {
          tag: [
            EDITOR_TAGS_USED.historyMerge,
            EDITOR_TAGS_USED.programaticIgnore,
          ],
          skipTransforms: true,
        }
      );
    });
  }
  // console.timeEnd("maintainDocumentStructure");
}

const ensureCharOpensHaveEditableNextSibling: MainDocumentStrutureFxn = ({
  node,
  tokenType,
  updates,
}) => {
  const isMarker = tokenType === UsfmTokenTypes.marker;
  const marker = node.getMarker();
  if (!isMarker || !marker) return;
  const isChar = ALL_CHAR_MARKERS.has(marker);
  if (!isChar) return;
  const nextSibling = node.getNextSibling();
  // as long as the nest sib
  const editableTypes: Array<string> = [
    UsfmTokenTypes.text,
    UsfmTokenTypes.numberRange,
  ];
  if (
    $isUSFMTextNode(nextSibling) &&
    editableTypes.includes(nextSibling.getTokenType())
  ) {
    return;
  }
  const update = () => {
    const emptySibling = $createUSFMTextNode(" ", {
      id: guidGenerator(),
      sid: node.getSid().trim(),
      inPara: node.getInPara(),
      tokenType: UsfmTokenTypes.text,
    });
    node.insertAfter(emptySibling);
  };
  updates.push({
    dbgLabel: "ensureCharOpensHaveEditableNextSibling",
    update,
  });
};
const ensureCharCloseHasEditableNextSibling: MainDocumentStrutureFxn = ({
  node,
  tokenType,
  updates,
}) => {
  const isCharClose = tokenType === UsfmTokenTypes.endMarker;
  if (!isCharClose) return;
  const nextSibling = node.getNextSibling();
  // as long as the nest sib
  const acceptableNextSibling: Array<string> = [UsfmTokenTypes.text];
  if (
    ($isUSFMTextNode(nextSibling) &&
      acceptableNextSibling.includes(nextSibling.getTokenType())) ||
    $isLineBreakNode(nextSibling)
  ) {
    return;
  }
  const update = () => {
    const emptySibling = $createUSFMTextNode(" ", {
      id: guidGenerator(),
      sid: node.getSid().trim(),
      inPara: node.getInPara(),
      tokenType: UsfmTokenTypes.text,
    });
    node.insertAfter(emptySibling);
  };
  updates.push({
    dbgLabel: "ensureCharCloseHasEditableNextSibling",
    update,
  });
};

const removeEmptyNumberRangeNotPrecededByMarker: MainDocumentStrutureFxn = ({
  node,
  tokenType,
  updates,
}) => {
  const isMarker = tokenType === UsfmTokenTypes.marker;
  if (!isMarker) return;
  const marker = node.getMarker();
  if (!marker) return;
  if (!CHAPTER_VERSE_MARKERS.has(marker)) return;
  const nextSibling = node.getNextSibling();
  if (!$isUSFMTextNode(nextSibling)) return;
  const nextSiblingToken = nextSibling.getTokenType();
  if (nextSiblingToken !== UsfmTokenTypes.numberRange) return;

  if (!nextSibling.getTextContent().trim().length) {
    const update = () => {
      nextSibling.remove();
    };
    updates.push({
      dbgLabel: "removeEmptyNumberRangeNotPrecededByMarker",
      update,
    });
  }
};

const ensureNumberRangeAlwaysFollowsMarkerExpectingNum: MainDocumentStrutureFxn =
  ({node, tokenType, updates}) => {
    const nextSibling = node.getNextSibling();
    if (!$isUSFMTextNode(nextSibling)) return;

    const isMarker = tokenType === UsfmTokenTypes.marker;
    if (!isMarker) return;
    const marker = node.getMarker();
    if (!marker) return;
    if (!CHAPTER_VERSE_MARKERS.has(marker)) return;
    const nextSiblingToken = nextSibling.getTokenType();
    if (nextSiblingToken === UsfmTokenTypes.numberRange) return;
    const update = () => {
      const emptySibling = $createUSFMTextNode(" ", {
        id: guidGenerator(),
        sid: node.getSid().trim(),
        inPara: node.getInPara(),
        tokenType: UsfmTokenTypes.numberRange,
      });
      node.insertAfter(emptySibling);
    };
    updates.push({
      dbgLabel: "ensureNumberRangeAlwaysFollowsMarkerExpectingNum",
      update,
    });
  };
const ensurePlainTextNodeAlwaysFollowsNumberRange: MainDocumentStrutureFxn = ({
  node,
  updates,
}) => {
  if (!$isVerseRangeTextNode(node)) return;
  const next = node.getNextSibling();
  if (
    !next ||
    !$isUSFMTextNode(next) ||
    next.getTokenType() !== UsfmTokenTypes.text
  ) {
    updates.push({
      dbgLabel: "ensurePlainTextNodeAlwaysFollowsNumberRange",
      update: () => {
        const emptySibling = $createUSFMTextNode(" ", {
          id: guidGenerator(),
          sid: node.getSid().trim(),
          inPara: node.getInPara(),
          tokenType: UsfmTokenTypes.text,
        });
        node.insertAfter(emptySibling);
      },
    });
  }
  if (next && $isUSFMTextNode(next) && !next.getTextContent().length) {
    updates.push({
      dbgLabel: "ensurePlainTextNodeAlwaysFollowsNumberRange",
      update: () => {
        next.setTextContent(" ");
      },
    });
  }
};
const ensureNodesSandwichedBetweenSameSidHasThatSid: MainDocumentStrutureFxn =
  ({node, tokenType, updates}) => {
    if (!$isUSFMTextNode(node)) return;
    const prevNode = node.getPreviousSibling();
    const nextNode = node.getNextSibling();
    if (!$isUSFMTextNode(prevNode) || !$isUSFMTextNode(nextNode)) return;
    const prevSid = prevNode.getSid();
    const nextSid = nextNode.getSid();
    const thisSid = node.getSid();
    if (prevSid !== nextSid) return;
    if (prevSid === thisSid) return;
    const update = () => {
      node.setSid(prevSid);
    };
    updates.push({
      dbgLabel: "ensureNodesSandwichedBetweenSameSidHasThatSid",
      update,
    });
  };

const trySplitOutMarkersFromKnownErrorTokens: MainDocumentStrutureFxn = ({
  node,
  tokenType,
  updates,
}) => {
  if (tokenType !== UsfmTokenTypes.error) return;
  const textContent = node.getTextContent();
  //   if the textContent matches a markerRegex at start, we should split it there into a marker + text:
  const match = textContent.match(markerRegex);
  if (match) {
    // call node.splitText(match.index)
    updates.push({
      dbgLabel: "trySplitOutMarkersFromKnownErrorTokens",
      update: () => {
        const [left, right] = node.splitText(match[0].length);
        if ($isUSFMTextNode(left)) {
          left.setTokenType(UsfmTokenTypes.marker);
          left.setMarker(markerTrimNoSlash(match[0]));
        }
        if ($isUSFMTextNode(right)) {
          right.setTokenType(UsfmTokenTypes.text);
        }
      },
    });
  }
};

const mergeAdjacentTextNodesOfSameType: MainDocumentStrutureFxn = ({
  node,
  updates,
}) => {
  const next = node.getNextSibling();
  if (!next) return;
  const tokenTypesToMerge: string[] = [
    UsfmTokenTypes.text,
    UsfmTokenTypes.error,
  ];
  if (
    $isUSFMTextNode(next) &&
    next.getSid() === node.getSid() &&
    tokenTypesToMerge.includes(next.getTokenType()) &&
    tokenTypesToMerge.includes(node.getTokenType())
  ) {
    updates.push({
      dbgLabel: "mergeAdjacentTextNodesOfSameType",
      update: () => {
        node.setTextContent(node.getTextContent() + next.getTextContent());
        next.remove();
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
        update: () => {
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

// todo: we should register a mutation listener to remove empty number ranges if the marker is also deleted
// https://lexical.dev/docs/concepts/listeners#registermutationlistener
