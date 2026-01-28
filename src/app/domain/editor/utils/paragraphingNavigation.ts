import { $dfsIterator } from "@lexical/utils";
import { $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { UsfmTokenTypes } from "@/app/data/editor.ts";
import {
    $isUSFMTextNode,
    type USFMTextNode,
} from "@/app/domain/editor/nodes/USFMTextNode.ts";
import { parseSid } from "@/core/data/bible/bible.ts";

type NextMarkerHint = {
    type: string;
    sid?: string;
    contextText?: string;
};

type TextSegment = {
    node: USFMTextNode;
    text: string;
    startIndex: number;
    baseOffset: number;
};

function normalizeSidToVerseStartSid(sid?: string): string | null {
    if (!sid) return null;
    const parsed = parseSid(sid);
    if (!parsed) return null;
    const verseStart = parsed.verseStart ?? parsed.verseEnd ?? 0;
    if (!verseStart) return null;
    return `${parsed.book} ${parsed.chapter}:${verseStart}`;
}

function isVerseMarkerNode(node: USFMTextNode): boolean {
    return (
        node.getTokenType() === UsfmTokenTypes.marker &&
        node.getMarker() === "v"
    );
}

function findVerseMarkerNodeBySid(verseStartSid: string): USFMTextNode | null {
    const parsedTarget = parseSid(verseStartSid);
    const targetChapter = parsedTarget?.chapter ?? null;
    const targetVerse =
        parsedTarget?.verseStart ?? parsedTarget?.verseEnd ?? null;

    let currentChapter: number | null = null;

    for (const dfs of $dfsIterator()) {
        const node = dfs.node;
        if (!$isUSFMTextNode(node)) continue;

        // Track chapter context (fallback path)
        if (
            node.getTokenType() === UsfmTokenTypes.marker &&
            node.getMarker() === "c"
        ) {
            const next = node.getNextSibling();
            if (
                $isUSFMTextNode(next) &&
                next.getTokenType() === UsfmTokenTypes.numberRange
            ) {
                const chap = Number.parseInt(next.getTextContent().trim(), 10);
                if (!Number.isNaN(chap)) currentChapter = chap;
            }
        }

        // Best signal: numberRange for the verse usually carries the verse SID.
        if (
            node.getTokenType() === UsfmTokenTypes.numberRange &&
            node.getSid() === verseStartSid
        ) {
            const prev = node.getPreviousSibling();
            if ($isUSFMTextNode(prev) && isVerseMarkerNode(prev)) {
                return prev;
            }
        }

        // Fallback: some tokenizers may only apply SID to text nodes.
        if (
            node.getTokenType() === UsfmTokenTypes.text &&
            node.getSid() === verseStartSid
        ) {
            let curr = node.getPreviousSibling();
            while (curr) {
                if ($isUSFMTextNode(curr) && isVerseMarkerNode(curr))
                    return curr;
                if (curr.getType() === "linebreak") break;
                curr = curr.getPreviousSibling();
            }
        }

        // Final fallback: match by chapter + verse numberRange text.
        if (
            targetChapter !== null &&
            targetVerse !== null &&
            currentChapter === targetChapter &&
            isVerseMarkerNode(node)
        ) {
            const next = node.getNextSibling();
            if (
                $isUSFMTextNode(next) &&
                next.getTokenType() === UsfmTokenTypes.numberRange
            ) {
                const txt = next.getTextContent().trim();
                if (txt && txt.startsWith(String(targetVerse))) {
                    return node;
                }
            }
        }
    }

    return null;
}

function getPunctuationCandidates(contextText?: string): string[] {
    const base = [";", ":", ".", ",", "?", "!", "।", "॥"];

    // Filter down to punctuation actually present in contextText (when available)
    if (!contextText) return base;
    const present = base.filter((c) => contextText.includes(c));
    return present.length ? present : base;
}

function buildForwardTextSegmentsFromSelection(maxChars: number): {
    sid: string | null;
    segments: TextSegment[];
    combinedText: string;
} {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return { sid: null, segments: [], combinedText: "" };
    }

    const anchor = selection.anchor.getNode();
    const anchorOffset = selection.anchor.offset;
    let startNode: USFMTextNode | null = null;

    if ($isUSFMTextNode(anchor)) {
        startNode = anchor;
    } else if ($isTextNode(anchor)) {
        const parent = anchor.getParent();
        if (parent && $isUSFMTextNode(parent)) startNode = parent;
    }

    if (!startNode) return { sid: null, segments: [], combinedText: "" };

    const sid = startNode.getSid() || null;
    if (!sid) return { sid: null, segments: [], combinedText: "" };

    const segments: TextSegment[] = [];
    let combinedText = "";
    let total = 0;
    let didApplyFirstSlice = false;
    let started = false;

    for (const dfs of $dfsIterator()) {
        const node = dfs.node;
        if (!$isUSFMTextNode(node)) continue;

        if (!started) {
            if (node.is(startNode)) {
                started = true;
            } else {
                continue;
            }
        }

        const nodeSid = node.getSid();
        if (nodeSid && nodeSid !== sid) break;

        if (node.getTokenType() !== UsfmTokenTypes.text) continue;

        const raw = node.getTextContent();
        let baseOffset = 0;
        let text = raw;

        // If we're starting inside a text node, begin scanning from the caret.
        if (!didApplyFirstSlice && node.is(startNode)) {
            baseOffset = Math.max(0, Math.min(anchorOffset, raw.length));
            text = raw.slice(baseOffset);
            didApplyFirstSlice = true;
        }
        if (!text) continue;

        const remaining = maxChars - total;
        if (remaining <= 0) break;

        const slice = text.length > remaining ? text.slice(0, remaining) : text;
        segments.push({
            node,
            text: slice,
            startIndex: combinedText.length,
            baseOffset,
        });
        combinedText += slice;
        total += slice.length;
        if (total >= maxChars) break;
    }

    return { sid, segments, combinedText };
}

function findIndexAfterPunctuationOrCapital(args: {
    text: string;
    punctuationCandidates: string[];
}): number | null {
    const { text, punctuationCandidates } = args;
    if (!text) return null;

    // 1) punctuation match
    let bestIdx: number | null = null;
    let bestLen = 0;
    for (const p of punctuationCandidates) {
        if (!p) continue;
        const idx = text.indexOf(p);
        if (idx === -1) continue;
        if (bestIdx === null || idx < bestIdx) {
            bestIdx = idx;
            bestLen = p.length;
        }
    }

    if (bestIdx !== null) {
        let i = bestIdx + bestLen;
        while (i < text.length && /\s/.test(text[i])) i++;
        return i;
    }

    // 2) nearest capital letter
    const cap = /(?:^|[\s"'([{\u2018\u201C])([A-Z])/g;
    const match = cap.exec(text);
    if (match?.index !== undefined) {
        return match.index + match[0].length - 1; // index of captured capital
    }

    return null;
}

function selectByCombinedIndex(segments: TextSegment[], combinedIndex: number) {
    if (!segments.length) return;
    for (const seg of segments) {
        const end = seg.startIndex + seg.text.length;
        if (combinedIndex <= end) {
            const offset = Math.max(
                0,
                Math.min(seg.text.length, combinedIndex - seg.startIndex),
            );
            const realOffset = seg.baseOffset + offset;
            seg.node.select(realOffset, realOffset);
            return;
        }
    }

    // Fallback to end of last segment
    const last = segments[segments.length - 1];
    const endOffset = last.baseOffset + last.text.length;
    last.node.select(endOffset, endOffset);
}

export function jumpCursorForNextParagraphingMarker(
    nextMarker: NextMarkerHint,
): boolean {
    const isContinuationPoetry =
        /^q\d+$/.test(nextMarker.type) && nextMarker.type !== "q1";

    // Heuristic 1: Jump to verse marker for SID block start (best for \p, \q1, etc.)
    if (!isContinuationPoetry) {
        const normalizedSid = normalizeSidToVerseStartSid(nextMarker.sid);
        if (normalizedSid) {
            const verseMarker = findVerseMarkerNodeBySid(normalizedSid);
            if (verseMarker) {
                verseMarker.select(0, 0);
                return true;
            }
        }
    }

    // Heuristic 2: Punctuation / capital letter scan forward in current SID
    const { segments, combinedText } =
        buildForwardTextSegmentsFromSelection(800);
    if (!segments.length || !combinedText) return false;

    const punctuationCandidates = getPunctuationCandidates(
        nextMarker.contextText,
    );
    const idx = findIndexAfterPunctuationOrCapital({
        text: combinedText,
        punctuationCandidates,
    });
    if (idx === null) return false;

    selectByCombinedIndex(segments, idx);
    return true;
}
