import { $reverseDfsIterator } from "@lexical/utils";
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
} from "@/app/data/editor.ts";
import { $createUSFMNestedEditorNode } from "@/app/domain/editor/nodes/USFMNestedEditorNode.tsx";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  type USFMTextNode,
  type USFMTextNodeMetadata,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { type ParsedReference, parseSid } from "@/core/data/bible/bible.ts";
import {
  ALL_USFM_MARKERS,
  isValidParaMarker,
  VALID_CHAR_MARKERS,
  VALID_NOTE_MARKERS,
  VALID_PARA_MARKERS,
} from "@/core/data/usfm/tokens.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

const markerTokenMatchLineStartOptTrailingSpace = /^\\([\w\d]+-?\w*)\s*/;
const markerTokenMatchLineStartSpaceReq = /^\\([\w\d]+-?\w*)\*?\s+/;
const markerTokenMatchLineMid = /\s+\\([\w\d]+-?\w*)\*?\s/;

// opt whitespace, 1+ digits, (opt hyphen, 1+ digits), opt whitespace
// const _verseRangeValidRegex = /^\s*\d+(-\d+)?\s*$/;

type TextNodeTransformParams = {
  node: USFMTextNode;
  editor: LexicalEditor;
  editorMode: EditorMode;
  markersMutableState: EditorMarkersMutableState;
  markersViewState: EditorMarkersViewState;
  languageDirection: "ltr" | "rtl";
};
export function textNodeTransform({
  node,
  editorMode,
  markersMutableState,
  markersViewState,
  languageDirection,
}: TextNodeTransformParams) {
  // noop in src mode
  if (editorMode === EditorModes.SOURCE) return;
  const text = node.getTextContent();
  const tokenType = node.getTokenType();
  const selection = $getSelection();

  if (
    tokenType !== UsfmTokenTypes.text &&
    tokenType !== UsfmTokenTypes.marker &&
    tokenType !== UsfmTokenTypes.endMarker
  )
    return;

  // The transform should only fire when the user is actively typing,
  // which is best represented by a collapsed cursor (not a range selection).
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return;
  }
  const anchorNode = selection.anchor.getNode();

  // This transform runs for a specific `node`. We must ensure the cursor
  // is actually inside THIS node before proceeding.
  if (selection.anchor.key !== node.getKey()) {
    return;
  }
  const isAlreadyMarker = tokenType === UsfmTokenTypes.marker;
  const isAlreadyEndMarker = tokenType === UsfmTokenTypes.endMarker;
  if ((isAlreadyMarker || isAlreadyEndMarker) && $isUSFMTextNode(anchorNode)) {
    // if there is more than one \\, trim start, split on space index;
    const numSlashes = text.split("\\").length;
    if (numSlashes > 2) {
      const spaceIndex = text.trimStart().indexOf(" ");
      const [left, right] = anchorNode.splitText(spaceIndex);
      const markerOrEnd = isAlreadyMarker
        ? UsfmTokenTypes.marker
        : UsfmTokenTypes.endMarker;
      if ($isUSFMTextNode(left)) {
        const currentTokenTypeLeft = left.getTokenType();
        if (isAlreadyMarker && currentTokenTypeLeft !== markerOrEnd) {
          left.setTokenType(markerOrEnd);
        }
      }
      if ($isUSFMTextNode(right)) {
        const currentTokenTypeRight = right.getTokenType();
        if (isAlreadyEndMarker && currentTokenTypeRight !== markerOrEnd) {
          right.setTokenType(markerOrEnd);
        }
      }
    }
    return;
  }

  const markerMatch = text.match(markerTokenMatchLineStartSpaceReq); // example: \v , \c , \q
  // const isHandledVerseRangeNode = verseNumberTransform(node);
  // if (isHandledVerseRangeNode) return;

  const inMidMatch = text.match(markerTokenMatchLineMid);
  if (!markerMatch && !inMidMatch) return;
  const marker = markerMatch?.[1] || inMidMatch?.[1];
  if (!marker) return;
  const isEndMarker =
    !!markerMatch?.[0].includes("*") || !!inMidMatch?.[0].includes("*");
  const isValidMarker = ALL_USFM_MARKERS.has(marker);
  const restOfText = text.slice(markerMatch?.[0].length ?? 0);
  const anchorOffset = selection.anchor.offset;
  const isStartOfLine =
    selection.anchor.type === "text"
      ? anchorOffset === anchorNode.getTextContentSize() &&
        anchorOffset === markerMatch?.[0].length
      : false;

  let anchorOffsetToUse = anchorOffset;
  if (inMidMatch && inMidMatch.index !== undefined) {
    anchorOffsetToUse = inMidMatch.index + inMidMatch[0].trimEnd().length;
  } else if (markerMatch && markerMatch.index !== undefined) {
    anchorOffsetToUse = markerMatch.index + markerMatch[0].trimEnd().length;
  }
  // const isVeryEndOfLine = anchorOffset === anchorNode.getTextContentSize();
  if (!isValidMarker) return;
  // if we're collapsed, event though there's a space, wait til our cursor is in the space

  const insertType = mapMarkerToInsertionType(marker, isEndMarker);
  const baseArgs: BaseInsertArgs = {
    anchorNode: node,
    anchorOffsetToUse,
    marker,
    isStartOfLine,
    markersMutableState,
    restOfText,
    markersViewState,
    languageDirection,
  };

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
    // todo: decide on enable?
    case InsertionTypes.chapter:
      return $insertChapter(baseArgs);
    case InsertionTypes.para:
      return $insertPara(baseArgs);
    case InsertionTypes.char:
      return $insertChar(baseArgs);
    case InsertionTypes.note:
      return $insertNote(baseArgs);
    case InsertionTypes.endMarker:
      return $insertEndMarker(baseArgs);
  }
}

function $insertEndMarker(args: BaseInsertArgs): void {
  const { anchorNode, marker, isStartOfLine } = args;

  const context = $getInsertionContext(anchorNode);

  // Create nodes
  const markerNode = $createMarkerNode({
    marker,
    context,
    args,
    tokenType: UsfmTokenTypes.endMarker,
    sid: anchorNode.getSid(),
    isEndMarker: true,
  });

  if (!isStartOfLine) {
    const [left, right] = anchorNode.splitText(args.anchorOffsetToUse);
    const woMarker = `${left
      .getTextContent()
      .trimEnd()
      .slice(0, -markerNode.getTextContentSize())}`;
    left?.setTextContent(woMarker);
    if ($isUSFMTextNode(right) && right.getSid() !== anchorNode.getSid()) {
      right.setSid(anchorNode.getSid());
    }

    left.insertAfter(markerNode);
    right?.setTextContent(` ${right.getTextContent().trimStart()}`);
    if (!right) {
      markerNode.selectEnd();
    } else {
      right.selectStart();
    }
  } else {
    anchorNode.replace(markerNode);
    markerNode.selectEnd();
  }
}

function $insertVerse(args: BaseInsertArgs): void {
  const { anchorNode, marker, isStartOfLine, markersMutableState } = args;

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

  if (!isStartOfLine) {
    // Mid-line insertion
    const [left, right] = anchorNode.splitText(args.anchorOffsetToUse);
    const woMarker = `${left
      .getTextContent()
      .trimEnd()
      .slice(0, -markerNode.getTextContentSize())}`;
    left?.setTextContent(woMarker);
    if ($isUSFMTextNode(right)) right.setSid(context.newSid);

    left.insertAfter(markerNode);
    markerNode.insertAfter(verseRangeNode);
    right?.setTextContent(` ${right.getTextContent().trimStart()}`);

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
  const { anchorNode, marker, isStartOfLine, markersMutableState } = args;

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
    const [left, right] = anchorNode.splitText(args.anchorOffsetToUse);
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
  const { anchorNode, marker, isStartOfLine } = args;

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
    const [left, right] = anchorNode.splitText(args.anchorOffsetToUse) as [
      USFMTextNode,
      USFMTextNode,
    ];
    const woMarker = `${left
      .getTextContent()
      .trimEnd()
      .slice(0, -markerNode.getTextContentSize())}`;
    left?.setTextContent(woMarker);
    left.insertAfter(markerNode);
    // left.replace(markerNode);
    right?.setTextContent(` ${right.getTextContent().trimStart()}`);
    $ensureLineBreakBefore(markerNode);

    if ($isUSFMTextNode(right)) {
      right.setSid(context.newSid);
      right.setInPara(marker);
      right.selectStart();
    }
    const nextSibling = anchorNode.getNextSibling();
    if (nextSibling && $isUSFMTextNode(nextSibling)) {
      nextSibling.selectStart();
    } else {
      const blankTextNode = $createContextTextNode({
        text: " ",
        context,
        tokenType: UsfmTokenTypes.text,
        extraProps: { inPara: marker },
      });
      markerNode.insertAfter(blankTextNode);
      blankTextNode.selectStart();
    }
  } else {
    $ensureLineBreakBefore(anchorNode);

    const nextSibling = anchorNode.getNextSibling();
    // anchorNode.setTextContent(restOfText || " ");
    anchorNode.replace(markerNode);

    if ($isUSFMTextNode(nextSibling)) {
      nextSibling.selectStart();
    } else {
      // No suitable sibling - create empty text node
      const blankTextNode = $createContextTextNode({
        text: " ",
        context,
        tokenType: UsfmTokenTypes.text,
        extraProps: { inPara: marker },
      });
      markerNode.insertAfter(blankTextNode);
      blankTextNode.select();
    }
  }
}

// ============================================================================
// Char Insertion (wraps selection)
// ============================================================================

function $insertChar(args: BaseInsertArgs): void {
  const { anchorNode, marker, isStartOfLine } = args;

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
      extraProps: { inChars: [marker] },
    });

    const offset = selection.anchor.offset;

    if (!isStartOfLine) {
      // Mid-line: remove marker from text, split, and insert
      const letterAtOffset = anchorNode.getTextContent().charAt(offset);
      const trueOffset =
        letterAtOffset === "\\"
          ? offset + openingMarker.getTextContentSize()
          : offset;
      const [left, right] = anchorNode.splitText(trueOffset);
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
    const { anchor, focus } = selection;
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
        adjustedEnd - adjustedStart,
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
  const { anchorNode, marker, isStartOfLine } = args;

  const context = $getInsertionContext(anchorNode);
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return;

  // Notes often use implicit closure (e.g., \f...\f*)
  const noteNode = $createUSFMNestedEditorNode({
    text: `\\${marker}`,
    marker,
    id: guidGenerator(),
    usfmType: marker,
    languageDirection: args.languageDirection,
    sid: context.currentSidAsString,
    lintErrors: [],
    isOpen: true,
  });
  const offset = $isRangeSelection(selection)
    ? selection.anchor.offset
    : anchorNode.getTextContentSize();

  if (!isStartOfLine) {
    const letterAtOffset = anchorNode.getTextContent().charAt(offset);
    const trueOffset =
      letterAtOffset === "\\" ? offset + noteNode.getTextContentSize() : offset;
    const [left, right] = anchorNode.splitText(trueOffset);
    const woMarker = `${left
      .getTextContent()
      .trimEnd()
      .slice(0, -noteNode.getTextContentSize())}`;
    left?.setTextContent(woMarker);
    left.insertAfter(noteNode);
    right?.setTextContent(` ${right.getTextContent().trimStart()}`);
  } else {
    anchorNode.replace(noteNode);
  }
}

const InsertionTypes = {
  chapter: "chapter",
  verse: "verse",
  para: "para",
  char: "char",
  note: "note",
  endMarker: "endMarker",
} as const;

type InsertionType = (typeof InsertionTypes)[keyof typeof InsertionTypes];

type BaseInsertArgs = {
  anchorNode: USFMTextNode;
  anchorOffsetToUse: number;
  marker: string;
  isStartOfLine: boolean;
  markersMutableState: EditorMarkersMutableState;
  markersViewState: EditorMarkersViewState;
  restOfText: string;
  languageDirection: "ltr" | "rtl";
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
  const { nearestParaMarker, prevSidInfo } =
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
  isEndMarker?: boolean;
};
export function $createMarkerNode({
  marker,
  context,
  args,
  tokenType,
  sid,
  inCharMarkers,
  isEndMarker,
}: CreatMarkerNodeArgs): USFMTextNode {
  const markerText = isEndMarker ? `\\${marker}*` : `\\${marker}`;
  return $createUSFMTextNode(markerText, {
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

function mapMarkerToInsertionType(
  marker: string,
  isEndMarker: boolean,
): InsertionType {
  if (isEndMarker) {
    return InsertionTypes.endMarker;
  }
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
  for (const { node } of $reverseDfsIterator(anchorNode, $getRoot())) {
    if ($isUSFMTextNode(node)) {
      const tokenType = node.getTokenType();

      if (!prevSidInfo && tokenType === UsfmTokenTypes.numberRange) {
        prevSidInfo = parseSid(node.getSid() ?? "");
      }

      if (!nearestParaMarker && tokenType === UsfmTokenTypes.marker) {
        const marker = node.getMarker() ?? "";
        if (isValidParaMarker(marker)) {
          nearestParaMarker = marker;
        }
      }

      // stop once both are found
      if (prevSidInfo && nearestParaMarker) break;
    }
  }

  return { nearestParaMarker, prevSidInfo };
}

export function inverseTextNodeTransform({ node }: TextNodeTransformParams) {
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
  if (nodeTokenType === UsfmTokenTypes.numberRange) {
    // const isValid = numRangeAtTokenStartWithWsRe.test(content);
    // if (isValid) return;
    // const replacement = $createUSFMTextNode(node.getTextContent().trimEnd(), {
    //   id: node.getId(),
    //   sid: node.getSid(),
    //   inPara: node.getInPara(),
    //   tokenType: UsfmTokenTypes.text,
    // });
    // node.replace(replacement);
    // replacement.select();
  }
}
