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
import type { WebFileHandleExtended } from "@/core/data/persistence/DirectoryProvider";

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

    async getDirectoryHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<TauriDirectoryHandle> {
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

    // async *entries(): AsyncIterableIterator<[string, FileSystemFileHandle]> {
    //   const items: DirEntry[] = await readDir(this.path).catch(() => []);
    //   for (const item of items) {
    //     const childPath = await join(this.path, item.name);
    //     if (item.isDirectory) {
    //       yield [item.name, new TauriDirectoryHandle(childPath)];
    //     } else {
    //       yield [item.name, new TauriFileHandle(childPath)];
    //     }
    //   }
    // }
    entries(): FileSystemDirectoryHandleAsyncIterator<
        [string, FileSystemHandle]
    > {
        // 1. The core logic remains in a simple async generator.
        async function* generateEntries(
            path: string,
        ): AsyncIterableIterator<[string, FileSystemHandle]> {
            try {
                const items: DirEntry[] = await readDir(path);
                for (const item of items) {
                    if (!item.name) continue;
                    const childPath = await join(path, item.name);
                    // In Tauri v1, item.children indicates a directory.
                    // For Tauri v2, you would use item.isDirectory.
                    if (item.isDirectory) {
                        yield [item.name, new TauriDirectoryHandle(childPath)];
                    } else {
                        yield [item.name, new TauriFileHandle(childPath)];
                    }
                }
            } catch (error) {
                // It's good practice to handle potential errors from readDir.
                console.error(`Failed to read directory ${path}:`, error);
            }
        }

        // 2. Get the underlying async iterator from our generator.
        const asyncIterator = generateEntries(this.path);

        // 3. Create a new object that wraps the iterator and conforms to the required type.
        const wrapper: FileSystemDirectoryHandleAsyncIterator<
            [string, FileSystemHandle]
        > = {
            // Delegate the next() call to the original iterator.
            async next() {
                return asyncIterator.next();
            },
            // Implement the asyncDispose method.
            async [Symbol.asyncDispose]() {
                // This is a no-op as we have no resources to clean up.
                // It just needs to exist to satisfy the type.
                return Promise.resolve();
            },
            // Implement the asyncIterator symbol. The key is that it
            // must return 'this' (the wrapper itself), which has all the required methods.
            [Symbol.asyncIterator]() {
                return this;
            },
        };

        return wrapper;
    }

    /**
     * Returns a new async iterator that iterates over the keys (file/directory names)
     * in this directory.
     */
    keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        // 1. Core logic as an async generator.
        async function* generateKeys(
            directoryHandle: TauriDirectoryHandle,
        ): AsyncIterableIterator<string> {
            for await (const [name] of directoryHandle.entries()) {
                yield name;
            }
        }

        // 2. Get the underlying iterator.
        const asyncIterator = generateKeys(this);

        // 3. Wrap the iterator to add the dispose symbol.
        const wrapper: FileSystemDirectoryHandleAsyncIterator<string> = {
            async next() {
                return asyncIterator.next();
            },
            async [Symbol.asyncDispose]() {
                // No-op cleanup
            },
            [Symbol.asyncIterator]() {
                return this;
            },
        };
        return wrapper;
    }

    /**
     * Returns a new async iterator that iterates over the values (FileSystemFileHandle objects)
     * in this directory.
     */
    values(): FileSystemDirectoryHandleAsyncIterator<FileSystemHandle> {
        // 1. Core logic as an async generator.
        async function* generateValues(
            directoryHandle: TauriDirectoryHandle,
        ): AsyncIterableIterator<FileSystemHandle> {
            for await (const [, handle] of directoryHandle.entries()) {
                yield handle;
            }
        }

        // 2. Get the underlying iterator.
        const asyncIterator = generateValues(this);

        // 3. Wrap the iterator to add the dispose symbol.
        const wrapper: FileSystemDirectoryHandleAsyncIterator<FileSystemHandle> =
            {
                async next() {
                    return asyncIterator.next();
                },
                async [Symbol.asyncDispose]() {
                    // No-op cleanup
                },
                [Symbol.asyncIterator]() {
                    return this;
                },
            };
        return wrapper;
    }

    [Symbol.asyncIterator]() {
        return this.entries();
    }

    async resolve(other: FileSystemFileHandle): Promise<string[] | null> {
        const otherPath = (other as any)?.path;
        if (!otherPath || typeof otherPath !== "string") return null;
        const base = normalize(this.path);
        const cmp = normalize(otherPath);

        if (base === cmp) return [];
        const baseWithSlash = base.endsWith("/") ? base : base + "/";
        if (!cmp.startsWith(baseWithSlash)) return null;

        return cmp.slice(baseWithSlash.length).split("/").filter(Boolean);
    }

    async isSameEntry(other: FileSystemFileHandle): Promise<boolean> {
        return (other as any)?.path === this.path;
    }
}

/* ------------------------------ File Handle ------------------------------ */
// Define the extended writer interface to match FileSystemWritableFileStream's writer
interface TauriWritableFileStreamWriter
    extends WritableStreamDefaultWriter<any> {
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
}
export class TauriFileHandle implements WebFileHandleExtended {
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

    async createWritable(
        options?: FileSystemCreateWritableOptions,
    ): Promise<FileSystemWritableFileStream> {
        // Handle options: default behavior is to truncate (keepExistingData: false)
        const keepExistingData = options?.keepExistingData ?? false;

        let buffer: Uint8Array;
        let position: number;

        if (keepExistingData) {
            // Load existing file content and set position to end (matching the user's requirement for existing tests).
            try {
                const existingText = await readTextFile(this.path);
                buffer = new TextEncoder().encode(existingText);
                // Set the initial position to the end of the file content for easy appending.
                position = buffer.length;
            } catch (e) {
                // If file doesn't exist, start with an empty buffer
                buffer = new Uint8Array(0);
                position = 0;
            }
        } else {
            // Default behavior (truncate) or explicit truncate: start with empty buffer.
            buffer = new Uint8Array(0);
            position = 0;
        }

        const ensureCapacity = (needed: number) => {
            if (needed <= buffer.length) return;
            const nb = new Uint8Array(needed);
            nb.set(buffer, 0);
            buffer = nb;
        };

        const toUint8 = async (data: any): Promise<Uint8Array> => {
            // ... (your existing toUint8 function)
            if (typeof data === "string") return new TextEncoder().encode(data);
            if (data instanceof Blob)
                return new Uint8Array(await data.arrayBuffer());
            if (data instanceof ArrayBuffer) return new Uint8Array(data);
            if (ArrayBuffer.isView(data))
                return new Uint8Array((data as any).buffer);
            return new TextEncoder().encode(String(data));
        };

        const commit = async () => {
            const text = new TextDecoder().decode(buffer);
            await writeTextFile(this.path, text);
        };

        // This object is now the sink for the WritableStream
        const sink = {
            async write(chunkOrOp: any) {
                // Your existing write logic, adapted to be in the sink's write method
                if (
                    chunkOrOp &&
                    typeof chunkOrOp === "object" &&
                    "type" in chunkOrOp
                ) {
                    const op: {
                        type: string;
                        position?: number;
                        data?: any;
                        size?: number;
                    } = chunkOrOp;
                    switch (op.type) {
                        case "write": {
                            const bytes = await toUint8(op.data);
                            const writePos =
                                typeof op.position === "number"
                                    ? op.position
                                    : position;
                            ensureCapacity(writePos + bytes.length);
                            buffer.set(bytes, writePos);
                            position = writePos + bytes.length;
                            break;
                        }
                        case "seek": {
                            if (
                                typeof op.position !== "number" ||
                                op.position < 0
                            ) {
                                throw new DOMException("Invalid seek position");
                            }
                            position = op.position;
                            break;
                        }
                        case "truncate": {
                            if (typeof op.size !== "number" || op.size < 0) {
                                throw new DOMException("Invalid truncate size");
                            }
                            if (op.size < buffer.length)
                                buffer = buffer.slice(0, op.size);
                            else {
                                const nb = new Uint8Array(op.size);
                                nb.set(buffer, 0);
                                buffer = nb;
                            }
                            if (position > buffer.length)
                                position = buffer.length;
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
        };

        // Create the core WritableStream using your sink object.
        const nativeStream = new WritableStream(sink);

        // Helper function to send operation/data to the sink via the underlying native stream's writer.
        const writeOp = async (op: any) => {
            // Acquire a writer to send the chunk, then immediately release the lock
            const writer = nativeStream.getWriter();
            try {
                await writer.write(op);
            } finally {
                // It is CRITICAL to release the lock immediately so the stream is not locked.
                writer.releaseLock();
            }
        };

        // Define the custom writer that augments the native writer with seek/truncate.
        const getCustomWriter = (): TauriWritableFileStreamWriter => {
            const nativeWriter = nativeStream.getWriter();
            const customWriter = nativeWriter as TauriWritableFileStreamWriter;

            // Add the seek and truncate methods to the writer, converting to structured writes
            customWriter.seek = (position: number): Promise<void> => {
                return nativeWriter.write({ type: "seek", position });
            };
            customWriter.truncate = (size: number): Promise<void> => {
                return nativeWriter.write({ type: "truncate", size });
            };

            return customWriter;
        };

        // Return a distinct object that fully implements FileSystemWritableFileStream
        // by delegating standard methods and implementing the custom ones.
        return {
            // Properties delegated to native stream
            get closed() {
                return nativeStream.getWriter().closed;
            },
            get ready() {
                return nativeStream.getWriter().ready;
            },
            get locked() {
                return nativeStream.locked;
            },

            // Methods delegated or wrapped
            abort: (reason?: any) => nativeStream.abort(reason),
            close: () => nativeStream.close(),
            getWriter: getCustomWriter,

            // Custom FileSystemWritableFileStream methods (using the writeOp helper)
            seek: (position: number) => writeOp({ type: "seek", position }),
            truncate: (size: number) => writeOp({ type: "truncate", size }),
            write: (data: any, position?: number) => {
                // If position is provided, it's a structured write operation
                if (typeof position === "number") {
                    return writeOp({ type: "write", position, data });
                }
                // Otherwise, it's a standard WritableStream write (uses current internal position)
                return writeOp(data);
            },
        } as FileSystemWritableFileStream;
    }

    async isSameEntry(other: FileSystemFileHandle): Promise<boolean> {
        return (other as any)?.path === this.path;
    }
    async write(
        data: FileSystemWriteChunkType,
        options?: { keepExistingData?: boolean },
    ): Promise<void> {
        const writable = await this.createWritable({
            keepExistingData: options?.keepExistingData ?? false,
        });

        try {
            await writable.write(data);
        } finally {
            await writable.close();
        }
    }
}

/* ------------------------------ Factory ------------------------------ */

export class TauriWebExtendedFileHandle
    extends FileSystemFileHandle
    implements WebFileHandleExtended
{
    path: string;
    constructor(
        private handle: FileSystemFileHandle,
        path: string,
    ) {
        super();
        this.path = path;
    }
    // Convenience method that handles the full write lifecycle
    async write(
        data: FileSystemWriteChunkType,
        options?: { keepExistingData?: boolean },
    ): Promise<void> {
        const writable = await this.handle.createWritable({
            keepExistingData: options?.keepExistingData ?? false,
        });

        try {
            await writable.write(data);
        } finally {
            await writable.close();
        }
    }
}
