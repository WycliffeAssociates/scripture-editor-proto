import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import { WebFileHandle } from "@/web/io/WebFileHandle.ts";

type ResolveHandle = (path: string) => Promise<IPathHandle>;

export class WebDirectoryHandle implements IDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    readonly path: string;
    readonly handle: FileSystemDirectoryHandle;
    readonly isDir: boolean = true;
    readonly isFile: boolean = false;

    private readonly resolveHandle: ResolveHandle;

    constructor(
        handle: FileSystemDirectoryHandle,
        path: string,
        resolveHandle: ResolveHandle,
    ) {
        this.handle = handle;
        this.path = path;
        this.name = handle.name; // Delegate name from the native handle
        this.resolveHandle = resolveHandle;
    }

    async getDirectoryHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<IDirectoryHandle> {
        const child = await this.handle.getDirectoryHandle(name, opts);
        let pattern = "";
        if (this.path.endsWith("/")) {
            pattern = `${this.path}${name}`;
        } else {
            pattern = `${this.path}/${name}`;
        }
        return new WebDirectoryHandle(child, pattern, this.resolveHandle);
    }

    async getFileHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<IFileHandle> {
        const file = await this.handle.getFileHandle(name, opts);
        let pattern = "";
        if (this.path.endsWith("/")) {
            pattern = `${this.path}${name}`;
        } else {
            pattern = `${this.path}/${name}`;
        }
        return new WebFileHandle(file, pattern, this.resolveHandle);
    }

    async removeEntry(name: string, opts?: { recursive?: boolean }) {
        return this.handle.removeEntry(name, opts);
    }

    async *keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        for await (const [name] of this.entries()) yield name;
    }

    async *values(): FileSystemDirectoryHandleAsyncIterator<IPathHandle> {
        for await (const [, handle] of this.entries()) yield handle;
    }

    async *entries(): FileSystemDirectoryHandleAsyncIterator<
        [string, IPathHandle]
    > {
        for await (const [name, handle] of this.handle.entries()) {
            if (handle.kind === "directory") {
                yield [
                    name,
                    new WebDirectoryHandle(
                        handle as FileSystemDirectoryHandle,
                        `${this.path}/${name}`,
                        this.resolveHandle,
                    ),
                ];
            } else {
                yield [
                    name,
                    new WebFileHandle(
                        handle as FileSystemFileHandle,
                        `${this.path}/${name}`,
                        this.resolveHandle,
                    ),
                ];
            }
        }
    }

    async getParent(): Promise<IDirectoryHandle> {
        const parentPath = this.path.substring(0, this.path.lastIndexOf("/"));
        if (parentPath === "") {
            return (await this.resolveHandle("/")) as IDirectoryHandle;
        }
        return (await this.resolveHandle(parentPath)) as IDirectoryHandle;
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

    // Implement FileSystemHandle properties and methods by delegating to this.handle
    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return this.handle.isSameEntry(other);
    }

    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
        return this.handle.resolve(possibleDescendant);
    }

    [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<
        [string, IPathHandle]
    > {
        return this.entries();
    }

    [Symbol.asyncDispose](): Promise<void> {
        return Promise.resolve(void 0);
    }

    async containsFile(name: string): Promise<boolean> {
        try {
            await this.handle.getFileHandle(name);
            return true;
        } catch (e) {
            return false;
        }
    }

    async containsDir(name: string): Promise<boolean> {
        try {
            await this.handle.getDirectoryHandle(name);
            return true;
        } catch (e) {
            return false;
        }
    }
}
