import type { SerializedLexicalNode } from "lexical";

import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
  createSerializedUSFMTextNode,
  isSerializedUSFMTextNode,
  type SerializedUSFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { guidGenerator } from "@/core/data/utils/generic.ts";

/**
 * Form-mode token grouping helpers. Form mode renders each verse hunk as a
 * decorator node carrying that hunk's flat serialized USFM tokens. The
 * functions here are the bridge between flat token slices and the row-based
 * view model the form UI presents — derive rows for display, splice text edits
 * back in, all without leaving the existing token shape.
 */

/**
 * One row inside a verse / prelude card. Each non-verse marker in the slice
 * becomes a `marker` row carrying the marker name + its trailing text. Running
 * text that does not follow any marker becomes a `text` row.
 *
 * There is no further classification: every marker is treated identically. The
 * skeleton view-model mirrors the underlying USFM token order without
 * categorizing markers into paragraph/poetry/section/etc.
 */
export type FormModeMarkerRow =
  | {
      kind: "marker";
      /** React render key — uniquely identifies this row within its card. */
      id: string;
      /**
       * Side-agnostic positional key used to align rows across panes (e.g.
       * the target's `marker:q2:1` row corresponds to the reference's
       * `marker:q2:1` row in the same verse). The marker name plus its
       * 0-indexed occurrence within the verse.
       */
      rowKey: string;
      marker: string;
      text: string;
      textTokenIndices: number[];
      markerTokenIndex: number;
    }
  | {
      kind: "text";
      id: string;
      /** Side-agnostic positional key — `text:<n>` for the nth text run. */
      rowKey: string;
      text: string;
      textTokenIndices: number[];
    };

function isLinebreak(node: SerializedLexicalNode): boolean {
  return node.type === "linebreak";
}

function isMarker(node: SerializedLexicalNode): node is SerializedUSFMTextNode {
  return (
    isSerializedUSFMTextNode(node) &&
    node.tokenType === UsfmTokenTypes.marker &&
    typeof node.marker === "string"
  );
}

function isVerseMarker(node: SerializedLexicalNode): boolean {
  return isMarker(node) && node.marker === "v";
}

function isNumberRange(
  node: SerializedLexicalNode,
): node is SerializedUSFMTextNode {
  return (
    isSerializedUSFMTextNode(node) &&
    node.tokenType === UsfmTokenTypes.numberRange
  );
}

function isText(node: SerializedLexicalNode): node is SerializedUSFMTextNode {
  return (
    isSerializedUSFMTextNode(node) &&
    (node.tokenType === UsfmTokenTypes.text ||
      node.tokenType === UsfmTokenTypes.numberRange)
  );
}

function joinAndCollapse(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/**
 * Derive the row-based view model for a single verse / prelude token slice.
 * Token indices are recorded so edits can splice content back into the slice
 * without scanning a second time.
 */
export function extractRowsFromSlice(
  slice: SerializedLexicalNode[],
  idPrefix: string,
): FormModeMarkerRow[] {
  const rows: FormModeMarkerRow[] = [];
  let pendingTextParts: string[] = [];
  let pendingTextIndices: number[] = [];
  let textRowCounter = 0;
  const markerOccurrences = new Map<string, number>();

  const flushText = () => {
    if (pendingTextParts.length === 0 && pendingTextIndices.length === 0) {
      return;
    }
    const text = joinAndCollapse(pendingTextParts.join(""));
    if (text.length > 0) {
      const occurrence = textRowCounter++;
      rows.push({
        kind: "text",
        id: `${idPrefix}-text-${occurrence}`,
        rowKey: `text:${occurrence}`,
        text,
        textTokenIndices: [...pendingTextIndices],
      });
    }
    pendingTextParts = [];
    pendingTextIndices = [];
  };

  for (let i = 0; i < slice.length; i++) {
    const node = slice[i] as SerializedLexicalNode;

    if (isLinebreak(node)) {
      pendingTextIndices.push(i);
      pendingTextParts.push(" ");
      continue;
    }

    if (isMarker(node)) {
      const marker = node.marker ?? "";
      // Skip the verse marker itself — it's the card header.
      if (marker === "v") {
        const next = slice[i + 1];
        if (next && isNumberRange(next)) {
          i += 1;
        }
        continue;
      }

      const contentParts: string[] = [];
      const contentIndices: number[] = [];
      let j = i + 1;
      while (j < slice.length) {
        const next = slice[j] as SerializedLexicalNode;
        if (isMarker(next) || isVerseMarker(next)) break;
        if (isLinebreak(next)) {
          contentIndices.push(j);
          contentParts.push(" ");
        } else if (isText(next)) {
          contentIndices.push(j);
          contentParts.push(next.text ?? "");
        }
        j += 1;
      }

      flushText();
      const occurrence = markerOccurrences.get(marker) ?? 0;
      markerOccurrences.set(marker, occurrence + 1);
      rows.push({
        kind: "marker",
        id: `${idPrefix}-${marker}-${rows.length}`,
        rowKey: `marker:${marker}:${occurrence}`,
        marker,
        text: joinAndCollapse(contentParts.join("")),
        textTokenIndices: contentIndices,
        markerTokenIndex: i,
      });
      i = j - 1;
      continue;
    }

    if (isText(node)) {
      pendingTextIndices.push(i);
      pendingTextParts.push(node.text ?? "");
    }
  }

  flushText();
  return rows;
}

/**
 * Inserts a structural marker inside one form field.
 *
 * Form fields are a presentation over serialized token slices. A mid-field
 * insertion must split the displayed text back into tokens so the user can
 * place markers without switching to raw USFM mode.
 */
export function insertMarkerInsideRowText(
  slice: SerializedLexicalNode[],
  row: FormModeMarkerRow,
  offset: number,
  marker: string,
  sidHint: string,
): SerializedLexicalNode[] {
  const text = row.text;
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safeOffset).trimEnd();
  const after = text.slice(safeOffset).trimStart();
  const indicesToRemove = new Set(row.textTokenIndices);
  const insertionAnchor =
    row.kind === "text"
      ? (row.textTokenIndices[0] ?? slice.length)
      : row.markerTokenIndex + 1;

  const replacementTokens: SerializedLexicalNode[] = [];
  const pushText = (nextText: string, preserveLeadingSpace: boolean) => {
    if (nextText.length === 0) return;
    replacementTokens.push(
      createSerializedUSFMTextNode({
        text: preserveLeadingSpace ? ` ${nextText}` : nextText,
        id: guidGenerator(),
        sid: sidHint,
        tokenType: UsfmTokenTypes.text,
      }),
    );
  };

  pushText(before, row.kind !== "text");
  replacementTokens.push(
    createSerializedUSFMTextNode({
      text: `\\${marker} `,
      id: guidGenerator(),
      sid: sidHint,
      tokenType: UsfmTokenTypes.marker,
      marker,
      inPara: marker,
    }),
    { type: "linebreak", version: 1 } as SerializedLexicalNode,
  );
  pushText(after, true);

  const result: SerializedLexicalNode[] = [];
  let inserted = false;
  for (let i = 0; i < slice.length; i++) {
    if (i === insertionAnchor && !inserted) {
      result.push(...replacementTokens);
      inserted = true;
    }
    if (indicesToRemove.has(i)) continue;
    result.push(slice[i] as SerializedLexicalNode);
  }
  if (!inserted) {
    result.push(...replacementTokens);
  }
  return result;
}

export type FormModeFlatGrouping = {
  prelude: SerializedLexicalNode[] | null;
  verses: SerializedLexicalNode[][];
};

/**
 * Group a chapter's flat token list into one slice per verse-hunk plus an
 * optional prelude slice. Used when rematerializing into form-mode decorator
 * nodes.
 */
export function groupFlatTokensByVerse(
  flatTokens: SerializedLexicalNode[],
): FormModeFlatGrouping {
  const verseStarts: number[] = [];
  flatTokens.forEach((node, index) => {
    if (isVerseMarker(node)) verseStarts.push(index);
  });

  if (verseStarts.length === 0) {
    return {
      prelude: flatTokens.length > 0 ? flatTokens : null,
      verses: [],
    };
  }

  const firstVerseStart = verseStarts[0] as number;
  const prelude =
    firstVerseStart > 0 ? flatTokens.slice(0, firstVerseStart) : null;

  const verses: SerializedLexicalNode[][] = [];
  for (let i = 0; i < verseStarts.length; i++) {
    const start = verseStarts[i] as number;
    const end =
      i + 1 < verseStarts.length
        ? (verseStarts[i + 1] as number)
        : flatTokens.length;
    verses.push(flatTokens.slice(start, end));
  }

  return { prelude, verses };
}
