// vrefTypes.ts
//
// The vref_index addressing substrate, mirrored from onion's `vref` module
// (Segment / Utf16Span / VerseProjection). onion is the segmenter of record;
// these are the JS-facing shapes its `vrefIndexTokens`/`tokens_to_vref_index`
// projection serializes into, consumed here to resolve a content finding's
// `(sid, Utf16Span)` to DOM rects (see `resolveContentRange`).
//
// Source-agnostic on purpose: the annotation model and the editor's range
// resolver depend on these, not on sous or onion package types directly.

/** UTF-16 code-unit range into a verse projection's text. */
export type Utf16Span = { start: number; end: number };

/**
 * One text-token slice of a verse's projected plain text. `textSpan` is where
 * this token's text falls in the projection (UTF-16); `tokenId` is the editor
 * `data-id` carrying it. Marker tokens are NOT segments — which is why usfm
 * mode skips markers "for free" when resolving a range.
 */
export type Segment = {
    tokenId: string;
    textSpan: Utf16Span;
};

/** Ordered segments per sid (verse), the per-sid projection onion emits. */
export type SegmentsBySid = Record<string, Segment[]>;
