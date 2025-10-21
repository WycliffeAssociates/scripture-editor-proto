// parse-lint.ts
// Refactor of TokenParser -> functional style with ParseContext
// Assumes the following exist in your codebase:
// - TokenDuringParse type (has id: string, type: TokenName, value?: string, text?: string, marker?: string, ...)
// - TokenMap constant
// - helper functions/constants: mergeHorizontalWhitespaceToAdjacent, isValidParaMarker,
//   VALID_CHAR_MARKERS, VALID_CHAR_CROSS_REFERENCE_MARKERS, VALID_CHAR_FOOTNOTE_MARKERS,
//   VALID_NOTE_MARKERS, ALL_USFM_MARKERS, guidGenerator
// Adjust imports / types as needed.

import { LintErrorKeys } from "@/core/data/usfm/lint";
import {
    isValidParaMarker,
    VALID_CHAR_CROSS_REFERENCE_MARKERS,
    VALID_CHAR_FOOTNOTE_MARKERS,
    VALID_CHAR_MARKERS,
    VALID_NOTE_MARKERS,
} from "@/core/data/usfm/tokens";
import type { LintError, TokenDuringParse } from "@/core/domain/usfm/parse";
import { TokenMap } from "./lex";
import { lint } from "./lint";
import { mergeHorizontalWhitespaceToAdjacent } from "./parse-utils";

const attributeRegex = /^([a-zA-Z0-9\-_]+)="([^"]*)"$/;

export type BaseTokenContext = {
    parseTokens: TokenDuringParse[];
    chapterLabel: string | null;
    mutCurChap: string | null;
    mutCurSid: string | null;
    mutCurVerse: string | null;
    lastMarker: TokenDuringParse | null;
    idsToFilterOut: string[];
    currentParaMarker: string | null;
    charStack: string[];
    noteParent: TokenDuringParse | null;
    errorMessages: LintError[];
    currentToken: TokenDuringParse | null;
    prevToken: TokenDuringParse | null;
    nextToken: TokenDuringParse | null;
    twoFromCurrent: TokenDuringParse | null;
    foundChapterLabels: {
        order: string[]; // in order of discovery
        map: Map<string, TokenDuringParse[]>; // label -> tokens
    };
    lintChapters: { seen: Set<string>; list: string[] };
    lintVerseNums: {
        byChapter: Map<string, { seen: Set<string>; last: number }>;
    };
};

export type TokenContextWithParseInfo = {
    bookCode: string;
};
export type ParseContext = TokenContextWithParseInfo & BaseTokenContext;

export function initBaseTokenContext(
    parseTokens: TokenDuringParse[],
    partialCtx: Partial<BaseTokenContext>,
): BaseTokenContext {
    return {
        parseTokens,
        chapterLabel: null,
        mutCurChap: null,
        mutCurSid: null,
        mutCurVerse: null,
        lastMarker: null,
        idsToFilterOut: [],
        currentParaMarker: null,
        charStack: [],
        noteParent: null,
        errorMessages: [],
        currentToken: null,
        prevToken: null,
        nextToken: null,
        twoFromCurrent: null,
        foundChapterLabels: { order: [], map: new Map() },
        lintChapters: { seen: new Set(), list: [] },
        lintVerseNums: { byChapter: new Map() },
        ...partialCtx,
    };
}

export function initParseContext(
    ctx: BaseTokenContext,
    bookCode?: string,
): ParseContext {
    const book =
        bookCode ||
        ctx.parseTokens.find((t) => t.type === TokenMap.bookCode)?.value;
    if (!book) throw new Error("No book code found");
    return {
        parseTokens: ctx.parseTokens,
        bookCode: book,
        chapterLabel: null,
        mutCurChap: null,
        mutCurSid: `${book}`,
        mutCurVerse: null,
        lastMarker: null,
        idsToFilterOut: [],
        currentParaMarker: null,
        charStack: [],
        noteParent: null,
        errorMessages: [],
        currentToken: null,
        prevToken: null,
        nextToken: null,
        twoFromCurrent: null,
        foundChapterLabels: { order: [], map: new Map() },
        lintChapters: { seen: new Set(), list: [] },
        lintVerseNums: { byChapter: new Map() },
    };
}

/** Top-level parse entry */
type ParseTokenArgs = {
    partialBaseTokenContext?: Partial<BaseTokenContext>;
    tokens: TokenDuringParse[];
    bookCode?: string;
};
export function parseTokens(args: ParseTokenArgs) {
    const ctx = initParseContext(
        initBaseTokenContext(args.tokens, args.partialBaseTokenContext || {}),
        args.bookCode,
    );

    // first normalization pass
    mergeHorizontalWhitespaceToAdjacent(ctx.parseTokens);

    for (let i = 0; i < ctx.parseTokens.length; i++) {
        ctx.currentToken = ctx.parseTokens[i];
        ctx.prevToken = ctx.parseTokens[i - 1] ?? null;
        ctx.nextToken = ctx.parseTokens[i + 1] ?? null;
        ctx.twoFromCurrent = ctx.parseTokens[i + 2] ?? null;

        [
            checkAndSetIfLastMarker,
            manageSid,
            checkIfValidParaMarker,
            // checkForHangingNoteStacks needs to come after checkIfValidParaMarker
            checkForHangingNoteStacks,
            checkCharStack,
            checkUpdateNoteParent,
            pushAttrPairToLastMarker,
            addParentTokenContextInfo,
            lint,
            checkIfShouldNestInNoteParent,
        ].forEach((fn) => {
            fn(ctx);
        });
    }

    return {
        tokens: ctx.parseTokens.filter(
            (t) => !ctx.idsToFilterOut.includes(t.id),
        ),
        errorMessages: ctx.errorMessages,
        idsToFilterOut: ctx.idsToFilterOut,
    };
}

/* ----------------------------
   Context-manipulation helpers
   ---------------------------- */

export function checkAndSetIfLastMarker(ctx: ParseContext) {
    const t = ctx.currentToken;
    if (!t) return;
    if (t.type === TokenMap.marker || t.type === TokenMap.idMarker) {
        ctx.lastMarker = t;
        t.marker = t.value;
    }
}

export function manageSid(ctx: ParseContext) {
    const t = ctx.currentToken;
    const n = ctx.nextToken;
    if (
        (t?.type === TokenMap.marker || t?.type === TokenMap.idMarker) &&
        n?.type === TokenMap.numberRange
    ) {
        if (t.value === "c") {
            ctx.mutCurChap = n.value;
            ctx.mutCurVerse = null;
        } else if (t.value === "v") {
            ctx.mutCurVerse = n.value;
        }
    }

    if (ctx.mutCurVerse) {
        ctx.mutCurSid = `${ctx.bookCode} ${ctx.mutCurChap}:${ctx.mutCurVerse}`;
    } else if (ctx.mutCurChap) {
        ctx.mutCurSid = `${ctx.bookCode} ${ctx.mutCurChap}`;
    } else if (
        ctx.bookCode &&
        (t?.type === TokenMap.marker || t?.type === TokenMap.idMarker)
    ) {
        ctx.mutCurSid = `${ctx.bookCode}-${t.value}`;
    }

    if (t && ctx.mutCurSid) {
        t.sid = ctx.mutCurSid;
    }
}

export function checkForHangingNoteStacks(ctx: ParseContext) {
    const t = ctx.currentToken;
    if (!t) return;
    if (t.isParaMarker || t.type === TokenMap.verticalWhitespace) {
        if (ctx.charStack.length || ctx.noteParent) {
            if (ctx.charStack.length) {
                const err = {
                    message: `Character marker ${ctx.charStack[0]} left at opening of new paragraph at ${ctx.mutCurSid}`,
                    sid: ctx.mutCurSid ?? "",
                    msgKey: LintErrorKeys.charNotClosed,
                    nodeId: t.id,
                };
                ctx.errorMessages.push(err);
                //   just push the error to the nearest paragraph node:
                t.lintErrors ??= [];
                t.lintErrors.push(err);
            }
            if (ctx.noteParent) {
                const err = {
                    message: `Note marker ${ctx.noteParent.value} left opened at opening of new paragraph at ${ctx.mutCurSid}`,
                    sid: ctx.mutCurSid ?? "",
                    msgKey: LintErrorKeys.noteNotClosed,
                    nodeId: ctx.noteParent.id,
                };
                ctx.errorMessages.push(err);
                ctx.noteParent.lintErrors ??= [];
                ctx.noteParent.lintErrors.push(err);
            }
            ctx.charStack = [];
            ctx.noteParent = null;
        }
    }
}

export function checkIfValidParaMarker(ctx: ParseContext) {
    const t = ctx.currentToken;
    const isValidPara =
        t?.type === TokenMap.marker && isValidParaMarker(t.value);
    if (!isValidPara || !t) return;
    ctx.currentParaMarker = t.value;
    t.isParaMarker = true;
}

export function checkCharStack(ctx: ParseContext) {
    const t = ctx.currentToken;
    if (!t?.type) return;
    const type = t.type;
    const typesToProcess: string[] = [
        TokenMap.marker,
        TokenMap.endMarker,
        TokenMap.implicitClose,
    ];
    if (!typesToProcess.includes(type)) return;

    if (type === TokenMap.marker) {
        if (VALID_CHAR_MARKERS.has(t.value)) {
            ctx.charStack.push(t.value);
        }
        const causesImmediateClose = [
            VALID_CHAR_CROSS_REFERENCE_MARKERS,
            VALID_CHAR_FOOTNOTE_MARKERS,
        ].some((arr) => arr.has(t.value ?? ""));
        if (causesImmediateClose) {
            ctx.charStack.pop();
            ctx.charStack.push(t.value ?? "");
        }
    } else {
        // end marker or implicit close
        ctx.charStack.pop();
        if (ctx.noteParent) {
            const expected = t.value.replace("*", "").replace("\\", "");
            if (expected === ctx.noteParent.value) {
                // push to parent and then nullify
                if (!ctx.noteParent.content) ctx.noteParent.content = [];
                ctx.noteParent.content.push(t);
                ctx.idsToFilterOut.push(t.id);
                ctx.noteParent = null;
            }
        }
    }
}

export function checkUpdateNoteParent(ctx: ParseContext) {
    const t = ctx.currentToken;
    if (!t || t.type !== TokenMap.marker) return;
    if (VALID_NOTE_MARKERS.has(t.value)) {
        ctx.noteParent = t;
    }
}

export function pushAttrPairToLastMarker(ctx: ParseContext) {
    const t = ctx.currentToken;
    if (!t || t.type !== TokenMap.attributePair || !ctx.lastMarker) return;
    const match = t.value.match(attributeRegex);
    if (!match) return;
    const [, key, value] = match;
    if (!ctx.lastMarker.attributes) ctx.lastMarker.attributes = {};
    ctx.lastMarker.attributes[key] = value;
}

export function addParentTokenContextInfo(ctx: ParseContext) {
    const t = ctx.currentToken;
    if (!t) return;
    if (ctx.currentParaMarker && !t.isParaMarker) {
        t.inPara = ctx.currentParaMarker;
    }
    if (ctx.charStack.length) {
        t.inChars = [...ctx.charStack];
    }
}

export function checkIfShouldNestInNoteParent(ctx: ParseContext) {
    const t = ctx.currentToken;
    if (!ctx.noteParent || !t) return;
    if (ctx.noteParent === t) return;
    if (!ctx.noteParent.content) ctx.noteParent.content = [];
    ctx.noteParent.content.push(t);
    ctx.idsToFilterOut.push(t.id);
}

/* ----------------------------
   Linting API (same checks as class)
   ---------------------------- */
