import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";

type ResolveHandle = (path: string) => Promise<IPathHandle>;

export class WebFileHandle implements IFileHandle {
    kind: "file" = "file";
    name: string;
    readonly path: string;
    readonly handle: FileSystemFileHandle;
    readonly isDir: boolean = false;
    readonly isFile: boolean = true;

    private readonly resolveHandle: ResolveHandle;

    constructor(
        handle: FileSystemFileHandle,
        path: string,
        resolveHandle: ResolveHandle,
    ) {
        this.handle = handle;
        this.path = path;
        this.name = handle.name; // Delegate name from the native handle
        this.resolveHandle = resolveHandle;
    }

    [Symbol.asyncDispose](): Promise<void> {
        return Promise.resolve();
    }

    async getFile() {
        return this.handle.getFile();
    }

    async createWritable(options?: FileSystemCreateWritableOptions) {
        return this.handle.createWritable(options);
    }

    async createWriter(): Promise<WritableStreamDefaultWriter> {
        const writable = await this.createWritable();
        return writable.getWriter();
    }

    async write(
        data: FileSystemWriteChunkType,
        opts?: { keepExistingData?: boolean },
    ) {
        const writable = await this.createWritable(opts);
        await writable.write(data);
        await writable.close();
    }

    async getParent(): Promise<IDirectoryHandle> {
        const parentPath = this.path.substring(0, this.path.lastIndexOf("/"));
        if (parentPath === "") {
            return (await this.resolveHandle("/")) as IDirectoryHandle;
        }
        return (await this.resolveHandle(parentPath)) as IDirectoryHandle;
    }

    asFileHandle(): IFileHandle | null {
        return this;
    }

    asDirectoryHandle(): IDirectoryHandle | null {
        return null;
    }

    async getAbsolutePath(): Promise<string> {
        return this.path;
    }

    // Implement FileSystemHandle properties and methods by delegating to this.handle
    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return this.handle.isSameEntry(other);
    }
}
