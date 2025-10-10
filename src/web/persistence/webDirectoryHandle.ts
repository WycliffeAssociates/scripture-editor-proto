import { WebFileHandleExtended } from "@/core/data/persistence/DirectoryProvider";

export class WebDirectoryHandleWrapper extends FileSystemDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    readonly path: string;
    readonly handle: FileSystemDirectoryHandle;

    constructor(handle: FileSystemDirectoryHandle, path: string) {
        super();
        this.handle = handle;
        this.path = path;
        this.name = path.split("/").pop() ?? path;
    }

    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
        const child = await this.handle.getDirectoryHandle(name, opts);
        return new WebDirectoryHandleWrapper(child, `${this.path}/${name}`);
    }

    async getFileHandle(name: string, opts?: { create?: boolean }) {
        const file = await this.handle.getFileHandle(name, opts);
        return new WebFileHandleWrapper(file, `${this.path}/${name}`);
    }

    async removeEntry(name: string, opts?: { recursive?: boolean }) {
        return this.handle.removeEntry(name, opts);
    }

    entries() {
        return this.handle.entries();
    }
}

export class WebFileHandleWrapper
    extends FileSystemFileHandle
    implements WebFileHandleExtended
{
    kind: "file" = "file";
    name: string;
    readonly path: string;
    readonly handle: FileSystemFileHandle;

    constructor(handle: FileSystemFileHandle, path: string) {
        super();
        this.handle = handle;
        this.path = path;
        this.name = path.split("/").pop() ?? path;
    }

    async getFile() {
        return this.handle.getFile();
    }

    async createWritable(options?: FileSystemCreateWritableOptions) {
        return this.handle.createWritable(options);
    }

    async write(
        data: FileSystemWriteChunkType,
        opts?: { keepExistingData?: boolean },
    ) {
        const writable = await this.createWritable(opts);
        await writable.write(data);
        await writable.close();
    }
}
