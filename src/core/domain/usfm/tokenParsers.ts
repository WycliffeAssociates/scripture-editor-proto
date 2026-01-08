import type { Token } from "moo";
import {
    dedupeErrorMessagesList,
    type LintableToken,
    type LintError,
    LintErrorKeys,
} from "@/core/data/usfm/lint.ts";
import {
    isValidParaMarker,
    VALID_CHAR_CROSS_REFERENCE_MARKERS,
    VALID_CHAR_FOOTNOTE_MARKERS,
    VALID_CHAR_MARKERS,
    VALID_NOTE_MARKERS,
} from "@/core/data/usfm/tokens.ts";
import { finalizeChapterLabelLint, lint } from "@/core/domain/usfm/lint.ts";
import { TokenMap } from "./lex.ts";
import { mergeHorizontalWhitespaceToAdjacent } from "./parseUtils.ts";

const attributeRegex = /^([a-zA-Z0-9\-_]+)="([^"]*)"$/;

export type ParseContext<T extends LintableToken> = {
    parseTokens: T[];
    bookCode: string;
    chapterLabel: string | null;
    lastMarker: T | null;
    idsToFilterOut: string[];
    currentParaMarker: string | null;
    charStack: string[];
    noteParent: T | null;
    errorMessages: LintError[];
    currentToken: T | null;
    prevToken: T | null;
    nextToken: T | null;
    twoFromCurrent: T | null;
    foundChapterLabels: {
        order: string[]; // in order of discovery
        map: Map<string, T[]>; // label -> tokens
    };
    lintChapters: { seen: Set<string>; list: string[] };
    lintVerseNums: {
        byChapter: Map<string, { seen: Map<string, T[]>; last: number }>;
    };
};

export function initParseContext<T extends LintableToken>(
    parseTokens: T[],
    partialCtx?: Partial<ParseContext<T>>,
): ParseContext<T> {
    const bookCode =
        partialCtx?.bookCode ||
        parseTokens
            .find((t) => t.tokenType === TokenMap.bookCode)
            ?.text?.trim();
    if (!bookCode) {
        throw new Error("No book code found");
    }
    return {
        parseTokens,
        bookCode,
        chapterLabel: null,
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

/** Top-level parse entry */
type ParseTokenArgs<T extends LintableToken> = {
    partialContext?: Partial<ParseContext<T>>;
    tokens: (T & Token)[] | T[];
};
type ParseResult<T extends LintableToken> = {
    tokens: T[];
    errorMessages: LintError[];
    idsToFilterOut: string[];
    ctx: ParseContext<T>;
};
export function parseTokens<T extends LintableToken>(
    args: ParseTokenArgs<T>,
): ParseResult<T> {
    const ctx = initParseContext(args.tokens, args.partialContext || {});

    // first normalization pass
    mergeHorizontalWhitespaceToAdjacent(ctx.parseTokens);

    for (let i = 0; i < ctx.parseTokens.length; i++) {
        ctx.currentToken = ctx.parseTokens[i];
        ctx.prevToken = ctx.parseTokens[i - 1] ?? null;
        ctx.nextToken = ctx.parseTokens[i + 1] ?? null;
        ctx.twoFromCurrent = ctx.parseTokens[i + 2] ?? null;

        [
            checkAndSetIfLastMarker,
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

    /* POST PROCESSING */
    // Some stuff such as chapter label linting needs to see the entirety of the token stream before we can present the best error message. So we do post processing here.
    finalizeChapterLabelLint(ctx);
    return {
        tokens: ctx.parseTokens.filter(
            (t) => !ctx.idsToFilterOut.includes(t.id),
        ) as T[],
        errorMessages: dedupeErrorMessagesList(ctx.errorMessages),
        idsToFilterOut: ctx.idsToFilterOut,
        ctx,
    };
}

/* ----------------------------
   Context-manipulation helpers
   ---------------------------- */

function checkAndSetIfLastMarker<T extends LintableToken>(
    ctx: ParseContext<T>,
) {
    const t = ctx.currentToken;
    if (!t) return;
    if (t.tokenType === TokenMap.marker) {
        ctx.lastMarker = t;
    }
}

function checkForHangingNoteStacks<T extends LintableToken>(
    ctx: ParseContext<T>,
) {
    const t = ctx.currentToken;
    if (!t) return;
    if (t.isParaMarker || t.tokenType === TokenMap.verticalWhitespace) {
        if (ctx.charStack.length || ctx.noteParent) {
            if (ctx.charStack.length) {
                const err = {
                    message: `Character marker ${ctx.charStack[0]} left at opening of new paragraph at ${t.sid}`,
                    sid: t.sid ?? "",
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
                    message: `Note marker ${ctx.noteParent.text} left opened at opening of new paragraph at ${t.sid}`,
                    sid: t.sid ?? "",
                    msgKey: LintErrorKeys.noteNotClosed,
                    nodeId: ctx.noteParent.id,
                };

                ctx.errorMessages.push(err);
                //   just push the error to the nearest paragraph node:
                ctx.noteParent.lintErrors ??= [];
                ctx.noteParent.lintErrors.push(err);
            }
            ctx.charStack = [];
            ctx.noteParent = null;
        }
    }
}

function checkIfValidParaMarker<T extends LintableToken>(ctx: ParseContext<T>) {
    const t = ctx.currentToken;
    if (t?.marker === "c") {
        ctx.currentParaMarker = null;
    }
    const isValidPara =
        t?.tokenType === TokenMap.marker && isValidParaMarker(t.marker ?? "");

    if (!isValidPara || !t) return;
    ctx.currentParaMarker = t.marker ?? "";
    t.isParaMarker = true;
}

function checkCharStack<T extends LintableToken>(ctx: ParseContext<T>) {
    const t = ctx.currentToken;
    if (!t?.tokenType) return;
    const type = t.tokenType;
    const typesToProcess: string[] = [
        TokenMap.marker,
        TokenMap.endMarker,
        TokenMap.implicitClose,
    ];
    if (!typesToProcess.includes(type)) return;

    if (type === TokenMap.marker) {
        if (VALID_CHAR_MARKERS.has(t.marker ?? "")) {
            ctx.charStack.push(t.marker ?? "");
        }
        const causesImmediateClose = [
            VALID_CHAR_CROSS_REFERENCE_MARKERS,
            VALID_CHAR_FOOTNOTE_MARKERS,
        ].some((arr) => arr.has(t.marker ?? ""));
        if (causesImmediateClose) {
            ctx.charStack.pop();
            ctx.charStack.push(t.marker ?? "");
        }
    } else {
        // end marker or implicit close
        ctx.charStack.pop();
        if (ctx.noteParent) {
            // ctx.noteParent.marker should already be set here, and we are checking for the closing marker
            if (t.text.trim() === `\\${ctx.noteParent.marker}*`) {
                // push to parent and then nullify
                if (!ctx.noteParent.content) ctx.noteParent.content = [];
                ctx.noteParent.content.push(t);
                ctx.idsToFilterOut.push(t.id);
                ctx.noteParent = null;
            }
        }
    }
}

function checkUpdateNoteParent<T extends LintableToken>(ctx: ParseContext<T>) {
    const t = ctx.currentToken;
    if (!t || t.tokenType !== TokenMap.marker) return;
    if (VALID_NOTE_MARKERS.has(t.marker ?? "")) {
        ctx.noteParent = t;
    }
}

function pushAttrPairToLastMarker<T extends LintableToken>(
    ctx: ParseContext<T>,
) {
    const t = ctx.currentToken;
    if (!t || t.tokenType !== TokenMap.attributePair || !ctx.lastMarker) return;
    const match = t.text.match(attributeRegex);
    if (!match) return;
    const [, key, value] = match;
    if (!ctx.lastMarker.attributes) ctx.lastMarker.attributes = {};
    ctx.lastMarker.attributes[key] = value;
}

function addParentTokenContextInfo<T extends LintableToken>(
    ctx: ParseContext<T>,
) {
    const t = ctx.currentToken;
    if (!t) return;
    if (ctx.currentParaMarker) {
        t.inPara = ctx.currentParaMarker;
    }
    if (ctx.charStack.length) {
        t.inChars = [...ctx.charStack];
    }
}

function checkIfShouldNestInNoteParent<T extends LintableToken>(
    ctx: ParseContext<T>,
) {
    const t = ctx.currentToken;
    if (!ctx.noteParent || !t) return;
    if (ctx.noteParent === t) return;
    if (!ctx.noteParent.content) ctx.noteParent.content = [];
    ctx.noteParent.content.push(t);
    ctx.idsToFilterOut.push(t.id);
}
