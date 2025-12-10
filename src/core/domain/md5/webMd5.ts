import { MD5 } from "crypto-es";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";

export class WebMd5Service implements IMd5Service {
    /**
     * @method calculateMd5
     * @description Calculates the MD5 checksum of a given text string.
     * @param text - The input string for which to calculate the MD5 checksum.
     * @returns A Promise that resolves to the MD5 checksum as a lowercase hexadecimal string.
     */
    async calculateMd5(text: string): Promise<string> {
        return MD5(text).toString();
    }
}

// Export the service instance as a singleton
export const webMd5Service = new WebMd5Service();
