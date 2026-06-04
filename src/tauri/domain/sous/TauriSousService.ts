import { invoke } from "@tauri-apps/api/core";
import type { ISousService } from "@/core/domain/sous/ISousService.ts";
import type { SousAnalyzeResult } from "@/core/domain/sous/sousTypes.ts";
import type { Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Tauri/native sous service: hands the editor's flat tokens to the
 * `sous_analyze` command, which builds onion's vref projection and runs sous
 * over it in-process (see `src/tauri/rust/src/sous.rs`). The command reads only
 * the fields it needs off each token (id/kind/source/sid/marker) and ignores
 * the rest, so the raw token array serializes straight through.
 */
export class TauriSousService implements ISousService {
    async analyze(tokens: Token[]): Promise<SousAnalyzeResult> {
        return invoke<SousAnalyzeResult>("sous_analyze", { tokens });
    }
}
