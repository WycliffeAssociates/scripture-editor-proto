export interface ProjectFingerprintService {
    sha1(bytes: Uint8Array): Promise<string>;
}
