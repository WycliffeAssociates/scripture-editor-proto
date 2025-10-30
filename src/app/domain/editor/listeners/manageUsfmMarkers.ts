import {$reverseDfsIterator} from "@lexical/utils";
import {
  $createLineBreakNode,
  $getRoot,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import {
  type EditorMarkersMutableState,
  EditorMarkersMutableStates,
  type EditorMarkersViewState,
  EditorMarkersViewStates,
  type EditorMode,
  EditorModes,
  UsfmTokenTypes,
} from "@/app/data/editor";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  type USFMTextNode,
  type USFMTextNodeMetadata,
} from "@/app/domain/editor/nodes/USFMTextNode";
import {type ParsedReference, parseSid} from "@/core/data/bible/bible";
import {
  ALL_USFM_MARKERS,
  VALID_CHAR_MARKERS,
  VALID_NOTE_MARKERS,
  VALID_PARA_MARKERS,
} from "@/core/data/usfm/tokens";
import {guidGenerator} from "@/core/data/utils/generic";

const markerTokenMatchLineStartOptTrailingSpace = /^\\([\w\d]+-?\w*)\s*/;
const markerTokenMatchLineStartSpaceReq = /^\\([\w\d]+-?\w*)\s+$/;
const markerTokenMatchLineMid = /\s+\\([\w\d]+-?\w*)\s/;
// opt whitespace, 1+ digits, (opt hyphen, 1+ digits), opt whitespace
// const _verseRangeValidRegex = /^\s*\d+(-\d+)?\s*$/;

type TextNodeTransformParams = {
  node: USFMTextNode;
  editor: LexicalEditor;
  editorMode: EditorMode;
  markersMutableState: EditorMarkersMutableState;
  markersViewState: EditorMarkersViewState;
};
export function textNodeTransform({
  node,
  editorMode,
  markersMutableState,
  markersViewState,
}: TextNodeTransformParams) {
  // noop in src mode
  if (editorMode === EditorModes.SOURCE) return;
  const text = node.getTextContent();
  const tokenType = node.getTokenType();
  if (tokenType !== UsfmTokenTypes.text) return;
  const markerMatch = text.match(markerTokenMatchLineStartSpaceReq); // example: \v , \c , \q
  const inMidMatch = text.match(markerTokenMatchLineMid);
  if (!markerMatch && !inMidMatch) return;
  const marker = markerMatch?.[1] || inMidMatch?.[1];
  if (!marker) return;
  const isValidMarker = ALL_USFM_MARKERS.has(marker);
  const isStartOfLine = markerMatch !== null;
  if (!isValidMarker) return;

  const insertType = mapMarkerToInsertionType(marker);
  const baseArgs: BaseInsertArgs = {
    anchorNode: node,
    marker,
    isStartOfLine,
    markersMutableState,
    markersViewState,
  };

  // todo: markers can basically be of type
  /* 
    simple: marker + space
    withNumberRange: marker + space + numberRange
    char + with open + close
    noteChar -> usually uses implicit closure

    there are rules for others as well, i.e. a para marker shouldn't be inline; Can start a line, but must be preceeded by a newline, so for those, if in middle, we split text + insert nl + para marker + rest of split text? 
    */
  switch (insertType) {
    case InsertionTypes.verse:
      return $insertVerse(baseArgs);
    case InsertionTypes.chapter:
      return $insertChapter(baseArgs);
    case InsertionTypes.para:
      return $insertPara(baseArgs);
    case InsertionTypes.char:
      return $insertChar(baseArgs);
    case InsertionTypes.note:
      return $insertNote(baseArgs);
  }
}

// type HandleVerseInsert = {
//   anchorNode: USFMTextNode;
//   marker: string;
//   isStartOfLine: boolean;
//   markersMutableState: EditorMarkersMutableState;
//   markersViewState: EditorMarkersViewState;
// };
// function _$handleVerseInsert({
//   anchorNode,
//   marker,
//   isStartOfLine,
//   markersMutableState,
//   markersViewState,
// }: HandleVerseInsert) {
//   // --- 1. Get context ---
//   const {nearestParaMarker, prevSidInfo} =
//     findContextForVerseInsert(anchorNode);

//   // --- 2. Compute new SID ---
//   const prevVerseEnd = prevSidInfo?.verseEnd ?? 1;
//   const newSid = `${prevSidInfo?.book} ${prevSidInfo?.chapter}:${
//     prevVerseEnd + 1
//   }`;

//   // --- 3. Create new nodes ---
//   const markerNode = $createUSFMTextNode(`\\${marker}`, {
//     id: guidGenerator(),
//     inPara: nearestParaMarker ?? "",
//     tokenType: UsfmTokenTypes.marker,
//     marker,
//     sid: newSid,
//     isMutable: markersMutableState === EditorMarkersMutableStates.MUTABLE,
//     show:
//       markersViewState === EditorMarkersViewStates.ALWAYS ||
//       markersViewState === EditorMarkersViewStates.WHEN_EDITING,
//   });

//   const verseRangeNode = $createUSFMTextNode(` ${prevVerseEnd + 1}`, {
//     id: guidGenerator(),
//     inPara: nearestParaMarker ?? "",
//     tokenType: UsfmTokenTypes.numberRange,
//     sid: newSid,
//     isMutable: markersMutableState === EditorMarkersMutableStates.MUTABLE,
//   });

//   const blankTextNode = $createUSFMTextNode(" ", {
//     id: guidGenerator(),
//     inPara: nearestParaMarker ?? "",
//     tokenType: UsfmTokenTypes.text,
//     sid: newSid,
//   });

//   // --- 4. Determine split or replacement ---
//   const selection = $getSelection();
//   const offset = $isRangeSelection(selection)
//     ? selection.anchor.offset
//     : anchorNode.getTextContentSize();
//   if (!isStartOfLine) {
//     const [left, right] = anchorNode.splitText(offset);
//     // take out the marker but leave the trailing space
//     const woMarker = `${left
//       .getTextContent()
//       .trimEnd()
//       .slice(0, -markerNode.getTextContentSize())} `;
//     left?.setTextContent(woMarker);
//     if ($isUSFMTextNode(right)) right.setSid(newSid);
//     left.insertAfter(markerNode);
//     markerNode.insertAfter(verseRangeNode);
//     // todo: extract the unicode constant here to named reusable const
//     right?.setTextContent(`\u00A0${right.getTextContent()}`);
//     right?.selectStart();
//     if (!selection || !$isRangeSelection(selection)) return;
//     if (!right) {
//       verseRangeNode.selectEnd();
//     }
//   } else {
//     const sibling = anchorNode.getNextSibling();
//     anchorNode.replace(markerNode);
//     const alreadyHasVerseRangeSibling =
//       sibling &&
//       $isUSFMTextNode(sibling) &&
//       sibling.getTokenType() === UsfmTokenTypes.numberRange;
//     if (!alreadyHasVerseRangeSibling) {
//       markerNode.insertAfter(verseRangeNode);
//       verseRangeNode.insertAfter(blankTextNode);
//       blankTextNode.select();
//     } else {
//       sibling?.selectStart();
//     }
//   }
// }

function $insertVerse(args: BaseInsertArgs): void {
  const {anchorNode, marker, isStartOfLine, markersMutableState} = args;

  const context = $getInsertionContext(anchorNode);
  const prevVerseEnd = context.prevSidInfo?.verseEnd ?? 1;

  // Create nodes
  const markerNode = $createMarkerNode({
    marker,
    context,
    args,
    tokenType: UsfmTokenTypes.marker,
    sid: context.newSid,
  });
  const verseRangeNode = $createContextTextNode({
    text: ` ${prevVerseEnd + 1}`,
    context,
    tokenType: UsfmTokenTypes.numberRange,
    extraProps: {
      isMutable: markersMutableState === EditorMarkersMutableStates.MUTABLE,
    },
  });
  const blankTextNode = $createContextTextNode({
    text: " ",
    context,
    tokenType: UsfmTokenTypes.text,
  });

  const selection = $getSelection();
  const offset = $isRangeSelection(selection)
    ? selection.anchor.offset
    : anchorNode.getTextContentSize();

  if (!isStartOfLine) {
    // Mid-line insertion
    const [left, right] = anchorNode.splitText(offset);
    const woMarker = `${left
      .getTextContent()
      .trimEnd()
      .slice(0, -markerNode.getTextContentSize())} `;
    left?.setTextContent(woMarker);

    if ($isUSFMTextNode(right)) right.setSid(context.newSid);

    left.insertAfter(markerNode);
    markerNode.insertAfter(verseRangeNode);
    right?.setTextContent(`\u00A0${right.getTextContent()}`);

    if (!selection || !$isRangeSelection(selection)) return;
    if (!right) {
      verseRangeNode.selectEnd();
    } else {
      right.selectStart();
    }
  } else {
    // Start of line insertion
    const sibling = anchorNode.getNextSibling();
    anchorNode.replace(markerNode);

    const alreadyHasVerseRangeSibling =
      sibling &&
      $isUSFMTextNode(sibling) &&
      sibling.getTokenType() === UsfmTokenTypes.numberRange;

    if (!alreadyHasVerseRangeSibling) {
      markerNode.insertAfter(verseRangeNode);
      verseRangeNode.insertAfter(blankTextNode);
      blankTextNode.select();
    } else {
      sibling?.selectStart();
    }
  }
}

// ============================================================================
// Chapter Insertion
// ============================================================================
// todo: we actually shouldn't allow inserting chapters since we break on as a ux division of edit per chapter
function $insertChapter(args: BaseInsertArgs): void {
  const {anchorNode, marker, isStartOfLine, markersMutableState} = args;

  const context = $getInsertionContext(anchorNode);
  const nextChapter = (context.prevSidInfo?.chapter ?? 0) + 1;

  // Create nodes
  const markerNode = $createMarkerNode({
    marker,
    context,
    args,
    tokenType: UsfmTokenTypes.marker,
    sid: context.currentSidAsString,
  });
  const chapterRangeNode = $createContextTextNode({
    text: ` ${nextChapter}`,
    context,
    tokenType: UsfmTokenTypes.numberRange,
    extraProps: {
      isMutable: markersMutableState === EditorMarkersMutableStates.MUTABLE,
    },
  });
  const blankTextNode = $createContextTextNode({
    text: " ",
    context,
    tokenType: UsfmTokenTypes.text,
  });

  if (!isStartOfLine) {
    // Chapter must be at start of line - split and insert linebreak
    const selection = $getSelection();
    const offset = $isRangeSelection(selection)
      ? selection.anchor.offset
      : anchorNode.getTextContentSize();

    const [left, right] = anchorNode.splitText(offset);
    const woMarker = left
      .getTextContent()
      .trimEnd()
      .slice(0, -markerNode.getTextContentSize());
    left?.setTextContent(woMarker);

    // Insert linebreak
    const lineBreakNode = $createLineBreakNode();
    left.insertAfter(lineBreakNode);
    lineBreakNode.insertAfter(markerNode);

    if ($isUSFMTextNode(right)) right.setSid(context.newSid);
  } else {
    // Ensure linebreak before
    $ensureLineBreakBefore(anchorNode);
    anchorNode.replace(markerNode);
  }

  // Always add chapter number and blank text
  markerNode.insertAfter(chapterRangeNode);
  chapterRangeNode.insertAfter(blankTextNode);
  blankTextNode.select();
}

// ============================================================================
// Para Insertion
// ============================================================================

function $insertPara(args: BaseInsertArgs): void {
  const {anchorNode, marker, isStartOfLine} = args;

  const context = $getInsertionContext(anchorNode);
  const markerNode = $createMarkerNode({
    marker,
    context,
    args,
    tokenType: UsfmTokenTypes.marker,
    sid: context.currentSidAsString,
  });

  if (!isStartOfLine) {
    // Para should be at start of line - split and insert linebreak
    const selection = $getSelection();
    const offset = $isRangeSelection(selection)
      ? selection.anchor.offset
      : anchorNode.getTextContentSize();

    const [left, right] = anchorNode.splitText(offset);
    const woMarker = left
      .getTextContent()
      .trimEnd()
      .slice(0, -markerNode.getTextContentSize());
    left?.setTextContent(woMarker);

    const lineBreakNode = $createLineBreakNode();
    left.insertAfter(lineBreakNode);
    lineBreakNode.insertAfter(markerNode);

    if ($isUSFMTextNode(right)) {
      right.setSid(context.newSid);
      right.selectStart();
    } else {
      // No sibling - create empty text node
      const blankTextNode = $createContextTextNode({
        text: " ",
        context,
        tokenType: UsfmTokenTypes.text,
        extraProps: {inPara: marker},
      });
      markerNode.insertAfter(blankTextNode);
      blankTextNode.select();
    }
  } else {
    $ensureLineBreakBefore(anchorNode);
    const nextSibling = anchorNode.getNextSibling();
    anchorNode.replace(markerNode);

    if (nextSibling && $isUSFMTextNode(nextSibling)) {
      nextSibling.selectStart();
    } else {
      // No suitable sibling - create empty text node
      const blankTextNode = $createContextTextNode({
        text: " ",
        context,
        tokenType: UsfmTokenTypes.text,
        extraProps: {inPara: marker},
      });
      markerNode.insertAfter(blankTextNode);
      blankTextNode.select();
    }
  }
}

// ============================================================================
// Char Insertion (wraps selection)
// ============================================================================

// todo: buggy / inf loop. fix
function $insertChar(args: BaseInsertArgs): void {
  const {anchorNode, marker, isStartOfLine} = args;

  const context = $getInsertionContext(anchorNode);
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return;
  const common = {
    marker,
    context,
    args,
    tokenType: UsfmTokenTypes.marker,
    inCharMarkers: [marker],
    sid: context.currentSidAsString,
  };
  const openingMarker = $createMarkerNode(common);
  const closingMarker = $createMarkerNode({
    ...common,
    marker: `${marker}`,
    tokenType: UsfmTokenTypes.endMarker,
  });

  if (selection.isCollapsed()) {
    // No selection - insert empty char markers with space between
    const emptyTextNode = $createContextTextNode({
      text: " ",
      context,
      tokenType: UsfmTokenTypes.text,
      extraProps: {inChars: [marker]},
    });

    const offset = selection.anchor.offset;

    if (!isStartOfLine) {
      // Mid-line: remove marker from text, split, and insert
      const [left, right] = anchorNode.splitText(offset);
      const woMarker = `${left
        .getTextContent()
        .trimEnd()
        .slice(0, -openingMarker.getTextContentSize())} `;
      left?.setTextContent(woMarker);

      if ($isUSFMTextNode(right)) right.setSid(context.newSid);

      left.insertAfter(openingMarker);
      openingMarker.insertAfter(emptyTextNode);
      emptyTextNode.insertAfter(closingMarker);

      right?.setTextContent(`\u00A0${right.getTextContent()}`);
      emptyTextNode.select();
    } else {
      // Start of line: replace anchor node
      const sibling = anchorNode.getNextSibling();
      anchorNode.replace(openingMarker);

      openingMarker.insertAfter(emptyTextNode);
      emptyTextNode.insertAfter(closingMarker);

      if (sibling && $isUSFMTextNode(sibling)) {
        sibling.setSid(context.newSid);
      }

      emptyTextNode.select();
    }
  } else {
    // Wrap selection
    const {anchor, focus} = selection;
    const isBackward = selection.isBackward();

    const startOffset = isBackward ? focus.offset : anchor.offset;
    const endOffset = isBackward ? anchor.offset : focus.offset;

    // First, remove the marker text from the beginning
    const textContent = anchorNode.getTextContent();
    const markerPattern = new RegExp(`\\\\${marker}\\s*`);
    const markerMatch = textContent.match(markerPattern);

    if (markerMatch && markerMatch.index !== undefined) {
      const markerLength = markerMatch[0].length;
      const cleanedText =
        textContent.slice(0, markerMatch.index) +
        textContent.slice(markerMatch.index + markerLength);
      anchorNode.setTextContent(cleanedText);

      // Adjust offsets since we removed the marker
      const adjustedStart =
        startOffset > markerMatch.index
          ? Math.max(markerMatch.index, startOffset - markerLength)
          : startOffset;
      const adjustedEnd =
        endOffset > markerMatch.index
          ? Math.max(markerMatch.index, endOffset - markerLength)
          : endOffset;

      // Split at adjusted selection boundaries
      const [before, middle] = anchorNode.splitText(adjustedStart);
      const [selected, after] = (middle || before).splitText(
        adjustedEnd - adjustedStart
      );

      // Insert markers around selection
      selected.insertBefore(openingMarker);
      selected.insertAfter(closingMarker);

      // Update SIDs
      if ($isUSFMTextNode(selected)) selected.setSid(context.newSid);
      if ($isUSFMTextNode(after)) after.setSid(context.newSid);

      // Restore selection
      selected.select();
    }
  }
}

// ============================================================================
// Note Insertion (placeholder - similar to char)
// ============================================================================

function $insertNote(args: BaseInsertArgs): void {
  const {anchorNode, marker} = args;

  const context = $getInsertionContext(anchorNode);
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return;

  // Notes often use implicit closure (e.g., \f...\f*)
  const common = {args, context, marker, sid: context.currentSidAsString};
  const openingMarker = $createMarkerNode({
    ...common,
    tokenType: UsfmTokenTypes.marker,
  });
  const closingMarker = $createMarkerNode({
    ...common,
    marker: `${marker}*`,
    tokenType: UsfmTokenTypes.endMarker,
  });

  if (selection.isCollapsed()) {
    const emptyTextNode = $createContextTextNode({
      text: " ",
      context,
      tokenType: UsfmTokenTypes.text,
    });

    anchorNode.insertBefore(openingMarker);
    openingMarker.insertAfter(emptyTextNode);
    emptyTextNode.insertAfter(closingMarker);
    emptyTextNode.select();
  } else {
    // Similar to char wrapping
    const {anchor, focus} = selection;
    const isBackward = selection.isBackward();

    const startOffset = isBackward ? focus.offset : anchor.offset;
    const endOffset = isBackward ? anchor.offset : focus.offset;

    const [before, middle] = anchorNode.splitText(startOffset);
    const [selected, after] = (middle || before).splitText(
      endOffset - startOffset
    );

    selected.insertBefore(openingMarker);
    selected.insertAfter(closingMarker);

    if ($isUSFMTextNode(selected)) selected.setSid(context.newSid);
    if ($isUSFMTextNode(after)) after.setSid(context.newSid);

    selected.select();
  }
}

const InsertionTypes = {
  chapter: "chapter",
  verse: "verse",
  para: "para",
  char: "char",
  note: "note",
} as const;

type InsertionType = (typeof InsertionTypes)[keyof typeof InsertionTypes];

type BaseInsertArgs = {
  anchorNode: USFMTextNode;
  marker: string;
  isStartOfLine: boolean;
  markersMutableState: EditorMarkersMutableState;
  markersViewState: EditorMarkersViewState;
};

type InsertContext = {
  nearestParaMarker: string;
  prevSidInfo: ParsedReference | null;
  currentSidAsString: string;
  newSid: string;
};

// ============================================================================
// Shared Context & Node Creation
// ============================================================================

/**
 * Gets common context needed for all marker insertions
 */
function $getInsertionContext(anchorNode: USFMTextNode): InsertContext {
  const {nearestParaMarker, prevSidInfo} =
    findContextForVerseInsert(anchorNode);

  const prevVerseEnd = prevSidInfo?.verseEnd ?? 1;
  const newSid = `${prevSidInfo?.book} ${prevSidInfo?.chapter}:${
    prevVerseEnd + 1
  }`;

  return {
    nearestParaMarker: nearestParaMarker ?? "",
    prevSidInfo,
    currentSidAsString: prevSidInfo?.toSidString() ?? "",
    newSid,
  };
}

/**
 * Creates a USFM marker node with common properties
 */
type CreatMarkerNodeArgs = {
  marker: string;
  context: InsertContext;
  tokenType: (typeof UsfmTokenTypes)[keyof typeof UsfmTokenTypes];
  sid: string;
  inCharMarkers?: string[];
  args: Pick<BaseInsertArgs, "markersMutableState" | "markersViewState">;
};
function $createMarkerNode({
  marker,
  context,
  args,
  tokenType,
  sid,
  inCharMarkers,
}: CreatMarkerNodeArgs): USFMTextNode {
  return $createUSFMTextNode(`\\${marker}`, {
    id: guidGenerator(),
    inPara: context.nearestParaMarker,
    tokenType: tokenType,
    marker,
    sid,
    inChars: inCharMarkers,
    isMutable: args.markersMutableState === EditorMarkersMutableStates.MUTABLE,
    show:
      args.markersViewState === EditorMarkersViewStates.ALWAYS ||
      args.markersViewState === EditorMarkersViewStates.WHEN_EDITING,
  });
}

/**
 * Creates a text node with common properties
 */
type CreateContextTextNodeArgs = {
  text: string;
  context: InsertContext;
  tokenType: (typeof UsfmTokenTypes)[keyof typeof UsfmTokenTypes];
  extraProps?: Partial<USFMTextNodeMetadata>;
};
function $createContextTextNode({
  text,
  context,
  tokenType,
  extraProps,
}: CreateContextTextNodeArgs): USFMTextNode {
  return $createUSFMTextNode(text, {
    id: guidGenerator(),
    inPara: context.nearestParaMarker,
    tokenType: tokenType,
    sid: context.newSid,
    ...extraProps,
  });
}

/**
 * Ensures a linebreak precedes the given node
 */
function $ensureLineBreakBefore(node: USFMTextNode): void {
  const prevSibling = node.getPreviousSibling();
  const isLineBreak = prevSibling && $isLineBreakNode(prevSibling);

  if (!isLineBreak) {
    const lineBreakNode = $createLineBreakNode();
    node.insertBefore(lineBreakNode);
  }
}

// ============================================================================
// Insertion Type Mapping
// ============================================================================

function mapMarkerToInsertionType(marker: string): InsertionType {
  if (marker === "v") {
    return InsertionTypes.verse;
  }
  if (marker === "c") {
    return InsertionTypes.chapter;
  }
  if (VALID_PARA_MARKERS.has(marker)) {
    return InsertionTypes.para;
  }
  if (VALID_CHAR_MARKERS.has(marker)) {
    return InsertionTypes.char;
  }
  if (VALID_NOTE_MARKERS.has(marker)) {
    return InsertionTypes.note;
  }
  return InsertionTypes.para; // default fallback
}

function findContextForVerseInsert(anchorNode: LexicalNode): {
  nearestParaMarker: string | null;
  prevSidInfo: ParsedReference | null;
} {
  let nearestParaMarker: string | null = null;
  let prevSidInfo: ParsedReference | null = null;

  //   todo: what if this is verse one? or at start of blank chap. We could just I guess return a default #, but that could be annoying to delete as opposed ot knowing the pickedBook andChapter
  for (const {node} of $reverseDfsIterator(anchorNode, $getRoot())) {
    if ($isUSFMTextNode(node)) {
      const tokenType = node.getTokenType();

      if (!prevSidInfo && tokenType === UsfmTokenTypes.numberRange) {
        prevSidInfo = parseSid(node.getSid() ?? "");
      }

      if (!nearestParaMarker && tokenType === UsfmTokenTypes.marker) {
        const marker = node.getMarker() ?? "";
        if (ALL_USFM_MARKERS.has(marker)) {
          nearestParaMarker = marker;
        }
      }

      // stop once both are found
      if (prevSidInfo && nearestParaMarker) break;
    }
  }

  return {nearestParaMarker, prevSidInfo};
}

export function inverseTextNodeTransform({node}: TextNodeTransformParams) {
  const undoableNodeTypes = [UsfmTokenTypes.marker, UsfmTokenTypes.numberRange];
  const nodeTokenType = node.getTokenType();
  // @ts-expect-error: set includsion dhceck.
  if (!undoableNodeTypes.includes(nodeTokenType)) return;
  const content = node.getTextContent();

  if (nodeTokenType === UsfmTokenTypes.marker) {
    // if it no longer is a valid marker, turn it back to a regular text node
    const match = content.match(markerTokenMatchLineStartOptTrailingSpace);
    const marker = match?.[1];
    const isValid = marker ? ALL_USFM_MARKERS.has(marker) : false;
    if (isValid) return;
    const replacement = $createUSFMTextNode(node.getTextContent().trimEnd(), {
      id: node.getId(),
      sid: node.getSid(),
      inPara: node.getInPara(),
      tokenType: UsfmTokenTypes.text,
    });
    node.replace(replacement);
    replacement.select();
  }
}
