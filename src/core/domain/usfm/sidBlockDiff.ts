import { diffArrays } from "diff";
import type { SidBlock } from "./sidBlocks.ts";

export type SidBlockDiff = {
    blockId: string;
    semanticSid: string;
    status: "added" | "deleted" | "modified";
    original: SidBlock | null;
    current: SidBlock | null;
    originalText: string;
    currentText: string;
    isWhitespaceChange?: boolean;
};

function stripAllWhitespace(s: string) {
    return s.replace(/\s+/g, "");
}

export function diffSidBlocks(
    originalBlocks: SidBlock[],
    currentBlocks: SidBlock[],
): SidBlockDiff[] {
    const originalSeq = originalBlocks.map((b) => b.blockId);
    const currentSeq = currentBlocks.map((b) => b.blockId);

    const originalById = new Map(originalBlocks.map((b) => [b.blockId, b]));
    const currentById = new Map(currentBlocks.map((b) => [b.blockId, b]));

    const changes = diffArrays(originalSeq, currentSeq);
    const out: SidBlockDiff[] = [];

    for (const change of changes) {
        if (change.added) {
            for (const id of change.value) {
                const cur = currentById.get(id);
                if (!cur) continue;
                out.push({
                    blockId: id,
                    semanticSid: cur.semanticSid,
                    status: "added",
                    original: null,
                    current: cur,
                    originalText: "",
                    currentText: cur.textFull,
                });
            }
            continue;
        }
        if (change.removed) {
            for (const id of change.value) {
                const orig = originalById.get(id);
                if (!orig) continue;
                out.push({
                    blockId: id,
                    semanticSid: orig.semanticSid,
                    status: "deleted",
                    original: orig,
                    current: null,
                    originalText: orig.textFull,
                    currentText: "",
                });
            }
            continue;
        }

        // Common blocks: mark modified if text differs.
        for (const id of change.value) {
            const orig = originalById.get(id);
            const cur = currentById.get(id);
            if (!orig || !cur) continue;
            if (orig.textFull === cur.textFull) continue;

            const originalText = orig.textFull;
            const currentText = cur.textFull;
            const isWhitespaceChange =
                stripAllWhitespace(originalText) ===
                stripAllWhitespace(currentText);

            out.push({
                blockId: id,
                semanticSid: cur.semanticSid,
                status: "modified",
                original: orig,
                current: cur,
                originalText,
                currentText,
                isWhitespaceChange,
            });
        }
    }

    return out;
}
