// import {createId} from "@paralleldrive/cuid2";
import type {Token} from "moo";
import {allParaTokens, lexer, tokensExpectingClose} from "./lex";

export interface ParsedToken {
  type: string;
  text: string;
  cuid: string;
  marker?: string;
  inPara?: string;
  sid?: string;
  level?: string;
  content?: ParsedToken[];
  attributes?: Record<string, string>;
}
export interface ParsedUSFM {
  chapters: Record<number, ParsedToken[]>;
}
const valueIsTextList = new Set(["text", "verseRange"]);
let parseId = 0;

const pushWhitespaceOntoPrevToken = (tokens: Token[]) => {
  const wsTypes = new Set(["ws"]);
  const avoidPushingPrevTo = new Set(["endMarker", "implicitClose"]);
  for (let i = 0; i < tokens.length; i++) {
    const thisToken = tokens[i];
    if (thisToken?.type && wsTypes.has(thisToken.type)) {
      const prevToken = tokens[i - 1];
      const nextToken = tokens[i + 1];
      if (!prevToken) continue;

      if (avoidPushingPrevTo.has(prevToken.type ?? "") && nextToken) {
        // push to next instead
        nextToken.text = `${thisToken.text}${nextToken.text}`;
      } else {
        prevToken.text += thisToken.text;
      }
      tokens.splice(i, 1);
      i--; // Adjust index since we removed an item
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

const separateIntoNewLines = (tokens: Token[]) => {
  return tokens.reduce<Token[][]>((acc, token) => {
    if (token.type === "nl") {
      acc.push([]);
    } else {
      const lastGroup = acc[acc.length - 1];
      if (lastGroup) {
        lastGroup.push(token);
      } else {
        acc.push([token]);
      }
    }
    return acc;
  }, []);
};

export const pushTokenContentOntoMarker = (
  tokens: Token[],
  givenBookCode?: string
) => {
  let prevMarker: Token | null = null;
  let sid: string | null = null;
  let bookCode: string | null = givenBookCode || null;
  let curChap: string | null = null;
  let curVerse: string | null = null;

  // Split by newlines into chunks
  const nlSeparatedChunks = separateIntoNewLines(tokens);

  const makeIntermediate = (
    token: Token,
    sid: string | null
  ): IntermediateToken => {
    const it: IntermediateToken = {
      type: token.type ?? "",
      value: valueIsTextList.has(token.type ?? "") ? token.text : token.value,
    };
    if (prevMarker) {
      it.inPara = prevMarker.value;
    }
    if (token.type === "marker") {
      it.marker = token.value;
    }
    if (sid) {
      it.sid = sid;
    }
    return it;
  };

  const processChunk = (chunk: Token[]): IntermediateToken[] => {
    if (chunk.length === 0) return [];

    const firstMarkerIdx = chunk.findIndex((t) =>
      ["idMarker", "marker"].includes(t.type!)
    );
    if (firstMarkerIdx === -1) {
      return chunk.map((c) => makeIntermediate(c, sid));
    }

    const firstMarker = chunk[firstMarkerIdx]!;

    const nextToken = chunk[firstMarkerIdx + 1];
    const nextType = nextToken?.type;

    // Get sid
    if (
      ["c", "v"].includes(firstMarker.value) &&
      nextToken &&
      nextType === "verseRange"
    ) {
      if (firstMarker.value === "c") {
        curChap = nextToken.value;
        curVerse = "";
        sid = `${bookCode} ${curChap}`;
      } else if (firstMarker.value === "v") {
        curVerse = nextToken.value;
        sid = `${bookCode} ${curChap}:${curVerse}`;
      }
      // prevMarker = null;
    }

    const pre = chunk
      .slice(0, firstMarkerIdx)
      .map((c) => makeIntermediate(c, sid));
    const post = chunk
      .slice(firstMarkerIdx + 2)
      .map((c) => makeIntermediate(c, sid));

    // Handle book id
    if (firstMarker.type === "idMarker") {
      const bookNode = chunk.find((t) => t.type === "bookCode");
      if (bookNode) bookCode = bookNode.value;
    }

    // Handle para markers
    if (allParaTokens.has(firstMarker.value)) {
      if (nextToken && nextType === "text") {
        const para: IntermediateToken = {
          type: firstMarker.type!,
          marker: firstMarker.value,
          value: nextToken.value,
          ...(sid ? {sid} : {}),
        };
        prevMarker = null;
        return [...pre, para, ...post];
      }
      // lone para marker
      if (chunk.length === 1) {
        let v = chunk.map((c) => makeIntermediate(c, null));
        // todo: work on fiddling with the in para val for flat properties moving this around and when to set it?Mainly for quotes.
        prevMarker = firstMarker;
        return v;
      }
    } // Handle chapter/verse markers
    else if (
      ["c", "v"].includes(firstMarker.value) &&
      nextToken &&
      nextType === "verseRange"
    ) {
      const cv: IntermediateToken = {
        type: firstMarker.type!,
        marker: firstMarker.value,
        value: nextToken!.value,
        sid: sid ?? "",
        ...(prevMarker ? {inPara: prevMarker.value} : {}),
      };
      prevMarker = null;
      return [...pre, cv, ...post];
    }

    // Fallback
    return chunk.map((c) => makeIntermediate(c, sid));
  };

  const flattened: IntermediateToken[] = nlSeparatedChunks.flatMap((chunk) => [
    ...processChunk(chunk),
    {type: "nl", value: "\n"},
  ]);
  return flattened;
};

function assignSidsBackward(tokens: IntermediateToken[]): IntermediateToken[] {
  let nextSid: string | null = null;

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];

    if (t?.sid) {
      // Update the "next known" sid
      nextSid = t.sid;
    } else if (t && !t.sid && nextSid) {
      // Fill backwards
      t.sid = nextSid;
    }
  }

  return tokens;
}

const parseAttributePair = (attrText: string): [string, string] | null => {
  const match = attrText.match(/^([a-zA-Z0-9\-_]+)="([^"]*)"$/);
  const k = match?.[1];
  const v = match?.[2];
  return k && v ? [k, v] : null;
};

// const createParsedToken = (token: Token, sid?: string): ParsedToken => {
//   const level = isMarker(token.text)
//     ? token.text.match(/(\d+)/)?.[1]
//     : undefined;

//   const common: ParsedToken = {
//     type: token.type || "unknown",
//     text: token.text,
//   };
//   if (sid) common.sid = sid;
//   if (level) common.level = level;
//   return common;
// };

// const getBaseMarker = (text: string) => {
//   // Remove leading backslash and trailing + if present
//   return text.replace(/^\\/, "").replace(/\+$/, "").trim();
// };
// type getNextSidNumArgs = {
//   tokenBase: string;
//   i: number;
//   tokens: Token[];
//   token: Token;
// };
// function getNextSidNum({tokenBase, i, tokens, token}: getNextSidNumArgs) {
//   if (["c", "v"].includes(tokenBase)) {
//     let nextVerseRange;
//     for (let j = i + 1; j < tokens.length; j++) {
//       if (tokens[j]?.type === "verseRange") {
//         nextVerseRange = tokens[j];
//         break;
//       }
//     }
//     const verseNum = nextVerseRange
//       ? nextVerseRange.text.replace(/\s+/g, "")
//       : token.text.replace(/\s+/g, "");
//     return verseNum;
//   }
// }

const nestCharsAndAssignAttributes = (
  tokens: IntermediateToken[]
): ParsedToken[] => {
  const result: ParsedToken[] = [];
  const stack: ParsedToken[] = [];
  let current = result;
  let lastMarker: ParsedToken | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token.type === "nl") {
      current.push({
        type: "nl",
        text: "",
        cuid: `${parseId++}`,
      });
      continue;
    }
    if (token.type === "ws") continue;

    // Handle attribute pairs → attach to last marker
    if (token.type === "attrPair") {
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
    if (token.type === "endMarker" || token.type === "implicitClose") {
      // Check if this is closing a footnote.
      // This is true if the marker is \f* or if it's an implicit close within a footnote context.
      const isFootnoteClose =
        (token.type === "endMarker" && token.value === "\\f*") ||
        (token.type === "implicitClose" && stack.some((p) => p.marker === "f"));

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
        current = stack.length > 0 ? stack[stack.length - 1]?.content! : result;
      } else if (stack.length > 0) {
        // Original behavior for other end markers (e.g., \fqa*).
        stack.pop();
        current = stack.length > 0 ? stack[stack.length - 1]?.content! : result;
      }
      lastMarker = null;
      continue;
    }

    // Convert to parsed token
    const parsed: ParsedToken = {
      type: token.type,
      text: token.value === token.marker ? "" : token.value,
      cuid: `${parseId++}`,
      ...(token.marker && {marker: token.marker}),
      ...(token.inPara && {inPara: token.inPara}),
      ...(token.sid && {sid: token.sid}),
    };

    const base = token.marker;

    if (base && tokensExpectingClose.has(base)) {
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
    current = stack.length > 0 ? stack[stack.length - 1]?.content! : result;
  }

  return result;
};

const organizeByChapters = (tokens: ParsedToken[]): ParsedUSFM => {
  const result: ParsedUSFM = {
    chapters: {},
  };

  const processed = tokens.reduce(
    (acc, token) => {
      if (token.type === "marker" && token.marker === "c") {
        const chapterMatch = token?.text.match(/(\d+)/);
        const num = chapterMatch?.[1];
        if (num) {
          acc.curIdx = parseInt(num, 10);
          acc.chapters[acc.curIdx] = [];
        }
      }
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
  return {
    chapters: processed.chapters,
  };
};

export const parseUSFM = (input: string, bookCode?: string): ParsedUSFM => {
  // Reset the lexer and tokenize
  // const t0 = performance.now();
  const lexed = lexer.reset(input);
  const tokens = Array.from(lexed);
  // const t1 = performance.now();
  // console.log(`\n\nTokenization took ${t1 - t0} milliseconds.`);

  // Merge whitespace into previous tokens
  // const t2 = performance.now();
  pushWhitespaceOntoPrevToken(tokens);
  // const t3 = performance.now();
  // console.log(`Whitespace merging took ${t3 - t2} milliseconds.`);
  // ;
  let parsePass1 = pushTokenContentOntoMarker(tokens, bookCode);
  parsePass1 = assignSidsBackward(parsePass1);
  // const t4 = performance.now();
  // console.log(`parse pass 1 took ${t4 - t3} milliseconds.`);
  const nestedAndAttrAssigned = nestCharsAndAssignAttributes(parsePass1);
  // const t5 = performance.now();
  // console.log(`flat took ${t5 - t4} milliseconds.`);
  // console.log(`Total time was ${t5 - t0} milliseconds.`);
  // return nestedAndAttrAssigned;
  // ;
  // Parse the token stream into nested structure
  // const t4 = performance.now();
  // const parsedTokens = parseTokenStream(tokens);
  // const t5 = performance.now();
  // // console.log(`Parsing took ${t5 - t4} milliseconds.`);

  // // Organize by chapters
  // const t6 = performance.now();
  const organized = organizeByChapters(nestedAndAttrAssigned);
  return organized;
  // const t7 = performance.now();
  // // console.log(`Organizing took ${t7 - t6} milliseconds.`);
  // console.log(`Total time was ${t7 - t0} milliseconds.`);
  // return organized;
};
