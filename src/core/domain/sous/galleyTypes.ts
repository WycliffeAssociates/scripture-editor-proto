import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

export type GalleyCacheIdentity = {
  analysisId: string;
  targetContextId: string;
  hasReference: boolean;
};

/** The resident Galley mutation result shared by web and native hosts. */
export type GalleyMutationEffect = "changed" | "unchanged";

/**
 * The transport payload produced by a resident Galley pass.
 *
 * Findings remain packed until the main thread deliberately decodes them.
 * `keys` is the exact ordered corpus key array used to construct Galley; it
 * must travel beside the bytes because the wire records address keys by index.
 */
export type GalleyAnalysis = {
  packed: ArrayBuffer;
  keys: string[];
  segments: SegmentsBySid;
  cacheState: "fresh" | "persisted";
  expectedIdentity?: GalleyCacheIdentity;
};
