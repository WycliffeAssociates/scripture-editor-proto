// resolveContentRange.ts
//
// The new addressing primitive behind content findings. A finding anchors as
// `(sid, Utf16Span)` into a verse's projected text; the editor is a
// DOM-resolving consumer keyed by SID — it asks onion's vref_index "which text
// tokens carry this sid's text, and where in each does this UTF-16 range fall",
// never offsetting into a source it doesn't hold.
//
//   1. segments = segmentsBySid[sid]            // ordered, each {tokenId, textSpan}
//   2. for each segment overlapping the range:
//        intra = clamp(range) - segment.textSpan.start         // UTF-16, no conversion
//        el = root.querySelector([data-id=tokenId])
//        walk el's descendant text nodes accumulating UTF-16 length to map
//        intra -> (node, offset)  // NEVER assume .firstChild — Lexical splits nodes
//        Range.setStart/setEnd -> getClientRects()
//   3. union the per-segment rects; collect the covered token-ids
//
// Why per-segment Ranges (not one start->end Range): segments are text-token
// only, so marker tokens between them are never resolved — usfm mode skips
// markers "for free". Aligned text (each \w word + each inter-word space its own
// text token → its own segment) works unchanged, by not throwing info away.

import type { SegmentsBySid, Utf16Span } from "@/core/domain/usfm/vrefTypes.ts";

/** Overlay-space rect (root-relative), matching `FindingsOverlayPlugin`. */
export type OverlayRect = {
    left: number;
    top: number;
    width: number;
    height: number;
};

export type ResolvedContentRange = {
    rects: OverlayRect[];
    touchedTokenIds: string[];
};

/**
 * Map a UTF-16 offset within an element's text to a (Text node, offset) pair,
 * walking descendant text nodes and accumulating their UTF-16 length.
 *
 * Load-bearing: Lexical splits/merges `TextNode`s on edits/IME/selection, so we
 * must NEVER assume `el.firstChild` is the only/whole text. `string.length` is
 * already UTF-16 code units, so no conversion is needed. Returns null if the
 * element has no text or the offset is past its end.
 */
export function locateUtf16Offset(
    el: Element,
    offset: number,
): { node: Text; offset: number } | null {
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let last: Text | null = null;
    let node = walker.nextNode() as Text | null;
    while (node) {
        const len = node.data.length;
        // `<=` so a boundary offset lands at the end of THIS node rather than
        // failing to find the (possibly absent) next node.
        if (offset <= acc + len) {
            return { node, offset: offset - acc };
        }
        acc += len;
        last = node;
        node = walker.nextNode() as Text | null;
    }
    // Offset exactly at the total end.
    if (last && offset === acc) return { node: last, offset: last.data.length };
    return null;
}

function makeIntraTokenRange(
    el: Element,
    startOffset: number,
    endOffset: number,
): Range | null {
    const start = locateUtf16Offset(el, startOffset);
    const end = locateUtf16Offset(el, endOffset);
    if (!start || !end) return null;
    const range = el.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
}

function tokenElement(root: HTMLElement, tokenId: string): HTMLElement | null {
    const escaped =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(tokenId)
            : tokenId.replace(/["\\]/g, "\\$&");
    const el = root.querySelector(`[data-id="${escaped}"]`);
    return el instanceof HTMLElement ? el : null;
}

/**
 * Resolve a content finding's `(sid, range)` to overlay rects + the token-ids
 * it covers. Rects use the same root-relative convention as the lint highlight
 * layer (so both ride one overlay). `touchedTokenIds` feeds the hover zip.
 */
export function resolveContentRange(
    sid: string,
    range: Utf16Span,
    segmentsBySid: SegmentsBySid,
    root: HTMLElement,
): ResolvedContentRange {
    const segments = segmentsBySid[sid];
    if (!segments || range.end <= range.start) {
        return { rects: [], touchedTokenIds: [] };
    }

    const rootRect = root.getBoundingClientRect();
    const offsetLeft = root.clientLeft;
    const offsetTop = root.clientTop;
    const rects: OverlayRect[] = [];
    const touchedTokenIds: string[] = [];

    for (const segment of segments) {
        const start = Math.max(range.start, segment.textSpan.start);
        const end = Math.min(range.end, segment.textSpan.end);
        if (end <= start) continue; // range doesn't touch this segment

        const el = tokenElement(root, segment.tokenId);
        if (!el) continue;

        const domRange = makeIntraTokenRange(
            el,
            start - segment.textSpan.start,
            end - segment.textSpan.start,
        );
        if (!domRange) continue;

        touchedTokenIds.push(segment.tokenId);
        // getClientRects is browser-only (absent under jsdom, where there's no
        // layout anyway). The touched-token set above still resolves there.
        const clientRects = domRange.getClientRects?.() ?? [];
        for (const r of Array.from(clientRects)) {
            if (r.width <= 0 || r.height <= 0) continue;
            rects.push({
                left: r.left - rootRect.left + root.scrollLeft - offsetLeft,
                top: r.top - rootRect.top + root.scrollTop - offsetTop,
                width: r.width,
                height: r.height,
            });
        }
    }

    return { rects, touchedTokenIds };
}
