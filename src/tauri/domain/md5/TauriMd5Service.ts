import { invoke } from "@tauri-apps/api/core";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";

/**
 * Desktop implementation of the shared MD5 seam.
 *
 * Upstream code uses this when it needs stable content fingerprints for indexing
 * or change detection, but it should not care whether hashing happens in browser
 * JavaScript or a desktop-native backend.
 */
export class TauriMd5Service implements IMd5Service {
    /**
     * Delegate hashing to the Rust backend so desktop and web can share one
     * app-facing checksum contract.
     */
    async calculateMd5(text: string): Promise<string> {
        // Arg key must match the Rust command parameter name (`input`), not the
        // local `text` — Tauri rejects the call otherwise ("missing required
        // key input").
        return invoke("calculate_md5", { input: text });
    }
}
