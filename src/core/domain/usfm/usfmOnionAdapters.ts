import type { BuildSidBlocksOptions } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Small adapter defaults that keep app-side callers aligned with the USFM Onion
 * service expectations.
 */
export function defaultBuildSidBlocksOptions(): BuildSidBlocksOptions {
  return { allowEmptySid: true };
}
