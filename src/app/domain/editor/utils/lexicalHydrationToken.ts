/**
 * Neutral token shape used while moving between Lexical JSON and the flatter
 * USFM-oriented processing steps used by lint, diff, search, and mode transforms.
 */
export type LexicalHydrationToken = {
    id: string;
    text: string;
    tokenType: string;
    sid?: string;
    marker?: string;
    inPara?: string;
    inChars?: string[];
    attributes?: Record<string, string>;
    content?: LexicalHydrationToken[];
};
