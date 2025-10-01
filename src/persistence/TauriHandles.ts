// TauriHandles.ts

import { join } from "@tauri-apps/api/path";
import {
    type DirEntry,
    mkdir,
    readDir,
    readTextFile,
    remove,
    writeTextFile,
} from "@tauri-apps/plugin-fs";

/* ------------------------- Utilities ------------------------- */

const normalize = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
const splitPath = (p: string) => normalize(p).split("/").filter(Boolean);

/* ---------------------- Directory Handle --------------------- */

export class TauriDirectoryHandle implements FileSystemDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    readonly path: string;

    constructor(path: string) {
        this.path = normalize(path);
        this.name = this.path.split("/").pop() || this.path;
    }

    async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<TauriDirectoryHandle> {
        const dirPath = await join(this.path, name);
        if (opts?.create) await mkdir(dirPath, { recursive: true });
        return new TauriDirectoryHandle(dirPath);
    }

    async getFileHandle(name: string, opts?: { create?: boolean }): Promise<TauriFileHandle> {
        const filePath = await join(this.path, name);
        if (opts?.create) {
            await mkdir(this.path, { recursive: true });
            try {
                await readTextFile(filePath);
            } catch {
                await writeTextFile(filePath, "");
            }
        }
        return new TauriHandles(filePath);
    }

    async removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void> {
        const targetPath = await join(this.path, name);
        await remove(targetPath, { recursive: !!opts?.recursive }).catch((e) => {
            const msg = String((e as any)?.message || "");
            if (!/not found|no such file|does not exist/i.test(msg)) throw e;
        });
    }

    async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
        const items: DirEntry[] = await readDir(this.path).catch(() => []);
        for (const item of items) {
            const childPath = await join(this.path, item.name);
            if (item.isDirectory) {
                yield [item.name, new TauriDirectoryHandle(childPath)];
            } else {
                yield [item.name, new TauriFileHandle(childPath)];
            }
        }
    }

    async *keys(): AsyncIterableIterator<string> {
        for await (const [name] of this.entries()) yield name;
    }

    async *values(): AsyncIterableIterator<FileSystemHandle> {
        for await (const [, handle] of this.entries()) yield handle;
    }

    [Symbol.asyncIterator]() {
        return this.entries();
    }

    async resolve(other: FileSystemHandle): Promise<string[] | null> {
        const otherPath = (other as any)?.path;
        if (!otherPath || typeof otherPath !== "string") return null;
        const base = normalize(this.path);
        const cmp = normalize(otherPath);

        if (base === cmp) return [];
        const baseWithSlash = base.endsWith("/") ? base : base + "/";
        if (!cmp.startsWith(baseWithSlash)) return null;

        return cmp.slice(baseWithSlash.length).split("/").filter(Boolean);
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return (other as any)?.path === this.path;
    }
}

/* ------------------------------ File Handle ------------------------------ */

export class TauriFileHandle implements FileSystemFileHandle {
    kind: "file" = "file";
    name: string;
    readonly path: string;

    constructor(path: string) {
        this.path = normalize(path);
        this.name = this.path.split("/").pop() || this.path;
    }

    async getFile(): Promise<File> {
        const text = await readTextFile(this.path).catch((e) => {
            const msg = String((e as any)?.message || "");
            if (/not found|no such file|does not exist/i.test(msg)) {
                return "";
            }
            throw e;
        });
        return new File([text], this.name);
    }

    async createWritable(): Promise<FileSystemWritableFileStream> {
        let buffer: Uint8Array;
        try {
            const existing = await readTextFile(this.path);
            buffer = new TextEncoder().encode(existing);
        } catch {
            buffer = new Uint8Array(0);
        }
        let position = buffer.length;

        const ensureCapacity = (needed: number) => {
            if (needed <= buffer.length) return;
            const nb = new Uint8Array(needed);
            nb.set(buffer, 0);
            buffer = nb;
        };

        const toUint8 = async (data: any): Promise<Uint8Array> => {
            if (typeof data === "string") return new TextEncoder().encode(data);
            if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
            if (data instanceof ArrayBuffer) return new Uint8Array(data);
            if (ArrayBuffer.isView(data)) return new Uint8Array((data as any).buffer);
            return new TextEncoder().encode(String(data));
        };

        const commit = async () => {
            const text = new TextDecoder().decode(buffer);
            await writeTextFile(this.path, text);
        };

        const writer = {
            async write(chunkOrOp: any) {
                if (chunkOrOp && typeof chunkOrOp === "object" && "type" in chunkOrOp) {
                    const op: { type: string; position?: number; data?: any; size?: number } = chunkOrOp;
                    switch (op.type) {
                        case "write": {
                            const bytes = await toUint8(op.data);
                            const writePos = typeof op.position === "number" ? op.position : position;
                            ensureCapacity(writePos + bytes.length);
                            buffer.set(bytes, writePos);
                            position = writePos + bytes.length;
                            break;
                        }
                        case "seek": {
                            if (typeof op.position !== "number" || op.position < 0) {
                                throw new DOMException("Invalid seek position");
                            }
                            position = op.position;
                            break;
                        }
                        case "truncate": {
                            if (typeof op.size !== "number" || op.size < 0) {
                                throw new DOMException("Invalid truncate size");
                            }
                            if (op.size < buffer.length) buffer = buffer.slice(0, op.size);
                            else {
                                const nb = new Uint8Array(op.size);
                                nb.set(buffer, 0);
                                buffer = nb;
                            }
                            if (position > buffer.length) position = buffer.length;
                            break;
                        }
                        default:
                            throw new DOMException("Unsupported write op type");
                    }
                    return;
                }

                const bytes = await toUint8(chunkOrOp);
                ensureCapacity(position + bytes.length);
                buffer.set(bytes, position);
                position += bytes.length;
            },

            async close() {
                await commit();
            },

            async abort() {
                buffer = new Uint8Array(0);
                position = 0;
            },
        } as unknown as FileSystemWritableFileStream;

        return writer;
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return (other as any)?.path === this.path;
    }
}

/* ------------------------------ Factory ------------------------------ */

export function createTauriHandle(path: string, isDirectory: boolean) {
    return isDirectory ? new TauriDirectoryHandle(path) : new TauriFileHandle(path);
}
