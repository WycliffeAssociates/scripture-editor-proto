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
 *
 * The verse→token segment map deliberately does NOT travel: main derives it
 * from the tokens it is drawing (`annotations/vrefProjection.ts`), which is
 * both cheaper and the only version guaranteed to match the DOM.
 */
export type GalleyAnalysis = {
  packed: ArrayBuffer;
  keys: string[];
  cacheState: "fresh" | "persisted";
  expectedIdentity?: GalleyCacheIdentity;
};
