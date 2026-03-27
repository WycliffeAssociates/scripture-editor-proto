import { parseSid } from "@/core/data/bible/bible.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Flat USFM tokens do not carry a stable chapter bucket by themselves. Rebuild that
 * grouping from SIDs and explicit chapter markers so downstream compare, history,
 * and search flows can reason chapter-by-chapter.
 */
function chapterFromSid(
    sid: string | null | undefined,
    fallback: number,
): number {
    if (!sid) return fallback;
    return parseSid(sid)?.chapter ?? fallback;
}

/**
 * Groups a flat token stream by chapter number using the strongest signal present
 * on each token.
 */
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
