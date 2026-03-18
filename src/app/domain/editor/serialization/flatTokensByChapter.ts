import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

function chapterFromSid(
    sid: string | null | undefined,
    fallback: number,
): number {
    if (!sid) return fallback;
    const parts = sid.split(/\s+/, 2);
    if (parts.length < 2) return fallback;
    const chapterPart = parts[1]?.split(":")[0] ?? "";
    return Number.parseInt(chapterPart, 10) || fallback;
}

export function groupFlatTokensByChapter(
    tokens: Token[],
): Record<number, Token[]> {
    const chapters: Record<number, Token[]> = {};
    let currentChapter = 0;

    for (const token of tokens) {
        if (token.marker === "c" && token.kind === "marker") {
            const nextChapter = Number.parseInt(
                tokens.find(
                    (candidate) =>
                        (candidate.span?.start ?? -1) >=
                            (token.span?.end ?? Number.MAX_SAFE_INTEGER) &&
                        candidate.kind === "number",
                )?.text ?? "",
                10,
            );
            if (Number.isFinite(nextChapter) && nextChapter > 0) {
                currentChapter = nextChapter;
            } else {
                currentChapter = chapterFromSid(token.sid, currentChapter);
            }
        } else {
            currentChapter = chapterFromSid(token.sid, currentChapter);
        }

        chapters[currentChapter] ??= [];
        chapters[currentChapter].push(token);
    }

    return chapters;
}
