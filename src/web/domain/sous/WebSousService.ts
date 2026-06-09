import * as ssc from "scripture-sous-chef-web";
import * as onion from "usfm-onion-web";
import { timeInDevAsync } from "@/app/ui/hooks/utils/domUtils.ts";
import type { ISousService } from "@/core/domain/sous/ISousService.ts";
import type {
    SousAnalyzeResult,
    SousFinding,
    SousSeverity,
} from "@/core/domain/sous/sousTypes.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { SegmentsBySid } from "@/core/domain/usfm/vrefTypes.ts";

/**
 * Web/wasm sous service — the browser twin of {@link TauriSousService}, against
 * the same one-shot `analyze(tokens)` contract.
 *
 * It does in JS what `sous_analyze` (src/tauri/rust/src/sous.rs) does in Rust:
 * build onion's per-verse vref projection from the editor's flat tokens, then
 * run sous over the per-sid text. Two wasm modules cooperate — onion projects
 * (`vrefIndexTokens`), sous analyzes (`analyze_vref`) — so neither the vref
 * aggregate nor the segment map crosses a process boundary; both wasm instances
 * (usfm-onion-web, scripture-sous-chef-web) live in this same JS heap.
 *
 * Both wasm crates already emit UTF-16 offsets at their boundary (onion's
 * `textSpan`, sous's `analyze_vref` via `range.to_utf16`), so no byte→UTF-16
 * conversion happens here — the native path's glue does the same conversion in
 * Rust before serializing.
 */
export class WebSousService implements ISousService {
    async analyze(tokens: Token[]): Promise<SousAnalyzeResult> {
        return timeInDevAsync(async () => {
            const index = onion.vrefIndexTokens(tokens);

            const segments: SegmentsBySid = {};
            const vrefMap: Record<string, string> = {};
            for (const [sid, projection] of Object.entries(index)) {
                // Strip onion's `sourceSpan` (raw-buffer anchor) — the editor
                // resolves ranges by `tokenId` + `textSpan`, matching the
                // SegmentDto the native command serializes.
                segments[sid] = projection.segments.map((segment) => ({
                    tokenId: segment.tokenId,
                    textSpan: segment.textSpan,
                }));
                // Pass every sid through; `analyze_vref` parses sids and skips
                // any that don't resolve, exactly as sous.rs does.
                vrefMap[sid] = projection.text;
            }

            const findings: SousFinding[] = ssc
                .analyze_vref(vrefMap, null)
                .map((finding) => ({
                    sid: finding.sid,
                    code: finding.code,
                    severity: finding.severity as SousSeverity,
                    start: finding.start,
                    end: finding.end,
                    // wasm scores null for binary rules; the JS shape omits it.
                    score: finding.score ?? undefined,
                }));

            return { segments, findings };
        }, "web:sousAnalyze");
    }
}
