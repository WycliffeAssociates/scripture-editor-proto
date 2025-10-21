import type { Token } from "moo";
import { ALL_USFM_MARKERS } from "@/core/data/usfm/tokens";
import { isMarker, markerTrimNoSlash } from "@/core/domain/usfm/lex";
import type { LintError } from "@/core/domain/usfm/parse";
export type TokenDuringParse = Token & {
    attributes?: Record<string, string>;
    content?: Array<TokenDuringParse>;
    id: string;
    inChars?: Array<string>;
    inPara?: string;
    lintErrors?: Array<LintError>;
    marker?: string;
    sid?: string;
    tokenType: string;
};

export interface ParsedToken {
    attributes?: Record<string, string>;
    content?: ParsedToken[];
    id: string;
    inChars?: Array<string>;
    inPara?: string;
    lintErrors?: Array<LintError>;
    marker?: string;
    sid?: string;
    text: string;
    tokenType: string;
}
export const createParsedToken = (token: TokenDuringParse): ParsedToken => {
    const isAMarker: string | undefined = isMarker(token.text)
        ? markerTrimNoSlash(token.text)
        : undefined;
    const isInvalidMarker = isAMarker && !ALL_USFM_MARKERS.has(isAMarker);
    return {
        attributes: token.attributes,
        content: token.content,
        id: token.id,
        inChars: token.inChars,
        inPara: token.inPara,
        lintErrors: token.lintErrors,
        marker: token.marker,
        sid: token.sid,
        text: token.text,
        tokenType: isInvalidMarker ? token.text : token.tokenType,
    };
};
