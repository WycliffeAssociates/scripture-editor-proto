import type { WebFileWriteBackend } from "@/web/io/write/WebFileWriteBackend.ts";
import type { WebZenFsRuntime } from "@/web/zenfs/WebZenFsRuntime.ts";

function dirname(path: string): string {
    const idx = path.lastIndexOf("/");
    if (idx <= 0) return "/";
    return path.slice(0, idx);
}

function isNotFoundError(error: unknown): boolean {
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return /not found|enoent|no such file/i.test(message);
}

export class ZenFsFileWriteBackend implements WebFileWriteBackend {
    constructor(private readonly runtime: WebZenFsRuntime) {}

    async read(path: string): Promise<Uint8Array> {
        await this.runtime.ensureReady();
        try {
            const result = await this.runtime.fs.promises.readFile(path);
            return result instanceof Uint8Array
                ? result
                : new Uint8Array(result);
        } catch (error) {
            if (isNotFoundError(error)) {
                return new Uint8Array(0);
            }
            throw error;
        }
    }

    async write(path: string, bytes: Uint8Array): Promise<void> {
        await this.runtime.ensureReady();
        await this.runtime.fs.promises.mkdir(dirname(path), {
            recursive: true,
        });
        try {
            await this.runtime.fs.promises.rm(path);
        } catch (error) {
            if (!isNotFoundError(error)) {
                throw error;
            }
        }
        await this.runtime.fs.promises.writeFile(path, bytes);
    }
}
