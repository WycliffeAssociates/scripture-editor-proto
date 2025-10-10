import { IMd5Service } from "@/src-core/domain/md5/IMd5Service.ts";
import { invoke } from "@tauri-apps/api/core";

/**
 * @class TauriMd5Service
 * @implements {IMd5Service}
 * @description Concrete implementation of IMd5Service for Tauri. It leverages Tauri's `invoke`
 *              function to call a Rust backend command for MD5 checksum calculation.
 */
export class TauriMd5Service implements IMd5Service {
    /**
     * @method calculateMd5
     * @description Calculates the MD5 checksum of a given text string by invoking a Tauri command.
     * @param text - The input string for which to calculate the MD5 checksum.
     * @returns A Promise that resolves to the MD5 checksum as a hexadecimal string.
     */
    async calculateMd5(text: string): Promise<string> {
        return invoke("calculate_md5", { text });
    }
}
