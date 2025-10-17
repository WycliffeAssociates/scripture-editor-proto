import {readTextFile, writeTextFile} from "@tauri-apps/plugin-fs";
import {normalize} from "@/tauri/io/PathUtils.ts";
import {TauriWritableFileStreamWriter} from "@/tauri/io/TauriWritableFileStreamWriter.ts";
import {IPathHandle} from "@/core/io/IPathHandle.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {dirname} from "@tauri-apps/api/path";
import {TauriDirectoryHandle} from "@/tauri/io/TauriDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";

type ResolveHandle = (path: string) => Promise<IPathHandle>;

export class TauriFileHandle implements IFileHandle {
    kind: "file" = "file";
    name: string;
    readonly path: string;
    isDir: boolean = false;
    isFile: boolean = true;

    private readonly resolveHandle: ResolveHandle;

    constructor(path: string, resolveHandle: ResolveHandle) {
        this.path = normalize(path);
        this.name = this.path.split("/").pop() || this.path;
        this.resolveHandle = resolveHandle;
    }

    [Symbol.asyncDispose](): Promise<void> {
        return Promise.resolve(void 0);
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

    async createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream> {
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
            if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
            if (data instanceof ArrayBuffer) return new Uint8Array(data);
            if (ArrayBuffer.isView(data)) return new Uint8Array((data as any).buffer);
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
                return nativeWriter.write({type: "seek", position});
            };
            customWriter.truncate = (size: number): Promise<void> => {
                return nativeWriter.write({type: "truncate", size});
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
            seek: (position: number) => writeOp({type: "seek", position}),
            truncate: (size: number) => writeOp({type: "truncate", size}),
            write: (data: any, position?: number) => {
                // If position is provided, it's a structured write operation
                if (typeof position === 'number') {
                    return writeOp({type: "write", position, data});
                }
                // Otherwise, it's a standard WritableStream write (uses current internal position)
                return writeOp(data);
            },

        } as FileSystemWritableFileStream;
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return (other as IPathHandle)?.path === this.path;
    }

    async getParent(): Promise<IDirectoryHandle> {
        const parentPath = await dirname(this.path);
        return await this.resolveHandle(parentPath) as IDirectoryHandle;
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
}