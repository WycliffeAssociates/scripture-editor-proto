import { IMd5Service } from "@/src-core/domain/md5/IMd5Service.ts";
import { invoke } from "@tauri-apps/api/core";

export class TauriMd5Service implements IMd5Service {
    async calculateMd5(text: string): Promise<string> {
        // Calls the Rust command 'calculate_md5'
        return invoke("calculate_md5", { text });
    }
}
