import type { SousAnalyzeResult } from "@/core/domain/sous/sousTypes.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Async boundary for scripture-sous-chef content analysis — the sibling of
 * {@link IUsfmOnionService}. Kept async even where a backend is synchronous
 * (web/wasm) so Tauri/native and web callers share one contract.
 *
 * `analyze` hides the vref-build: it takes a flat token array, builds onion's
 * vref projection, runs sous over the per-sid text, and returns both the
 * segment map (for `resolveContentRange`) and the findings. Co-locating the
 * vref build here is fine — sous is its only consumer today; promote vref to a
 * shared concern only if a second appears.
 */
export interface ISousService {
  analyze(tokens: Token[]): Promise<SousAnalyzeResult>;
}
