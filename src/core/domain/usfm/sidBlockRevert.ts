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

    const next = [...currentTokens];

    // Added: remove current slice.
    if (!baseline && current) {
        next.splice(current.start, current.endExclusive - current.start);
        return next;
    }

    // Deleted: insert baseline slice (best-effort anchor).
    if (baseline && !current) {
        const baselineSlice = baselineTokens.slice(
            baseline.start,
            baseline.endExclusive,
        );
        let insertionIndex = 0;
        let anchorId: string | null = baseline.prevBlockId;

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
    if (baseline && current) {
        const baselineSlice = baselineTokens.slice(
            baseline.start,
            baseline.endExclusive,
        );
        next.splice(
            current.start,
            current.endExclusive - current.start,
            ...deepCloneSlice(baselineSlice),
        );
        return next;
    }

    // Nothing to do (unknown block id).
    return next;
}
