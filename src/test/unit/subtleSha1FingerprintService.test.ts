import { describe, expect, it } from "vitest";
import { SubtleSha1FingerprintService } from "@/app/domain/cache/SubtleSha1FingerprintService.ts";

describe("SubtleSha1FingerprintService", () => {
    it("returns lowercase SHA-1 hex", async () => {
        const service = new SubtleSha1FingerprintService();
        const checksum = await service.sha1(new TextEncoder().encode("abc"));
        expect(checksum).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    });
});
