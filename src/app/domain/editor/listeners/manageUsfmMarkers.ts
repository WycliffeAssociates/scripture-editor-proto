import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";

import {
  type EditorModeSetting,
  isRegularShape,
  UsfmTokenTypes,
} from "@/app/data/editor.ts";
import {
  $createUSFMTextNode,
  $isUSFMTextNode,
  type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import {
  ALL_USFM_MARKERS,
  markerExpectsNumber,
} from "@/core/domain/usfm/onionMarkers.ts";

import {
  $insertChapter,
  $insertChar,
  $insertEndMarker,
  $insertNote,
  $insertPara,
  $insertVerse,
  type BaseInsertArgs,
  InsertionTypes,
  mapMarkerToInsertionType,
} from "../utils/insertMarkerOperations.ts";

const markerTokenMatchLineStartOptOptionalPadding =
  /^\s*\\(?:\+)?([\w\d]+-?\w*)\s*/u;
const markerTokenMatchLineStartSpaceReq = /^\\(?:\+)?([\w\d]+-?\w*)\*?\s+/u;
const markerTokenMatchLineMid = /\s+\\(?:\+)?([\w\d]+-?\w*)\*?\s/u;

// A marker name (letters only — the number-bearing markers c/v/cp/ca/vp/va
// carry no digits) immediately followed by its number, with the delimiter
// space optional so both `\v1` and `\v 1` match. Anchored at the node start
// because the fused bytes always lead the node (the marker IS the open).
const fusedNumberedMarkerPattern = /^\s*\\(?:\+)?([a-z]+)\s*(\d+(?:-\d+)?)/u;

// opt whitespace, 1+ digits, (opt hyphen, 1+ digits), opt whitespace
// const _verseRangeValidRegex = /^\s*\d+(-\d+)?\s*$/;

type TextNodeTransformParams = {
  node: USFMTextNode;
  editor: LexicalEditor;
  editorMode: EditorModeSetting;
  languageDirection: LanguageDirection;
};

/**
 * Transform typed text into explicit USFM marker nodes when the user is
 * authoring in source/plain modes.
 *
 * This is the core "I typed `\\v ` and now it should become a verse marker"
 * bridge. Regular/view mode intentionally bypass this because markers are
 * manipulated there through higher-level UI affordances instead of raw typing.
 */
export function textNodeTransform({
  node,
  editorMode,
  languageDirection,
}: TextNodeTransformParams) {
  // Regular mode (WYSIWYG) currently inserts markers via UI actions, not typed USFM.
  if (isRegularShape(editorMode)) {
    return;
  }

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
  const restOfText = text.slice(markerMatch?.[0].length ?? 0);

  const baseArgs: BaseInsertArgs = {
    anchorNode: node,
    anchorOffsetToUse,
    marker,
    isStartOfLine,
    restOfText,
    languageDirection,
    isTypedInsertion: true,
    editorMode,
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

/**
 * Undo marker-token interpretation when a node no longer represents a valid
 * marker after edits.
 *
 * Users can partially delete or mutate marker text. This inverse transform
 * prevents the editor from leaving behind a marker-typed node whose contents no
 * longer correspond to a real USFM marker.
 */
export function inverseTextNodeTransform({
  node,
  editorMode,
}: TextNodeTransformParams) {
  if (isRegularShape(editorMode)) {
    return;
  }
  // A prior transform in the same callback (e.g. splitFusedNumberedMarker)
  // may have already replaced this node; replacing a detached node throws.
  if (!node.isAttached()) return;
  const undoableNodeTypes = [UsfmTokenTypes.marker, UsfmTokenTypes.numberRange];
  const nodeTokenType = node.getTokenType();
  // @ts-expect-error: set includsion dhceck.
  if (!undoableNodeTypes.includes(nodeTokenType)) return;
  const content = node.getTextContent();

  if (nodeTokenType === UsfmTokenTypes.marker) {
    // if it no longer is a valid marker, turn it back to a regular text node
    const match = content.match(markerTokenMatchLineStartOptOptionalPadding);
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

/**
 * Re-split a number-bearing marker that re-absorbed its number into a single
 * node, restoring the canonical `marker` + `numberRange` pair.
 *
 * Backspacing a verse/chapter number away removes the `numberRange` node and
 * drops the caret into the `marker` node; typing the digit there (or mangling
 * the `numberRange` node directly) leaves one node holding `\v 1` — marker
 * bytes and number fused, the hidden-byte shape the node split exists to
 * prevent. This is the flat-mode counterpart to what `USFMNumberedMarkerNode`
 * makes structurally impossible in the regular shape.
 *
 * One case, two entry points: the fused node may be typed `marker` (digit
 * typed into the marker) or `numberRange` (marker typed into the number).
 * Both resolve the same way — parse the leading marker, confirm the catalog
 * says it takes a number, split. The delimiter is normalized in, so `\v1`
 * and `\v 1` both land as `\v` + ` 1`.
 */
export function splitFusedNumberedMarker({
  node,
  editorMode,
}: TextNodeTransformParams) {
  // Regular shape carries chapter/verse as USFMNumberedMarkerNode, which
  // can't fuse in the first place — nothing to repair here.
  if (isRegularShape(editorMode)) return;
  // textNodeTransform runs first in the same callback and may have replaced
  // this node; a detached node can't be split.
  if (!node.isAttached()) return;

  const tokenType = node.getTokenType();
  if (
    tokenType !== UsfmTokenTypes.marker &&
    tokenType !== UsfmTokenTypes.numberRange
  ) {
    return;
  }

  const text = node.getTextContent();
  const match = text.match(fusedNumberedMarkerPattern);
  if (!match) return;
  const [, marker, numberText] = match;
  if (!markerExpectsNumber(marker)) return;

  const sid = node.getSid();
  const inPara = node.getInPara();
  const rest = text.slice(match[0].length);

  // Keep the visible number's id on the numberRange piece when the fused node
  // was already the number (findings anchor to the number); otherwise the
  // marker piece keeps the existing id and the number gets a fresh one.
  const wasNumber = tokenType === UsfmTokenTypes.numberRange;
  const markerNode = $createUSFMTextNode(`\\${marker}`, {
    id: wasNumber ? guidGenerator() : node.getId(),
    tokenType: UsfmTokenTypes.marker,
    marker,
    sid,
    inPara,
  });
  const numberRange = $createUSFMTextNode(` ${numberText}`, {
    id: wasNumber ? node.getId() : guidGenerator(),
    tokenType: UsfmTokenTypes.numberRange,
    sid,
    inPara,
  });

  node.replace(markerNode);
  markerNode.insertAfter(numberRange);
  if (rest.trim().length > 0) {
    numberRange.insertAfter(
      $createUSFMTextNode(rest, {
        id: guidGenerator(),
        tokenType: UsfmTokenTypes.text,
        sid,
        inPara,
      }),
    );
  }
  // Caret at the number's end — the user just typed the digit there.
  numberRange.selectEnd();
}
