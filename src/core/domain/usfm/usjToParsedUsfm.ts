import type { ParsedToken } from "@/core/data/usfm/parse.ts";
import { TokenMap } from "@/core/domain/usfm/lex.ts";
import type {
    ParsedUsfmChapters,
    ParsedUsfmDocument,
    UsjDocument,
    UsjElement,
    UsjNode,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

type BuilderState = {
    nextId: number;
    bookCode: string;
    currentChapter: number;
    currentSid: string;
    currentPara: string | null;
    charStack: string[];
    chapters: ParsedUsfmChapters;
};

function makeId(state: BuilderState): string {
    const next = state.nextId;
    state.nextId += 1;
    return String(next);
}

function ensureChapterBucket(
    chapters: ParsedUsfmChapters,
    chapter: number,
): ParsedToken[] {
    chapters[chapter] ??= [];
    return chapters[chapter];
}

function addTokenToChapter(
    state: BuilderState,
    token: ParsedToken,
    target?: ParsedToken[],
) {
    const bucket =
        target ?? ensureChapterBucket(state.chapters, state.currentChapter);
    bucket.push(token);
}

function makeMarkerToken(
    state: BuilderState,
    marker: string,
    text: string = `\\${marker}`,
    target?: ParsedToken[],
): ParsedToken {
    const token: ParsedToken = {
        id: makeId(state),
        tokenType: TokenMap.marker,
        text,
        marker,
        sid: state.currentSid,
        inPara: state.currentPara ?? undefined,
        inChars: state.charStack.length ? [...state.charStack] : undefined,
    };
    addTokenToChapter(state, token, target);
    return token;
}

function makeEndMarkerToken(
    state: BuilderState,
    marker: string,
    target?: ParsedToken[],
): ParsedToken {
    const token: ParsedToken = {
        id: makeId(state),
        tokenType: TokenMap.endMarker,
        text: `\\${marker}*`,
        marker,
        sid: state.currentSid,
        inPara: state.currentPara ?? undefined,
        inChars: state.charStack.length ? [...state.charStack] : undefined,
    };
    addTokenToChapter(state, token, target);
    return token;
}

function makeTextToken(
    state: BuilderState,
    text: string,
    target?: ParsedToken[],
): ParsedToken {
    const token: ParsedToken = {
        id: makeId(state),
        tokenType: text === "\n" ? TokenMap.verticalWhitespace : TokenMap.text,
        text,
        sid: state.currentSid,
        inPara: state.currentPara ?? undefined,
        inChars: state.charStack.length ? [...state.charStack] : undefined,
    };
    addTokenToChapter(state, token, target);
    return token;
}

function makeNumberToken(
    state: BuilderState,
    value: string,
    target?: ParsedToken[],
): ParsedToken {
    const token: ParsedToken = {
        id: makeId(state),
        tokenType: TokenMap.numberRange,
        text: value,
        sid: state.currentSid,
        inPara: state.currentPara ?? undefined,
        inChars: state.charStack.length ? [...state.charStack] : undefined,
    };
    addTokenToChapter(state, token, target);
    return token;
}

function makeBookCodeToken(
    state: BuilderState,
    code: string,
    target?: ParsedToken[],
): ParsedToken {
    const token: ParsedToken = {
        id: makeId(state),
        tokenType: TokenMap.bookCode,
        text: code,
        sid: state.currentSid,
        inPara: state.currentPara ?? undefined,
        inChars: state.charStack.length ? [...state.charStack] : undefined,
    };
    addTokenToChapter(state, token, target);
    return token;
}

function markerFromElement(element: UsjElement): string | null {
    if ("marker" in element && typeof element.marker === "string") {
        return element.marker;
    }
    if (element.type === "periph") return "periph";
    if (element.type === "ref") return "ref";
    return null;
}

function markerTextFromNode(node: UsjElement): string {
    if (typeof (node as Record<string, unknown>).markerText === "string") {
        return String((node as Record<string, unknown>).markerText);
    }

    if (node.type === "note") {
        const caller = typeof node.caller === "string" ? node.caller : "";
        return caller ? `\\${node.marker} ` : `\\${node.marker}`;
    }

    return markerFromElement(node) ? `\\${markerFromElement(node)}` : "";
}

function walkNode(state: BuilderState, node: UsjNode, target?: ParsedToken[]) {
    if (typeof node === "string") {
        makeTextToken(state, node, target);
        return;
    }

    switch (node.type) {
        case "book": {
            state.bookCode = node.code;
            state.currentChapter = 0;
            state.currentSid = `${node.code} 0:0`;
            makeMarkerToken(
                state,
                node.marker,
                markerTextFromNode(node),
                target,
            );
            makeBookCodeToken(state, node.code, target);
            node.content?.forEach((child) => {
                walkNode(state, child, target);
            });
            return;
        }
        case "chapter": {
            const nextChapter = Number.parseInt(node.number, 10) || 0;
            state.currentChapter = nextChapter;
            state.currentSid =
                typeof (node as Record<string, unknown>).sid === "string"
                    ? String((node as Record<string, unknown>).sid)
                    : `${state.bookCode} ${nextChapter}:0`;
            makeMarkerToken(
                state,
                node.marker,
                markerTextFromNode(node),
                target,
            );
            makeNumberToken(state, node.number, target);
            return;
        }
        case "verse": {
            state.currentSid =
                typeof (node as Record<string, unknown>).sid === "string"
                    ? String((node as Record<string, unknown>).sid)
                    : `${state.bookCode} ${state.currentChapter}:${node.number}`;
            makeMarkerToken(
                state,
                node.marker,
                markerTextFromNode(node),
                target,
            );
            makeNumberToken(state, node.number, target);
            return;
        }
        case "para": {
            const previousPara = state.currentPara;
            state.currentPara = node.marker;
            makeMarkerToken(
                state,
                node.marker,
                markerTextFromNode(node),
                target,
            );
            node.content?.forEach((child) => {
                walkNode(state, child, target);
            });
            state.currentPara = previousPara;
            return;
        }
        case "char":
        case "ref":
        case "unknown":
        case "unmatched":
        case "figure":
        case "sidebar":
        case "periph":
        case "table":
        case "table:row":
        case "table:cell": {
            const marker = markerFromElement(node);
            if (!marker) {
                node.content?.forEach((child) => {
                    walkNode(state, child, target);
                });
                return;
            }

            makeMarkerToken(state, marker, markerTextFromNode(node), target);
            const previousChars = state.charStack;
            if (node.type === "char" || node.type === "ref") {
                state.charStack = [...state.charStack, marker];
            }
            node.content?.forEach((child) => {
                walkNode(state, child, target);
            });
            state.charStack = previousChars;

            if (node.type === "char" || node.type === "ref") {
                makeEndMarkerToken(state, marker, target);
            }
            return;
        }
        case "note": {
            const noteToken = makeMarkerToken(
                state,
                node.marker,
                markerTextFromNode(node),
                target,
            );
            noteToken.content = [];

            if (node.caller) {
                makeTextToken(state, node.caller, noteToken.content);
            }

            node.content?.forEach((child) => {
                walkNode(state, child, noteToken.content);
            });
            makeEndMarkerToken(state, node.marker, noteToken.content);
            return;
        }
        case "ms": {
            makeMarkerToken(
                state,
                node.marker,
                markerTextFromNode(node),
                target,
            );
            return;
        }
        case "optbreak": {
            makeTextToken(state, "\n", target);
            return;
        }
        default: {
            const exhaustive: never = node;
            return exhaustive;
        }
    }
}

function usjToParsedUsfmChapters(document: UsjDocument): ParsedUsfmChapters {
    const state: BuilderState = {
        nextId: 0,
        bookCode: "UNK",
        currentChapter: 0,
        currentSid: "UNK 0:0",
        currentPara: null,
        charStack: [],
        chapters: { 0: [] },
    };

    document.content.forEach((node) => {
        walkNode(state, node);
    });
    return state.chapters;
}

export function usjToParsedUsfmDocument(
    document: UsjDocument,
): ParsedUsfmDocument {
    return {
        chapters: usjToParsedUsfmChapters(document),
        lintErrors: [],
    };
}
