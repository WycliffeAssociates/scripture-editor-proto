import type { ProjectFingerprintService } from "@/app/domain/cache/ProjectFingerprintService.ts";

type DigestOnlySubtle = {
    digest(
        algorithm: string,
        data: ArrayBuffer | ArrayBufferView,
    ): Promise<ArrayBuffer>;
};

function bytesToHex(bytes: Uint8Array): string {
    return [...bytes]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

async function resolveSubtleCrypto(): Promise<DigestOnlySubtle | null> {
    if (globalThis.crypto?.subtle) {
        return globalThis.crypto.subtle;
    }
    try {
        const nodeCrypto = await import("node:crypto");
        return nodeCrypto.webcrypto.subtle;
    } catch {
        return null;
    }
}

export async function sha1Hex(bytes: Uint8Array): Promise<string> {
    const subtle = await resolveSubtleCrypto();
    if (!subtle) {
        throw new Error(
            "SubtleCrypto is not available for SHA-1 fingerprinting.",
        );
    }
    const digestInput = new Uint8Array(bytes.byteLength);
    digestInput.set(bytes);
    const digest = await subtle.digest("SHA-1", digestInput);
    return bytesToHex(new Uint8Array(digest));
}

export class SubtleSha1FingerprintService implements ProjectFingerprintService {
    async sha1(bytes: Uint8Array): Promise<string> {
        return sha1Hex(bytes);
    }
}
