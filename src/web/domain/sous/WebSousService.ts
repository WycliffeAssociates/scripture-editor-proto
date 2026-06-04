import type { ISousService } from "@/core/domain/sous/ISousService.ts";
import type { SousAnalyzeResult } from "@/core/domain/sous/sousTypes.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Web/wasm sous service — DEFERRED to Phase 3c. The client-side path needs
 * local wasm builds of onion (with `vrefIndexTokens`) and sous (`analyze_vref`)
 * `file:`-dep'd; until those are wired it returns empty results so the web
 * build runs (no content findings) instead of crashing the parallel pipeline.
 */
export class WebSousService implements ISousService {
    async analyze(_tokens: Token[]): Promise<SousAnalyzeResult> {
        return { segments: {}, findings: [] };
    }
}
