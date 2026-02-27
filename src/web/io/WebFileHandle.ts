import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import type { WebFileWriteBackend } from "@/web/io/write/WebFileWriteBackend.ts";

type ResolveHandle = (path: string) => Promise<IPathHandle>;

type WriteChunkData = string | Blob | BufferSource;
type WriteParams =
    | {
          type: "write";
          data?: string | Blob | BufferSource | null;
          position?: number;
      }
    | { type: "seek"; position: number }
    | { type: "truncate"; size: number };

function toUint8Array(data: WriteChunkData): Promise<Uint8Array> | Uint8Array {
    if (typeof data === "string") {
        return new TextEncoder().encode(data);
    }
    if (data instanceof Blob) {
        return data.arrayBuffer().then((buffer) => new Uint8Array(buffer));
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        const view = data as ArrayBufferView<ArrayBuffer>;
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }
    return new Uint8Array(0);
}

function isWriteParams(
    chunkOrOp: FileSystemWriteChunkType,
): chunkOrOp is WriteParams {
    const opType =
        typeof chunkOrOp === "object" &&
        chunkOrOp !== null &&
        "type" in chunkOrOp
            ? chunkOrOp.type
            : null;
    return (
        typeof chunkOrOp === "object" &&
        chunkOrOp !== null &&
        (opType === "write" || opType === "seek" || opType === "truncate") &&
        !(chunkOrOp instanceof Blob) &&
        !(chunkOrOp instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(chunkOrOp)
    );
}

function ensureCapacity(buffer: Uint8Array, size: number): Uint8Array {
    if (size <= buffer.length) return buffer;
    const next = new Uint8Array(size);
    next.set(buffer, 0);
    return next;
}

export class WebFileHandle implements IFileHandle {
    kind: "file" = "file";
    name: string;
    readonly path: string;
    readonly handle: FileSystemFileHandle;
    readonly isDir: boolean = false;
    readonly isFile: boolean = true;

    private readonly resolveHandle: ResolveHandle;
    private readonly writeBackend?: WebFileWriteBackend;

    constructor(
        handle: FileSystemFileHandle,
        path: string,
        resolveHandle: ResolveHandle,
        writeBackend?: WebFileWriteBackend,
    ) {
        this.handle = handle;
        this.path = path;
        this.name = handle.name; // Delegate name from the native handle
        this.resolveHandle = resolveHandle;
        this.writeBackend = writeBackend;
    }

    [Symbol.asyncDispose](): Promise<void> {
        return Promise.resolve();
    }

    async getFile() {
        return this.handle.getFile();
    }

    async createWritable(options?: FileSystemCreateWritableOptions) {
        if (!this.writeBackend) {
            return this.handle.createWritable(options);
        }

        const keepExistingData = options?.keepExistingData ?? false;
        let buffer = keepExistingData
            ? await this.writeBackend.read(this.path)
            : new Uint8Array(0);
        let position = keepExistingData ? buffer.length : 0;
        let locked = false;

        const writeChunk = async (chunkOrOp: FileSystemWriteChunkType) => {
            if (isWriteParams(chunkOrOp)) {
                if (chunkOrOp.type === "seek") {
                    if (
                        typeof chunkOrOp.position !== "number" ||
                        chunkOrOp.position < 0
                    ) {
                        throw new DOMException("Invalid seek position");
                    }
                    position = chunkOrOp.position;
                    return;
                }

                if (chunkOrOp.type === "truncate") {
                    if (
                        typeof chunkOrOp.size !== "number" ||
                        chunkOrOp.size < 0
                    ) {
                        throw new DOMException("Invalid truncate size");
                    }
                    if (chunkOrOp.size < buffer.length) {
                        buffer = buffer.slice(0, chunkOrOp.size);
                    } else if (chunkOrOp.size > buffer.length) {
                        buffer = ensureCapacity(buffer, chunkOrOp.size);
                    }
                    if (position > buffer.length) {
                        position = buffer.length;
                    }
                    return;
                }

                if (chunkOrOp.type === "write") {
                    if (chunkOrOp.data === undefined || chunkOrOp.data === null)
                        return;
                    const bytes = await toUint8Array(
                        chunkOrOp.data as WriteChunkData,
                    );
                    const writePosition =
                        typeof chunkOrOp.position === "number"
                            ? chunkOrOp.position
                            : position;
                    buffer = ensureCapacity(
                        buffer,
                        writePosition + bytes.length,
                    );
                    buffer.set(bytes, writePosition);
                    position = writePosition + bytes.length;
                }
                return;
            }

            const bytes = await toUint8Array(chunkOrOp as WriteChunkData);
            buffer = ensureCapacity(buffer, position + bytes.length);
            buffer.set(bytes, position);
            position += bytes.length;
        };

        const close = async () => {
            await this.writeBackend?.write(this.path, buffer);
        };

        const abort = async () => {
            buffer = new Uint8Array(0);
            position = 0;
        };

        const getWriter = () => {
            if (locked) {
                throw new TypeError(
                    "Cannot get a writer while stream is locked",
                );
            }
            locked = true;

            const writer = {
                write: writeChunk,
                close: async () => {
                    await close();
                    locked = false;
                },
                abort: async () => {
                    await abort();
                    locked = false;
                },
                releaseLock: () => {
                    locked = false;
                },
                get desiredSize() {
                    return null;
                },
                get closed() {
                    return Promise.resolve();
                },
                get ready() {
                    return Promise.resolve();
                },
            };

            return writer as unknown as WritableStreamDefaultWriter;
        };

        return {
            write: writeChunk,
            seek: (nextPosition: number) =>
                writeChunk({ type: "seek", position: nextPosition }),
            truncate: (size: number) => writeChunk({ type: "truncate", size }),
            close,
            abort,
            getWriter,
            get locked() {
                return locked;
            },
            get closed() {
                return Promise.resolve();
            },
            get ready() {
                return Promise.resolve();
            },
        } as unknown as FileSystemWritableFileStream;
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
