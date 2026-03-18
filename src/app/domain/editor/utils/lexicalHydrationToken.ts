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
