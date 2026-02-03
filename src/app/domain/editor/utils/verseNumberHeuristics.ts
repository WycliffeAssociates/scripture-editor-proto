export type VerseNumberRange = { start: number; end: number };

export type VerseNumberTokenLike = {
    tokenType: string;
    marker?: string;
    text: string;
};

export function parseVerseNumberRange(raw: string): VerseNumberRange | null {
    const text = raw.trim();
    if (!text) return null;

    const match = text.match(/^(\d+)(?:\s*[-–]\s*(\d+))?/);
    if (!match) return null;

    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    return { start, end };
}

export function deriveVerseNumberForInsertionFromTokens(args: {
    tokens: VerseNumberTokenLike[];
    anchorIndex: number;
}): string {
    const { tokens, anchorIndex } = args;
    if (anchorIndex < 0 || anchorIndex >= tokens.length) return "1";

    const findPrevVerse = (): VerseNumberRange | null => {
        for (let i = anchorIndex - 1; i >= 0; i--) {
            const t = tokens[i];
            if (t.tokenType !== "marker") continue;
            if (t.marker !== "v") continue;

            const maybeNum = tokens[i + 1];
            if (!maybeNum) return null;
            if (maybeNum.tokenType !== "numberRange") continue;
            return parseVerseNumberRange(maybeNum.text);
        }
        return null;
    };

    const findNextVerse = (): VerseNumberRange | null => {
        for (let i = anchorIndex + 1; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.tokenType !== "marker") continue;
            if (t.marker !== "v") continue;

            const maybeNum = tokens[i + 1];
            if (!maybeNum) return null;
            if (maybeNum.tokenType !== "numberRange") continue;
            return parseVerseNumberRange(maybeNum.text);
        }
        return null;
    };

    const prev = findPrevVerse();
    const next = findNextVerse();

    if (prev && next) return String(prev.end + 1);
    if (prev && !next) return String(prev.end + 1);
    if (!prev && next) return String(Math.max(1, next.start - 1));
    return "1";
}
