import {IPathHandle} from "@/core/io/IPathHandle.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";
import {WebFileHandleWrapper} from "@/web/io/WebFileHandleWrapper.ts";

type ResolveHandle = (path: string) => Promise<IPathHandle>;

export class WebDirectoryHandleWrapper extends FileSystemDirectoryHandle implements IDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    readonly path: string;
    readonly handle: FileSystemDirectoryHandle;
    readonly isDir: boolean = true;
    readonly isFile: boolean = false;

    private readonly resolveHandle: ResolveHandle;

    constructor(handle: FileSystemDirectoryHandle, path: string, resolveHandle: ResolveHandle) {
        super();
        this.handle = handle;
        this.path = path;
        this.name = path.split("/").pop() ?? path;
        this.resolveHandle = resolveHandle;
    }

    async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<IDirectoryHandle> {
        const child = await this.handle.getDirectoryHandle(name, opts);
        return new WebDirectoryHandleWrapper(child, `${this.path}/${name}`, this.resolveHandle);
    }

    async getFileHandle(name: string, opts?: { create?: boolean }): Promise<IFileHandle> {
        const file = await this.handle.getFileHandle(name, opts);
        return new WebFileHandleWrapper(file, `${this.path}/${name}`, this.resolveHandle);
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
            // If it's the root, we need to return the root directory itself, or null if there's no parent.
            // For the web, the root of OPFS typically doesn't have a 'parent' in the traditional sense.
            // We'll return the root directory handle, which represents the effective parent for the top-level items.
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
}