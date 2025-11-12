import { vi } from "vitest";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle";
import type { IFileHandle } from "@/core/io/IFileHandle";
import type { IFileWriter } from "@/core/io/IFileWriter";
import type { IPathHandle } from "@/core/io/IPathHandle";

export const mockFileWriter = (
    inMemoryFiles: Map<string, string>,
): IFileWriter => {
    return {
        writeFile: vi.fn(async (filename: string, content: string) => {
            inMemoryFiles.set(filename, content);
        }),
    };
};

export const mockMd5Service: IMd5Service = {
    calculateMd5: vi.fn((text: string) => Promise.resolve(`mock-md5-${text}`)),
};

export type MockIDirectoryHandle = IDirectoryHandle & {
    files: Map<string, string>;
};

// Helper mock for FileSystemDirectoryHandle
export class MockDirectoryHandle implements MockIDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    files: Map<string, string> = new Map();
    path: string;
    isDir: boolean = true;
    isFile: boolean = false;

    constructor(name: string, initialFiles: Record<string, string> = {}) {
        this.name = name;
        this.path = `${name}`;
        for (const [fileName, content] of Object.entries(initialFiles)) {
            this.files.set(fileName, content);
        }
    }
    getAbsolutePath = vi.fn(() => Promise.resolve(this.path));
    asFileHandle = vi.fn(() => null);
    asDirectoryHandle = vi.fn(() => this);
    getParent = vi.fn(() => Promise.resolve(new MockDirectoryHandle("/")));

    getDirectoryHandle = vi.fn((_name: string) =>
        Promise.reject(new Error("Not implemented for this test")),
    );

    getFileHandle = vi.fn(
        (fileName: string, options?: { create?: boolean }) => {
            if (this.files.has(fileName)) {
                return Promise.resolve(
                    new MockFileHandle(
                        fileName,
                        this.files.get(fileName) as string,
                    ),
                );
            } else if (options?.create) {
                const newFileHandle = new MockFileHandle("", fileName);
                this.files.set(fileName, ""); // Add to internal map
                return Promise.resolve(newFileHandle);
            }
            return Promise.reject(new Error("File not found"));
        },
    );
    entries(): FileSystemDirectoryHandleAsyncIterator<[string, IPathHandle]> {
        async function* gen(): FileSystemDirectoryHandleAsyncIterator<
            [string, IPathHandle]
        > {
            // no entries for mock, just yield nothing
        }
        return gen();
    }

    values(): FileSystemDirectoryHandleAsyncIterator<IPathHandle> {
        async function* gen(): FileSystemDirectoryHandleAsyncIterator<IPathHandle> {}
        return gen();
    }

    keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        async function* gen(): FileSystemDirectoryHandleAsyncIterator<string> {}
        return gen();
    }

    removeEntry = vi.fn(() => Promise.resolve());
    resolve = vi.fn(() => Promise.resolve(null));
    isSameEntry = vi.fn(() => Promise.resolve(false));
    [Symbol.asyncIterator] = vi.fn(() => {
        async function* gen() {
            // empty generator
        }
        return gen() as unknown as FileSystemDirectoryHandleAsyncIterator<
            [string, IPathHandle]
        >;
    });
    [Symbol.asyncDispose] = vi.fn(() => Promise.resolve());
    //   [Symbol.asyncIterator] = vi.fn(() => (async function* () {})());
}

// Helper mock for FileSystemFileHandle
export class MockFileHandle implements IFileHandle {
    kind: "file" = "file";
    name: string;
    private content: string;
    path: string;
    /* Type 'MockFileHandle' is missing the following properties from type '_IFileHandle': createWriter, asDirectoryHandle, getAbsolutePath */

    constructor(name: string, content: string) {
        this.name = name;
        this.content = content;
        this.path = name;
    }
    isDir: boolean = false;
    isFile: boolean = true;
    createWriter(): Promise<WritableStreamDefaultWriter> {
        return Promise.resolve({
            write: (data: string | Uint8Array) => {
                // store string if needed
                if (typeof data === "string") this.content = data;

                return Promise.resolve();
            },
            close: () => Promise.resolve(),
            abort: () => Promise.resolve(),
        } as unknown as WritableStreamDefaultWriter);
    }
    asDirectoryHandle(): IDirectoryHandle | null {
        return null; // because this is a file
    }
    getAbsolutePath = vi.fn(() => Promise.resolve(this.path));
    getParent = vi.fn(() => Promise.resolve(new MockDirectoryHandle("/")));
    asFileHandle = vi.fn(() => null);
    getFile = vi.fn(() => Promise.resolve(new File([this.content], this.name)));

    createWritable = vi.fn(() =>
        Promise.resolve({
            write: vi.fn((data: string) => {
                this.content = data;
                return Promise.resolve();
            }),
            close: vi.fn(() => Promise.resolve()),
            abort: vi.fn(() => Promise.resolve()),
        } as unknown as FileSystemWritableFileStream),
    );
    isSameEntry = vi.fn(() => Promise.resolve(false));
    [Symbol.asyncDispose] = vi.fn(() => Promise.resolve());
}
