export type SidBlock = {
    /** Stable unique id for this sid-run within the chapter. */
    blockId: string;
    /** The semantic SID (e.g. "GEN 1:1"). */
    semanticSid: string;
    /** Start index in the token array. */
    start: number;
    /** End index (exclusive) in the token array. */
    endExclusive: number;
    /** The previous blockId in reading order (used as insertion anchor). */
    prevBlockId: string | null;
    /** Joined USFM text for this block (for UI + modified detection). */
    textFull: string;
};

export type BuildSidBlocksOptions<T> = {
    getSid?: (t: T) => string;
    getText?: (t: T) => string;
    /** Optional stable token id; used to keep block IDs stable under insertions. */
    getId?: (t: T) => string | undefined;
};

/**
 * Build contiguous blocks by runs of the same SID.
 *
 * Block identity favors stability:
 * - If the first token in a block has a stable id, blockId = `${sid}::${id}`
 * - Otherwise, blockId = `${sid}#${occurrenceIndex}` (per-sid occurrence in this chapter)
 */
export function buildSidBlocks<T>(
    tokens: T[],
    options: BuildSidBlocksOptions<T> = {},
): SidBlock[] {
    const getSid = options.getSid ?? ((t: any) => String(t.sid ?? ""));
    const getText = options.getText ?? ((t: any) => String(t.text ?? ""));
    const getId =
        options.getId ??
        ((t: any) => (typeof t.id === "string" ? t.id : undefined));

    if (tokens.length === 0) return [];

    const blocks: SidBlock[] = [];
    const occurrenceBySid = new Map<string, number>();

    let currentSid = getSid(tokens[0]) ?? "";
    let start = 0;
    let prevBlockId: string | null = null;

    const finalize = (endExclusive: number) => {
        const sid = currentSid ?? "";
        const firstTokenId = tokens[start] ? getId(tokens[start]) : undefined;
        let blockId: string;
        if (firstTokenId) {
            blockId = `${sid}::${firstTokenId}`;
        } else {
            const nextOcc = (occurrenceBySid.get(sid) ?? 0) + 1;
            occurrenceBySid.set(sid, nextOcc);
            blockId = `${sid}#${nextOcc - 1}`;
        }

        const textFull = tokens
            .slice(start, endExclusive)
            .map((t) => getText(t))
            .join("");

        blocks.push({
            blockId,
            semanticSid: sid,
            start,
            endExclusive,
            prevBlockId,
            textFull,
        });
        prevBlockId = blockId;
    };

    for (let i = 1; i < tokens.length; i++) {
        const sid = getSid(tokens[i]) ?? "";
        if (sid !== currentSid) {
            finalize(i);
            start = i;
            currentSid = sid;
        }
    }
    finalize(tokens.length);

    return blocks;
}
