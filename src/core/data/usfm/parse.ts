export interface ParsedToken {
    type: string;
    text: string;
    id: string;
    marker?: string;
    inPara?: string;
    sid?: string;
    level?: string;
    content?: ParsedToken[];
    attributes?: Record<string, string>;
}
