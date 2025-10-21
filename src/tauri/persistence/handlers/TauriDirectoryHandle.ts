import { join } from "@tauri-apps/api/path";
import {
    type DirEntry,
    mkdir,
    readDir,
    readTextFile,
    remove,
    writeTextFile,
} from "@tauri-apps/plugin-fs";
import { normalize } from "@/tauri/persistence/handlers/PathUtils.ts";
import { TauriFileHandle } from "@/tauri/persistence/handlers/TauriFileHandle.ts";

export class TauriDirectoryHandle implements FileSystemDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    path: string;

    constructor(path: string) {
        this.path = normalize(path);
        this.name = this.path.split("/").pop() || this.path;
    }

    async getDirectoryHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<FileSystemDirectoryHandle> {
        const dirPath = await join(this.path, name);
        if (opts?.create) await mkdir(dirPath, { recursive: true });
        return new TauriDirectoryHandle(dirPath);
    }

    async getFileHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<TauriFileHandle> {
        const filePath = await join(this.path, name);
        if (opts?.create) {
            await mkdir(this.path, { recursive: true });
            try {
                await readTextFile(filePath);
            } catch {
                await writeTextFile(filePath, "");
            }
        }
        return new TauriFileHandle(filePath);
    }

    async removeEntry(
        name: string,
        opts?: { recursive?: boolean },
    ): Promise<void> {
        const targetPath = await join(this.path, name);
        await remove(targetPath, { recursive: !!opts?.recursive }).catch(
            (e) => {
                const msg = String((e as any)?.message || "");
                if (!/not found|no such file|does not exist/i.test(msg))
                    throw e;
            },
        );
    }

    async *entries(): FileSystemDirectoryHandleAsyncIterator<
        [string, FileSystemHandle]
    > {
        const items: DirEntry[] = await readDir(this.path).catch(() => []);
        for (const item of items) {
            const childPath = await join(this.path, item.name);
            if (item.isDirectory) {
                yield [
                    item.name,
                    new TauriDirectoryHandle(childPath) as FileSystemHandle,
                ];
            } else {
                yield [
                    item.name,
                    new TauriFileHandle(childPath) as FileSystemHandle,
                ];
            }
        }
    }

    async *keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        for await (const [name] of this.entries()) yield name;
    }

    async *values(): FileSystemDirectoryHandleAsyncIterator<FileSystemHandle> {
        for await (const [, handle] of this.entries()) yield handle;
    }

    [Symbol.asyncIterator]() {
        return this.entries();
    }

    [Symbol.asyncDispose]() {}

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
