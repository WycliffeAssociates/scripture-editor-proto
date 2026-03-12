import type { Token } from "moo";
import type { LegacyLintError as LintError } from "@/core/domain/usfm/legacyTokenTypes.ts";
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
