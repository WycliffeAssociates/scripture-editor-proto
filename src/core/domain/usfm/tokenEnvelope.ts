/**
 * Lightweight token wrapper used by formatting/diff transforms that need token text
 * plus surrounding metadata without depending on a full editor node shape.
 */
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
