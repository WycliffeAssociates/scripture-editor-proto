import type { WebFileWriteBackend } from "@/web/io/write/WebFileWriteBackend.ts";

function normalizePath(path: string): string {
    return path.startsWith("/") ? path : `/${path}`;
}

function splitPath(path: string): string[] {
    return normalizePath(path).split("/").filter(Boolean);
}

function isNotFoundError(error: unknown): boolean {
    if (error instanceof DOMException) {
        return error.name === "NotFoundError";
    }
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return /not found|enoent|no such file/i.test(message);
}

async function resolveParentAndName(path: string, create: boolean) {
    const parts = splitPath(path);
    const name = parts.pop();
    if (!name) {
        throw new Error(`Invalid file path: ${path}`);
    }

    let dir = await navigator.storage.getDirectory();
    for (const part of parts) {
        dir = await dir.getDirectoryHandle(part, { create });
    }
    return { dir, name };
}

export class NativeOpfsFileWriteBackend implements WebFileWriteBackend {
    async read(path: string): Promise<Uint8Array> {
        try {
            const { dir, name } = await resolveParentAndName(path, false);
            const fileHandle = await dir.getFileHandle(name, { create: false });
            const file = await fileHandle.getFile();
            return new Uint8Array(await file.arrayBuffer());
        } catch (error) {
            if (isNotFoundError(error)) {
                return new Uint8Array(0);
            }
            throw error;
        }
    }

    async write(path: string, bytes: Uint8Array): Promise<void> {
        const { dir, name } = await resolveParentAndName(path, true);
        const fileHandle = await dir.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable({
            keepExistingData: false,
        });
        const stableBytes = new Uint8Array(bytes.length);
        stableBytes.set(bytes);
        await writable.write(stableBytes);
        await writable.close();
    }
}
