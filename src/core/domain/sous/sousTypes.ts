// sousTypes.ts
//
// JS-facing scripture-sous-chef shapes. sous is a pure `text -> ranges` content
// analyzer fed onion's vref projection; on the wire (Tauri command / wasm) a
// Finding is byte→UTF-16 converted at the boundary, so offsets here are UTF-16
// code units — the same space as `Utf16Span` / `resolveContentRange`.

import type { DecodedFinding } from "scripture-sous-chef-web/findings";

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
  /** Official decoded record retained for reconciliation identity/metadata. */
  snapshotFinding?: DecodedFinding;
};

/**
 * The materialized Galley snapshot shape used by the editor annotation
 * pipeline: the VREF segment map plus findings decoded from packed bytes.
 */
export type SousAnalyzeResult = {
  segments: SegmentsBySid;
  findings: SousFinding[];
};
