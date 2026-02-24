import { diffArrays } from "diff";
import type { SidBlock } from "./sidBlocks.ts";

export type SidBlockDiff = {
    blockId: string;
    semanticSid: string;
    status: "added" | "deleted" | "modified" | "unchanged";
    original: SidBlock | null;
    current: SidBlock | null;
    originalText: string;
    currentText: string;
    originalTextOnly: string;
    currentTextOnly: string;
    isWhitespaceChange?: boolean;
    isUsfmStructureChange?: boolean;
};

function stripAllWhitespace(s: string) {
    return s.replace(/\s+/g, "");
}

function stripUsfmMarkersForDisplay(s: string) {
    const withoutMarkers = s
        .replace(/\\[A-Za-z][A-Za-z0-9]*\*/g, "")
        .replace(/\\[A-Za-z][A-Za-z0-9]*/g, "");

    return withoutMarkers.replace(/[ \t]+/g, " ").trim();
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
                    originalTextOnly: "",
                    currentTextOnly: stripUsfmMarkersForDisplay(cur.textFull),
                    isUsfmStructureChange:
                        stripUsfmMarkersForDisplay(cur.textFull).length === 0,
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
                    originalTextOnly: stripUsfmMarkersForDisplay(orig.textFull),
                    currentTextOnly: "",
                    isUsfmStructureChange:
                        stripUsfmMarkersForDisplay(orig.textFull).length === 0,
                });
            }
            continue;
        }

        // Common blocks: mark unchanged/modified by text comparison.
        for (const id of change.value) {
            const orig = originalById.get(id);
            const cur = currentById.get(id);
            if (!orig || !cur) continue;
            if (orig.textFull === cur.textFull) {
                const originalTextOnly = stripUsfmMarkersForDisplay(
                    orig.textFull,
                );
                const currentTextOnly = stripUsfmMarkersForDisplay(
                    cur.textFull,
                );
                out.push({
                    blockId: id,
                    semanticSid: cur.semanticSid,
                    status: "unchanged",
                    original: orig,
                    current: cur,
                    originalText: orig.textFull,
                    currentText: cur.textFull,
                    originalTextOnly,
                    currentTextOnly,
                    isWhitespaceChange: false,
                    isUsfmStructureChange: false,
                });
                continue;
            }

            const originalText = orig.textFull;
            const currentText = cur.textFull;
            const originalTextOnly = stripUsfmMarkersForDisplay(originalText);
            const currentTextOnly = stripUsfmMarkersForDisplay(currentText);
            const isWhitespaceChange =
                stripAllWhitespace(originalText) ===
                stripAllWhitespace(currentText);
            const isUsfmStructureChange =
                !isWhitespaceChange &&
                stripAllWhitespace(originalTextOnly) ===
                    stripAllWhitespace(currentTextOnly);

            out.push({
                blockId: id,
                semanticSid: cur.semanticSid,
                status: "modified",
                original: orig,
                current: cur,
                originalText,
                currentText,
                originalTextOnly,
                currentTextOnly,
                isWhitespaceChange,
                isUsfmStructureChange,
            });
        }
    }

    return out;
}
