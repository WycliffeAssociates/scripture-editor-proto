export type ScriptureChapterRef = {
    bookCode: string;
    chapterNum: number;
};

export type SearchContentNode = {
    sid: string;
    text: string;
};

export type SearchChapter = ScriptureChapterRef & {
    nodes: SearchContentNode[];
};

export type SearchQuery = {
    term: string;
    matchCase: boolean;
    wholeWord: boolean;
};

export type SearchHit = {
    sid: string;
    sidOccurrenceIndex: number;
    bookCode: string;
    chapterNum: number;
    text: string;
    isCaseMismatch: boolean;
    naturalIndex: number;
};
