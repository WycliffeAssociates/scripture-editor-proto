import {type DirEntry, mkdir, readDir, readTextFile, remove, writeTextFile} from "@tauri-apps/plugin-fs";
import {TauriFileHandle} from "@/tauri/io/TauriFileHandle.ts";
import { normalize } from "@/tauri/io/PathUtils.ts";
import {join} from "@tauri-apps/api/path";
import {dirname} from "@tauri-apps/api/path";
import {IPathHandle} from "@/core/io/IPathHandle.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";

type ResolveHandle = (path: string) => Promise<IPathHandle>;

export class TauriDirectoryHandle implements IDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    path: string;
    isDir: boolean = true;
    isFile: boolean = false;

    private readonly resolveHandle: ResolveHandle;

    constructor(path: string, resolveHandle: ResolveHandle) {
        this.path = normalize(path);
        this.name = this.path.split("/").pop() || this.path;
        this.resolveHandle = resolveHandle;
    }

    async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<IDirectoryHandle> {
        const dirPath = await join(this.path, name);
        if (opts?.create) await mkdir(dirPath, {recursive: true});
        return new TauriDirectoryHandle(dirPath, this.resolveHandle);
    }

    async getFileHandle(name: string, opts?: { create?: boolean }): Promise<IFileHandle> {
        const filePath = await join(this.path, name);
        if (opts?.create) {
            await mkdir(this.path, {recursive: true});
            try {
                await readTextFile(filePath);
            } catch {
                await writeTextFile(filePath, "");
            }
        }
        return new TauriFileHandle(filePath, this.resolveHandle);
    }

    async removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void> {
        const targetPath = await join(this.path, name);
        await remove(targetPath, {recursive: !!opts?.recursive}).catch((e) => {
            const msg = String((e as any)?.message || "");
            if (!/not found|no such file|does not exist/i.test(msg)) throw e;
        });
    }

    async* entries(): FileSystemDirectoryHandleAsyncIterator<[string, IPathHandle]> {
        const items: DirEntry[] = await readDir(this.path).catch(() => []);
        for (const item of items) {
            const childPath = await join(this.path, item.name);
            if (item.isDirectory) {
                yield [item.name, new TauriDirectoryHandle(childPath, this.resolveHandle)];
            } else {
                yield [item.name, new TauriFileHandle(childPath, this.resolveHandle)];
            }
        }
    }

    async* keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        for await (const [name] of this.entries()) yield name;
    }

    async* values(): FileSystemDirectoryHandleAsyncIterator<IPathHandle> {
        for await (const [, handle] of this.entries()) yield handle;
    }

    [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<[string, IPathHandle]> {
        return this.entries();
    }

    [Symbol.asyncDispose]() {
      return Promise.resolve(void 0);
    }

    async resolve(other: FileSystemHandle): Promise<string[] | null> {
        const otherPath = (other as IPathHandle)?.path;
        if (!otherPath || typeof otherPath !== "string") return null;
        const base = normalize(this.path);
        const cmp = normalize(otherPath);

        if (base === cmp) return [];
        const baseWithSlash = base.endsWith("/") ? base : base + "/";
        if (!cmp.startsWith(baseWithSlash)) return null;

        return cmp.slice(baseWithSlash.length).split("/").filter(Boolean);
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return (other as IPathHandle)?.path === this.path;
    }

    async getParent(): Promise<IDirectoryHandle> {
        const parentPath = await dirname(this.path);
        return await this.resolveHandle(parentPath) as IDirectoryHandle;
    }

    asFileHandle(): IFileHandle | null {
        return null;
    }

    asDirectoryHandle(): IDirectoryHandle | null {
        return this;
    }

    async getAbsolutePath(): Promise<string> {
        return this.path;
    }
}