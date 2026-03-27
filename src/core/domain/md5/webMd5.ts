import { MD5 } from "crypto-es";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";

/**
 * Browser implementation of the shared checksum seam.
 */
class WebMd5Service implements IMd5Service {
    /**
     * Hash text content inside the browser runtime.
     */
    async calculateMd5(text: string): Promise<string> {
        return MD5(text).toString();
    }
}

export const webMd5Service = new WebMd5Service();
