import {IPathHandle} from "@/core/io/IPathHandle.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";
import {WebFileHandleWrapper} from "@/web/io/WebFileHandleWrapper.ts";

type ResolveHandle = (path: string) => Promise<IPathHandle>;

export class WebDirectoryHandleWrapper implements IDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    readonly path: string;
    readonly handle: FileSystemDirectoryHandle;
    readonly isDir: boolean = true;
    readonly isFile: boolean = false;

    private readonly resolveHandle: ResolveHandle;

    constructor(handle: FileSystemDirectoryHandle, path: string, resolveHandle: ResolveHandle) {
        this.handle = handle;
        this.path = path;
        this.name = handle.name; // Delegate name from the native handle
        this.resolveHandle = resolveHandle;
    }

    async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<IDirectoryHandle> {
        const child = await this.handle.getDirectoryHandle(name, opts);
        let pattern = "";
        if (this.path.endsWith("/")) {
            pattern = `${this.path}${name}`
        } else {
            pattern = `${this.path}/${name}`
        }
        return new WebDirectoryHandleWrapper(child, pattern, this.resolveHandle);
    }

    async getFileHandle(name: string, opts?: { create?: boolean }): Promise<IFileHandle> {
        const file = await this.handle.getFileHandle(name, opts);
        let pattern = "";
        if (this.path.endsWith("/")) {
            pattern = `${this.path}${name}`
        } else {
            pattern = `${this.path}/${name}`
        }
        return new WebFileHandleWrapper(file, pattern, this.resolveHandle);
    }

    async removeEntry(name: string, opts?: { recursive?: boolean }) {
        return this.handle.removeEntry(name, opts);
    }

    async* entries(): AsyncIterableIterator<[string, IPathHandle]> {
        for await (const [name, handle] of this.handle.entries()) {
            if (handle.kind === "directory") {
                yield [name, new WebDirectoryHandleWrapper(handle as FileSystemDirectoryHandle, `${this.path}/${name}`, this.resolveHandle)];
            } else {
                yield [name, new WebFileHandleWrapper(handle as FileSystemFileHandle, `${this.path}/${name}`, this.resolveHandle)];
            }
        }
    }

    async getParent(): Promise<IDirectoryHandle> {
        const parentPath = this.path.substring(0, this.path.lastIndexOf("/"));
        if (parentPath === "") {
            return await this.resolveHandle("/") as IDirectoryHandle;
        }
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

    // Implement FileSystemHandle properties and methods by delegating to this.handle
    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return this.handle.isSameEntry(other);
    }

    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
        return this.handle.resolve(possibleDescendant);
    }

    [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<[string, IPathHandle]> {
        return this.entries();
    }

    [Symbol.asyncDispose](): Promise<void> {
        return Promise.resolve(void 0);
    }
}