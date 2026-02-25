import { type BuildSidBlocksOptions, buildSidBlocks } from "./sidBlocks.ts";

export type ApplyRevertArgs<T extends object> = {
    diffBlockId: string;
    baselineTokens: T[];
    currentTokens: T[];
    buildOptions?: BuildSidBlocksOptions<T>;
};

function deepCloneSlice<T extends object>(slice: T[]): T[] {
    // structuredClone preserves object graphs and is available in modern runtimes.
    return slice.map((x) => structuredClone(x));
}

/**
 * Revert a single block diff by splicing the *token stream*.
 *
 * This is mode-agnostic: callers adapt to/from any editor tree format.
 */
export function applyRevertByBlockId<T extends object>({
    diffBlockId,
    baselineTokens,
    currentTokens,
    buildOptions,
}: ApplyRevertArgs<T>): T[] {
    const baselineBlocks = buildSidBlocks(baselineTokens, buildOptions);
    const currentBlocks = buildSidBlocks(currentTokens, buildOptions);

    const baselineById = new Map(baselineBlocks.map((b) => [b.blockId, b]));
    const currentById = new Map(currentBlocks.map((b) => [b.blockId, b]));

    const baseline = baselineById.get(diffBlockId) ?? null;
    const current = currentById.get(diffBlockId) ?? null;
    const baselineOrSidMatch =
        baseline ??
        inferSidMatchBlock({
            diffBlockId,
            blocks: baselineBlocks,
        });
    const currentOrSidMatch =
        current ??
        inferSidMatchBlock({
            diffBlockId,
            blocks: currentBlocks,
        });

    const next = [...currentTokens];

    // Added: remove current slice.
    if (!baselineOrSidMatch && currentOrSidMatch) {
        next.splice(
            currentOrSidMatch.start,
            currentOrSidMatch.endExclusive - currentOrSidMatch.start,
        );
        return next;
    }

    // Deleted: insert baseline slice (best-effort anchor).
    if (baselineOrSidMatch && !currentOrSidMatch) {
        const baselineSlice = baselineTokens.slice(
            baselineOrSidMatch.start,
            baselineOrSidMatch.endExclusive,
        );
        let insertionIndex = 0;
        let anchorId: string | null = baselineOrSidMatch.prevBlockId;

        while (anchorId) {
            const anchorInCurrent = currentById.get(anchorId);
            if (anchorInCurrent) {
                insertionIndex = anchorInCurrent.endExclusive;
                break;
            }
            const prevInBaseline = baselineById.get(anchorId);
            anchorId = prevInBaseline?.prevBlockId ?? null;
        }

        next.splice(insertionIndex, 0, ...deepCloneSlice(baselineSlice));
        return next;
    }

    // Modified: replace current slice with baseline slice.
    if (baselineOrSidMatch && currentOrSidMatch) {
        const baselineSlice = baselineTokens.slice(
            baselineOrSidMatch.start,
            baselineOrSidMatch.endExclusive,
        );
        next.splice(
            currentOrSidMatch.start,
            currentOrSidMatch.endExclusive - currentOrSidMatch.start,
            ...deepCloneSlice(baselineSlice),
        );
        return next;
    }

    // Nothing to do (unknown block id).
    return next;
}

function inferSidMatchBlock<T extends object>(args: {
    diffBlockId: string;
    blocks: Array<{ blockId: string; semanticSid: string } & T>;
}) {
    const sid = extractSidFromBlockId(args.diffBlockId);
    if (!sid) return null;
    return args.blocks.find((block) => block.semanticSid === sid) ?? null;
}

function extractSidFromBlockId(blockId: string): string | null {
    if (!blockId) return null;
    const byIdIdx = blockId.indexOf("::");
    if (byIdIdx >= 0) return blockId.slice(0, byIdIdx);
    const byOccIdx = blockId.lastIndexOf("#");
    if (byOccIdx >= 0) return blockId.slice(0, byOccIdx);
    return blockId;
}
