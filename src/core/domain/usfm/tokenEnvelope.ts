export type TokenEnvelope = {
    tokenType: string;
    text: string;
    marker?: string;
    sid?: string;
    id?: string;
    inPara?: string;
    inChars?: string[];
    attributes?: Record<string, string>;
    content?: TokenEnvelope[];
    [key: string]: unknown;
};
