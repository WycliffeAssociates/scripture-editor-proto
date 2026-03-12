export type LegacyLintError = {
    message: string;
    sid: string;
    msgKey: string;
    nodeId: string;
    fix?: unknown;
};

export type LegacyLintableToken = {
    text: string;
    tokenType: string;
    sid?: string;
    marker?: string;
    lintErrors?: Array<LegacyLintError>;
    isParaMarker?: boolean;
    isSyntheticParaMarker?: boolean;
    inPara?: string;
    inChars?: Array<string>;
    id: string;
    content?: Array<LegacyLintableToken>;
    attributes?: Record<string, string>;
};
