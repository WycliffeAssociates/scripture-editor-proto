// sousTypes.ts
//
// JS-facing scripture-sous-chef shapes. sous is a pure `text -> ranges` content
// analyzer fed onion's vref projection; on the wire (Tauri command / wasm) a
// Finding is byte→UTF-16 converted at the boundary, so offsets here are UTF-16
// code units — the same space as `Utf16Span` / `resolveContentRange`.

import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

/** sous severities are already lowercase and 1:1 with `Finding`. */
export type SousSeverity = "error" | "warning" | "info";

/** One content anomaly. `code` is a sous `RuleId` (e.g. `lex.excess-h-whitespace`). */
export type SousFinding = {
  sid: string;
  code: string;
  severity: SousSeverity;
  /** UTF-16 offsets into the verse's projected text. */
  start: number;
  end: number;
  /** Confidence, when the rule scores; undefined for binary rules. */
  score?: number;
};

/**
 * What `ISousService.analyze` returns: the vref segment map (so the editor can
 * resolve each finding's range to DOM rects) AND the findings over it. Both
 * come from one pass — onion builds the projection, sous analyzes its text.
 */
export type SousAnalyzeResult = {
  segments: SegmentsBySid;
  findings: SousFinding[];
};
