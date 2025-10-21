import type { Token } from "moo";
import { createParsedToken, type ParsedToken } from "@/core/data/usfm/parse";
import {
    ALL_USFM_MARKERS,
    isValidParaMarker,
    TOKENS_EXPECTING_CLOSE,
    VALID_CHAR_CROSS_REFERENCE_MARKERS,
    VALID_CHAR_FOOTNOTE_MARKERS,
    VALID_CHAR_MARKERS,
    VALID_NOTE_MARKERS,
    VALID_PARA_MARKERS,
} from "@/core/data/usfm/tokens";
import { guidGenerator } from "@/core/data/utils/generic";
import {
    TokenMap,
    type TokenName,
    type TokenNameSubset,
} from "@/core/domain/usfm/lex";
import type { TokenDuringParse } from "@/core/domain/usfm/parse";

const attributeRegex = /^([a-zA-Z0-9\-_]+)="([^"]*)"$/;

export const mergeHorizontalWhitespaceToAdjacent = (
    tokens: Token[],
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

export const removeVerticalWhiteSpaceInVerses = (args: {
    currentToken: TokenDuringParse;
    nextToken: TokenDuringParse;
    twoFromCurrent: TokenDuringParse;
    idsToFilterOut: string[];
}) => {
    const { currentToken, nextToken, twoFromCurrent, idsToFilterOut } = args;
    if (currentToken?.type !== TokenMap.marker) return;
    if (!nextToken || nextToken.type !== TokenMap.verticalWhitespace) return;
    if (!twoFromCurrent || twoFromCurrent.type !== TokenMap.marker) return;

    // this pattern: \v {#} text BR \v {#}
    if (
        nextToken?.type === TokenMap.verticalWhitespace &&
        twoFromCurrent?.type === TokenMap.marker &&
        twoFromCurrent.value === "v"
    ) {
        // remove the vertical whitespace
        idsToFilterOut.push(nextToken.id);
    }
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
    givenBookCode?: string,
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
            nextToken?.type === TokenMap.numberRange
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
    attrText: string,
): [string, string] | null => {
    const match = attrText.match(/^([a-zA-Z0-9\-_]+)="([^"]*)"$/);
    const k = match?.[1];
    const v = match?.[2];
    return k && v ? [k, v] : null;
};

export const nestCharsAndAssignAttributes = (
    tokens: IntermediateToken[],
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
                (token.type === TokenMap.endMarker &&
                    token.value.trim() === "\\f*") ||
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
            ...(token.marker && { marker: token.marker }),
            ...(token.inPara && { inPara: token.inPara }),
            ...(token.sid && { sid: token.sid }),
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
    tokens: IntermediateToken[],
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

export const organizeByChapters = (parsedTokens: TokenDuringParse[]) => {
    const chapMatch = /\w{3}\s+(\d{1,3})/;
    const processed = parsedTokens.reduce(
        (acc, token) => {
            const chapterMatch = token?.sid?.match(chapMatch);

            const chap = chapterMatch?.[1];
            if (chap && chap !== acc.curIdx.toString()) {
                acc.curIdx = parseInt(chap, 10);
                acc.chapters[acc.curIdx] = [];
            }

            acc.chapters[acc.curIdx].push(createParsedToken(token));
            return acc;
        },
        {
            curIdx: 0,
            chapters: {
                0: [],
            } as Record<number, ParsedToken[]>,
        },
    );
    return processed.chapters;
};

// export class TokenParser {
//   parseTokens: TokenDuringParse[];
//   nodeMap: Map<string, TokenDuringParse>;
//   bookCode: string;
//   chapterLabel: string | null = null;
//   mutCurChap: string | null = null;
//   mutCurSid: string | null = null;
//   mutCurVerse: string | null = null;
//   lastMarker: TokenDuringParse | null = null;
//   idsToFilterOut: string[] = [];
//   currentParaMarker: string | null = null;
//   charStack: string[] = [];
//   noteParent: TokenDuringParse | null = null;
//   errorMessages: {message: string; sid: string}[] = [];
//   currentToken: TokenDuringParse | null = null;
//   prevToken: TokenDuringParse | null = null;
//   nextToken: TokenDuringParse | null = null;
//   twoFromCurrent: TokenDuringParse | null = null;
//   foundChapterLabels: {
//     // label to sid
//     [label: string]: string[];
//   } = {};
//   lintChapters: {
//     seen: Set<string>;
//     list: string[];
//   } = {
//     seen: new Set(),
//     list: [],
//   };
//   // [chapter, verse]
//   lintVerseNums: {
//     byChapter: Map<string, {seen: Set<string>; last: number}>;
//   } = {
//     byChapter: new Map(),
//   };

//   constructor(
//     tokens: TokenDuringParse[],
//     nodeMap: Map<string, TokenDuringParse>
//   ) {
//     const book = tokens.find((t) => t.type === TokenMap.bookCode)?.value;
//     if (!book) throw new Error("No book code found");
//     this.bookCode = book;
//     this.parseTokens = tokens;
//     this.mutCurSid = `${book}`;
//     this.nodeMap = nodeMap;
//   }

//   parse() {
//     mergeHorizontalWhitespaceToAdjacent(this.parseTokens);

//     for (let i = 0; i < this.parseTokens.length; i++) {
//       this.currentToken = this.parseTokens[i];
//       this.prevToken = this.parseTokens[i - 1];
//       this.nextToken = this.parseTokens[i + 1];
//       this.twoFromCurrent = this.parseTokens[i + 2];
//       this.checkAndSetIfLastMarker();
//       this.manageSid();
//       this.checkIfValidParaMarker();
//       this.checkCharStack();
//       this.checkUpdateNoteParent();
//       this.pushAttrPairToLastMarker();
//       this.addParentTokenContextInfo();
//       this.lint(); //lint before moving things into note parents
//       this.checkIfShouldNestInNoteParent();
//     }

//     if (Object.keys(this.foundChapterLabels).length > 1) {
//       Object.entries(this.foundChapterLabels).forEach(([label, sids]) => {
//         this.errorMessages.push({
//           message: `Multiple chapter labels found: ${label}`,
//           sid: sids.join(", "),
//         });
//       });
//     }

//     return {
//       tokens: this.parseTokens.filter(
//         (t) => !this.idsToFilterOut.includes(t.id)
//       ),
//       errorMessages: this.errorMessages,
//       idsToFilterOut: this.idsToFilterOut,
//     };
//   }

//   // --------------------------
//   // Methods below mirror your functions
//   // --------------------------

//   checkAndSetIfLastMarker() {
//     if (
//       this.currentToken?.type === TokenMap.marker ||
//       this.currentToken?.type === TokenMap.idMarker
//     ) {
//       this.lastMarker = this.currentToken;
//       this.currentToken.marker = this.currentToken.value;
//     }
//   }

//   manageSid() {
//     if (
//       (this.currentToken?.type === TokenMap.marker ||
//         this.currentToken?.type === TokenMap.idMarker) &&
//       this.nextToken?.type === TokenMap.numberRange
//     ) {
//       if (this.currentToken.value === "c") {
//         this.mutCurChap = this.nextToken.value;
//         this.mutCurVerse = null;
//       } else if (this.currentToken.value === "v") {
//         this.mutCurVerse = this.nextToken.value;
//       }
//     }

//     if (this.mutCurVerse) {
//       this.mutCurSid = `${this.bookCode} ${this.mutCurChap}:${this.mutCurVerse}`;
//     } else if (this.mutCurChap) {
//       this.mutCurSid = `${this.bookCode} ${this.mutCurChap}`;
//     } else if (
//       this.bookCode &&
//       (this.currentToken?.type === TokenMap.marker ||
//         this.currentToken?.type === TokenMap.idMarker)
//     ) {
//       this.mutCurSid = `${this.bookCode}-${this.currentToken.value}`;
//     }

//     if (this.currentToken && this.mutCurSid) {
//       this.currentToken.sid = this.mutCurSid;
//     }
//   }

//   checkIfValidParaMarker() {
//     const isValidPara =
//       this.currentToken?.type === TokenMap.marker &&
//       isValidParaMarker(this.currentToken.value);
//     if (!isValidPara || !this.currentToken) return;
//     this.currentParaMarker = this.currentToken.value;
//     this.currentToken.isParaMarker = true;
//     if (this.charStack.length || this.noteParent) {
//       if (this.charStack.length) {
//         this.errorMessages.push({
//           message: `Character marker ${this.charStack[0]} left at opening of new paragraph at ${this.mutCurSid}`,
//           sid: this.mutCurSid || "",
//         });
//       }
//       if (this.noteParent) {
//         this.errorMessages.push({
//           message: `Note marker ${this.noteParent.value} left opened at opening of new paragraph at ${this.mutCurSid}`,
//           sid: this.mutCurSid || "",
//         });
//       }
//       this.charStack = [];
//       this.noteParent = null;
//     }
//   }

//   checkCharStack() {
//     if (!this.currentToken?.type) return;
//     const type = this.currentToken.type;
//     const typesToProcess: Array<string> = [
//       TokenMap.marker,
//       TokenMap.endMarker,
//       TokenMap.implicitClose,
//     ];
//     if (!typesToProcess.includes(type)) {
//       return;
//     }

//     if (type === TokenMap.marker) {
//       if (VALID_CHAR_MARKERS.has(this.currentToken.value)) {
//         this.charStack.push(this.currentToken.value);
//       }
//       const causesImmediateClose = [
//         VALID_CHAR_CROSS_REFERENCE_MARKERS,
//         VALID_CHAR_FOOTNOTE_MARKERS,
//       ].some((arr) => arr.has(this.currentToken?.value || ""));
//       if (causesImmediateClose) {
//         this.charStack.pop();
//         this.charStack.push(this.currentToken?.value || "");
//       }
//     } else {
//       this.charStack.pop();
//       if (this.noteParent) {
//         const expected = this.currentToken.value
//           .replace("*", "")
//           .replace("\\", "");
//         if (expected === this.noteParent.value) {
//           // push to parent and then nullify
//           if (this.noteParent.content) {
//             this.noteParent.content.push(this.currentToken);
//           }
//           this.noteParent = null;
//         }
//       }
//     }
//   }

//   checkUpdateNoteParent() {
//     if (this.currentToken?.type !== TokenMap.marker) return;
//     if (VALID_NOTE_MARKERS.has(this.currentToken.value)) {
//       this.noteParent = this.currentToken;
//     }
//   }

//   pushAttrPairToLastMarker() {
//     if (this.currentToken?.type !== TokenMap.attributePair || !this.lastMarker)
//       return;
//     const match = this.currentToken.value.match(attributeRegex);
//     if (!match) return;
//     const [_, key, value] = match;
//     if (!this.lastMarker.attributes) this.lastMarker.attributes = {};
//     this.lastMarker.attributes[key] = value;
//   }

//   addParentTokenContextInfo() {
//     if (!this.currentToken) return;
//     if (this.currentParaMarker && !this.currentToken.isParaMarker) {
//       this.currentToken.inPara = this.currentParaMarker;
//     }
//     if (this.charStack.length) {
//       this.currentToken.inChars = [...this.charStack];
//     }
//   }

//   checkIfShouldNestInNoteParent() {
//     if (!this.noteParent || !this.currentToken) return;
//     if (this.noteParent === this.currentToken) return;
//     if (!this.noteParent.content) this.noteParent.content = [];
//     this.noteParent.content.push(this.currentToken);
//     this.idsToFilterOut.push(this.currentToken.id);
//   }

//   lint() {
//     this.lintChapterLabels();
//     this.lintIsUnknownMarker();
//     this.lintVerseContentNotEmpty();
//     this.lintTextFollowsVerseRange();
//     this.lintVerseRanges();
//     this.lintCheckForDuplicateChapNum();
//     this.lintIsUnknownMarker();
//   }
//   lintChapterLabels() {
//     const isMarker = this.currentToken?.type === TokenMap.marker;
//     const isClMarker = this.currentToken?.value === "cl";
//     let nextText = this.nextToken?.text;
//     if (isMarker && isClMarker && nextText) {
//       // lexer allows text to end in numbers, we don't capture cl, specifically, so if nextText has number, just split until that point
//       const hasNum = nextText.match(/[0-9]/);
//       if (hasNum) {
//         nextText = nextText.substring(0, hasNum.index).trim();
//       }
//       let entry = this.foundChapterLabels[nextText];
//       if (!entry) {
//         entry = [];
//         this.foundChapterLabels[nextText] = entry;
//       }
//       entry.push(this.currentToken?.sid ?? "unknown location");
//     }
//   }
//   checkForVerseRangeAfterVerseMarker() {
//     const isVerseRangeMarker = this.currentToken?.marker === "v";
//     const nextMarker = this.nextToken;
//     const nextMarkerType = nextMarker?.type;
//     if (isVerseRangeMarker && nextMarkerType !== TokenMap.numberRange) {
//       const text = this.currentToken?.text;
//       if (!text) return;
//       this.errorMessages.push({
//         message: `Verse range expected after \v`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//     }
//   }
//   lintCheckForDuplicateChapNum() {
//     if (this.currentToken?.marker !== "c") return;
//     const next = this.nextToken;
//     const nextMarkerType = next?.type;
//     if (nextMarkerType !== TokenMap.numberRange) {
//       this.errorMessages.push({
//         message: `Number range expected after \\c`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//       return;
//     }
//     const prevChapSeen = this.lintChapters.seen.has(next?.value ?? "");
//     const prevChapSaw = this.lintChapters.list.at(-1);
//     if (prevChapSeen && prevChapSaw) {
//       this.errorMessages.push({
//         message: `Duplicate chapter number ${next?.value ?? ""}`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//     }
//     const expected = prevChapSaw ? parseInt(prevChapSaw, 10) + 1 : 1;
//     if (next?.value !== expected.toString()) {
//       this.errorMessages.push({
//         message: `Expected chapter number ${expected}, found ${next?.value}`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//     }
//     this.lintChapters.seen.add(next?.value ?? "");
//     this.lintChapters.list.push(next?.value ?? "");
//   }
//   lintVerseRanges() {
//     // only check verse ranges following a verse marker
//     if (this.currentToken?.type !== TokenMap.numberRange) return;
//     if (this.prevToken?.marker !== "v") return;
//     const curChapter = this.mutCurChap;
//     if (!curChapter) return;

//     const value = this.currentToken.value.trim();
//     const [startStr, endStr] = value.split("-");
//     const start = parseInt(startStr, 10);
//     const end = endStr ? parseInt(endStr, 10) : start;

//     // Initialize per-chapter data if missing
//     if (!this.lintVerseNums.byChapter.has(curChapter)) {
//       this.lintVerseNums.byChapter.set(curChapter, {
//         seen: new Set<string>(),
//         last: 0,
//       });
//     }

//     const chapterState = this.lintVerseNums.byChapter.get(curChapter);
//     if (!chapterState) return;
//     const key = `${curChapter}:${start}-${end}`;
//     const prevLast = chapterState.last ?? 0;

//     // --- Duplicate check
//     if (chapterState.seen.has(key)) {
//       this.errorMessages.push({
//         message: `Duplicate verse number ${value}`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//     }

//     // --- Continuity check
//     const expectedStart = prevLast + 1;
//     if (start !== expectedStart) {
//       this.errorMessages.push({
//         message: `Expected verse ${expectedStart}, found ${start}`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//     }

//     // --- Record state
//     for (let v = start; v <= end; v++) {
//       chapterState.seen.add(`${curChapter}:${v}`);
//     }
//     chapterState.last = end;
//   }
//   lintVerseContentNotEmpty() {
//     // when in text and prev was verse
//     if (this.currentToken?.marker !== TokenMap.text) return;
//     if (this.prevToken?.marker !== "v") return;
//     if (!this.currentToken.text.trim()) {
//       this.errorMessages.push({
//         message: `Verse content expected after \v and range ${this.prevToken.value}`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//     }
//   }
//   lintTextFollowsVerseRange() {
//     // when in numberRange and next is not text
//     if (this.currentToken?.marker !== TokenMap.numberRange) return;
//     const nextToken = this.nextToken;
//     if (!nextToken) return;
//     if (nextToken.type !== TokenMap.text) {
//       this.errorMessages.push({
//         message: `Expected verse content expected after \v and range ${this.currentToken.value}`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//     }
//   }
//   lintIsUnknownMarker() {
//     if (this.currentToken?.marker === TokenMap.marker) {
//       if (ALL_USFM_MARKERS.has(this.currentToken.value)) return;
//       this.errorMessages.push({
//         message: `Unknown marker ${this.currentToken.value}`,
//         sid: this.currentToken?.sid ?? "unknown location",
//       });
//     }
//   }
// }
