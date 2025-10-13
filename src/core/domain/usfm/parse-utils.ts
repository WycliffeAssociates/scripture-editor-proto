import type {Token} from "moo";
import {ParsedToken} from "@/core/data/usfm/parse";
import {
  isValidParaMarker,
  TOKENS_EXPECTING_CLOSE,
  VALID_PARA_MARKERS,
} from "@/core/data/usfm/tokens";
import {guidGenerator} from "@/core/data/utils/generic";
import {
  TokenMap,
  TokenName,
  type TokenNameSubset,
} from "@/core/domain/usfm/lex";

export const mergeHorizontalWhitespaceToAdjacent = (
  tokens: Token[]
): Token[] => {
  const wsTypes: TokenNameSubset = new Set([TokenMap.horizontalWhitespace]);
  const avoidPushingPrevTo: TokenNameSubset = new Set([
    TokenMap.endMarker,
    TokenMap.implicitClose,
  ]);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t?.type && wsTypes.has(t.type as TokenName)) {
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      if (!prev) continue;
      if (avoidPushingPrevTo.has(prev.type as TokenName) && next) {
        next.text = `${t.text}${next.text}`;
      } else {
        prev.text += t.text;
      }
      tokens.splice(i, 1);
      i--;
    }
  }
  return tokens;
};

type IntermediateToken = {
  type: string;
  value: string;
  marker?: string;
  inPara?: string;
  sid?: string;
};
export const calcSidsAndParaFlags = (
  tokens: Token[],
  givenBookCode?: string
): IntermediateToken[] => {
  // State variables to track context through the iteration
  let bookCode: string | null = givenBookCode || null;
  let curChap: string | null = null;
  let curVerse: string | null = null;
  let currentParaMarker: string | null = null;

  const intermediateTokens: IntermediateToken[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    // set book code if found
    if (token.type === "idMarker" && nextToken?.type === "bookCode") {
      bookCode = nextToken.value;
    }

    // Set paragraph flags to read forwards for styles
    if (token.type === TokenMap.marker && isValidParaMarker(token.value)) {
      currentParaMarker = token.value;
    }

    // Handle Chapter and Verse Markers (\c, \v)
    if (
      token.type === TokenMap.marker &&
      nextToken?.type === TokenMap.verseRange
    ) {
      if (token.value === "c") {
        curChap = nextToken.value;
        curVerse = null; // Reset verse number on new chapter
      } else if (token.value === "v") {
        curVerse = nextToken.value;
      }
    }

    let sid: string | null = null;
    if (bookCode && curChap) {
      sid = curVerse
        ? `${bookCode} ${curChap}:${curVerse}`
        : `${bookCode} ${curChap}`;
    }

    // --- Step 3: Create and push the new IntermediateToken ---
    const intermediate: IntermediateToken = {
      type: token.type ?? "",
      // Use token.text for text types, otherwise use value
      value: token.text,
      // Add marker property for clarity if the token is a marker
      marker: token.type === "marker" ? token.value : undefined,
    };

    if (sid) {
      intermediate.sid = sid;
    }
    if (currentParaMarker) {
      intermediate.inPara = currentParaMarker;
    }

    intermediateTokens.push(intermediate);
  }
  return intermediateTokens;
};

export const parseAttributePair = (
  attrText: string
): [string, string] | null => {
  const match = attrText.match(/^([a-zA-Z0-9\-_]+)="([^"]*)"$/);
  const k = match?.[1];
  const v = match?.[2];
  return k && v ? [k, v] : null;
};

export const nestCharsAndAssignAttributes = (
  tokens: IntermediateToken[]
): ParsedToken[] => {
  const result: ParsedToken[] = [];
  const stack: ParsedToken[] = [];
  let current = result;
  let lastMarker: ParsedToken | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token.type === TokenMap.verticalWhitespace) {
      current.push({
        type: TokenMap.verticalWhitespace,
        text: "",
        id: guidGenerator(),
      });
      continue;
    }
    if (token.type === TokenMap.horizontalWhitespace) continue;

    // Handle attribute pairs → attach to last marker
    if (token.type === TokenMap.attributePair) {
      if (lastMarker) {
        const attrPair = parseAttributePair(token.value);
        if (attrPair) {
          if (!lastMarker.attributes) lastMarker.attributes = {};
          lastMarker.attributes[attrPair[0]] = attrPair[1];
        }
      }
      continue;
    }

    // Drop end markers (they just close the stack)
    // todo: really we shouldn't hardcode markers here cause endnotes can work this way as well, but we should test with TOKENS_EXPECTING_CLOSE and all
    if (
      token.type === TokenMap.endMarker ||
      token.type === TokenMap.implicitClose
    ) {
      // Check if this is closing a footnote.
      // This is true if the marker is \f* or if it's an implicit close within a footnote context.
      const isFootnoteClose =
        (token.type === TokenMap.endMarker && token.value.trim() === "\\f*") ||
        (token.type === TokenMap.implicitClose &&
          stack.some((p) => p.marker === "f"));

      if (isFootnoteClose) {
        // Pop from the stack until the footnote marker is removed.
        while (stack.length > 0) {
          const popped = stack.pop();
          // Break after popping the footnote start marker.
          if (popped?.marker === "f") {
            break;
          }
        }
        // Reset the current container to the element at the top of the stack, or the root.
        const content = stack[stack.length - 1]?.content;
        if (stack.length > 0 && content?.length) {
          current = content;
        } else {
          current = result;
        }
      } else if (stack.length > 0) {
        // Original behavior for other end markers (e.g., \fqa*).
        stack.pop();
        const content = stack[stack.length - 1]?.content;
        if (stack.length > 0 && content?.length) {
          current = content;
        } else {
          current = result;
        }
      }
      lastMarker = null;
      continue;
    }

    // Convert to parsed token
    const parsed: ParsedToken = {
      type: token.type,
      text: token.value,
      id: guidGenerator(),
      ...(token.marker && {marker: token.marker}),
      ...(token.inPara && {inPara: token.inPara}),
      ...(token.sid && {sid: token.sid}),
    };

    const base = token.marker;
    if (base && TOKENS_EXPECTING_CLOSE.has(base)) {
      // This marker opens a nested block
      parsed.content = [];
      current.push(parsed);
      stack.push(parsed);
      current = parsed.content;
      lastMarker = parsed;
    } else {
      // Regular token, just push
      current.push(parsed);
      if (parsed.marker) lastMarker = parsed;
    }
  }

  // Cleanup dangling stack
  while (stack.length > 0) {
    stack.pop();
    const content = stack[stack.length - 1]?.content;
    if (stack.length > 0 && content?.length) {
      current = content;
    } else {
      current = result;
    }
  }

  return result;
};

export const adjustEndingParaMarkerSids = (
  tokens: IntermediateToken[]
): IntermediateToken[] => {
  let nextSid: string | null = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (
      t?.sid &&
      !isValidParaMarker(t.marker ?? "") &&
      t.type !== TokenMap.verticalWhitespace
    ) {
      // Update the "next known" sid
      nextSid = t.sid;
    } else if (
      t?.sid &&
      nextSid &&
      t.type === TokenMap.marker &&
      isValidParaMarker(t.marker ?? "")
    ) {
      // Fill backwards
      t.sid = nextSid;
    }
  }

  return tokens;
};

export const organizeByChapters = (parsedTokens: ParsedToken[]) => {
  const chapMatch = /\w{3}\s+(\d{1,3})/;
  const processed = parsedTokens.reduce(
    (acc, token, idx) => {
      const chapterMatch = token?.sid?.match(chapMatch);

      const chap = chapterMatch?.[1];
      if (chap && chap !== acc.curIdx.toString()) {
        acc.curIdx = parseInt(chap, 10);
        acc.chapters[acc.curIdx] = [];
      }
      // const chapterMatch = token?.text.match(/(\d+)/);
      // const nextToken = parsedTokens[idx + 1];
      // if (nextToken?.type === TokenMap.verseRange) {
      //   const verseMatch = nextToken?.text.match(/(\d+)/);
      //   const verse = verseMatch?.[1];
      //   if (verse) {
      //     acc.curIdx = parseInt(verse, 10);
      //     acc.chapters[acc.curIdx] = [];
      //   }
      // }
      // ;
      acc.chapters[acc.curIdx].push(token);
      return acc;
    },
    {
      curIdx: 0,
      chapters: {
        0: [],
      } as Record<number, ParsedToken[]>,
    }
  );
  return processed.chapters;
};
