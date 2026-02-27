import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import { WebDirectoryHandle } from "@/web/io/WebDirectoryHandle.ts";
import { WebFileHandle } from "@/web/io/WebFileHandle.ts";
import type { WebFileWriteBackend } from "@/web/io/write/WebFileWriteBackend.ts";

// --- Mocks for Native Web File System API ---

// Mock for FileSystemFileHandle
class MockFileSystemFileHandle {
    kind: "file" = "file";
    name: string;
    private content: string;

    constructor(name: string, content: string = "") {
        this.name = name;
        this.content = content;
    }

    async getFile(): Promise<File> {
        return new MockFile(this.name, this.content);
    }

    async createWritable(): Promise<FileSystemWritableFileStream> {
        const _this = this; // Capture 'this' for the nested writer
        return {
            async write(data: FileSystemWriteChunkType) {
                if (typeof data === "string") {
                    _this.content = data;
                } else if (data instanceof Blob) {
                    _this.content = await data.text();
                } else if (data instanceof ArrayBuffer) {
                    _this.content = new TextDecoder().decode(data);
                } else if (data instanceof Uint8Array) {
                    _this.content = new TextDecoder().decode(data);
                }
            },
            async close() {
                /* do nothing */
            },
            async abort() {
                /* do nothing */
            },
            getWriter: vi.fn(() => ({
                write: vi.fn((data: FileSystemWriteChunkType) => {
                    if (typeof data === "string") {
                        _this.content = data;
                    } else if (data instanceof Blob) {
                        data.text().then((text) => {
                            _this.content = text;
                        });
                    } else if (data instanceof ArrayBuffer) {
                        _this.content = new TextDecoder().decode(data);
                    } else if (data instanceof Uint8Array) {
                        _this.content = new TextDecoder().decode(data);
                    }
                }),
                close: vi.fn(() => Promise.resolve()),
                abort: vi.fn(() => Promise.resolve()),
                releaseLock: vi.fn(() => {}),
                locked: false,
                closed: Promise.resolve(),
                ready: Promise.resolve(),
                desiredSize: null,
            })),
            locked: false,
            closed: Promise.resolve(),
            ready: Promise.resolve(),
        } as unknown as FileSystemWritableFileStream;
    }

    // Mock other FileSystemFileHandle methods
    isSameEntry = vi.fn(() => Promise.resolve(false));
}

// Mock for FileSystemDirectoryHandle
class MockFileSystemDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    public entriesMap: Map<string, FileSystemHandle>;

    constructor(name: string, entries: Record<string, FileSystemHandle> = {}) {
        this.name = name;
        this.entriesMap = new Map(Object.entries(entries));
    }

    async getDirectoryHandle(
        name: string,
        options?: { create?: boolean },
    ): Promise<MockFileSystemDirectoryHandle> {
        if (
            this.entriesMap.has(name) &&
            this.entriesMap.get(name)?.kind === "directory"
        ) {
            return this.entriesMap.get(name) as MockFileSystemDirectoryHandle;
        }
        if (options?.create) {
            const newDir = new MockFileSystemDirectoryHandle(name);
            this.entriesMap.set(name, newDir);
            return newDir;
        }
        throw new Error("Directory not found");
    }

    async getFileHandle(
        name: string,
        options?: { create?: boolean },
    ): Promise<FileSystemFileHandle> {
        if (
            this.entriesMap.has(name) &&
            this.entriesMap.get(name)?.kind === "file"
        ) {
            return this.entriesMap.get(name) as MockFileSystemFileHandle;
        }
        if (options?.create) {
            const newFile = new MockFileSystemFileHandle(name);
            this.entriesMap.set(name, newFile);
            return newFile;
        }
        throw new Error("File not found");
    }

    async removeEntry(
        name: string,
        options?: { recursive?: boolean },
    ): Promise<void> {
        if (!this.entriesMap.has(name)) {
            throw new Error("Entry not found");
        }
        const entry = this.entriesMap.get(name);
        if (
            entry?.kind === "directory" &&
            !options?.recursive &&
            (entry as MockFileSystemDirectoryHandle).entriesMap.size > 0
        ) {
            throw new Error("Directory not empty");
        }
        this.entriesMap.delete(name);
    }

    async *entries(): FileSystemDirectoryHandleAsyncIterator<
        [string, FileSystemHandle]
    > {
        for (const [name, handle] of this.entriesMap.entries()) {
            yield [name, handle];
        }
    }

    // Mock other FileSystemDirectoryHandle methods
    async *keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        for await (const [name] of this.entries()) yield name;
    }
    async *values(): FileSystemDirectoryHandleAsyncIterator<FileSystemHandle> {
        for await (const [, handle] of this.entries()) yield handle;
    }
    [Symbol.asyncIterator] = vi.fn(() => this.entries());
    resolve = vi.fn(() => Promise.resolve(null));
    isSameEntry = vi.fn(() => Promise.resolve(false));
}

// Mock for File
class MockFile implements File {
    name: string;
    private content: string;
    readonly lastModified: number = Date.now();
    readonly size: number;
    readonly type: string = "text/plain";
    readonly webkitRelativePath: string = "";

    constructor(name: string, content: string) {
        this.name = name;
        this.content = content;
        this.size = content.length;
    }

    bytes(): Promise<Uint8Array<ArrayBuffer>> {
        throw new Error("Method not implemented.");
    }

    text = vi.fn(() => Promise.resolve(this.content));
    arrayBuffer = vi.fn(() =>
        Promise.resolve(new TextEncoder().encode(this.content).buffer),
    );
    slice = vi.fn(() => ({}) as Blob);
    stream = vi.fn(() => ({}) as ReadableStream<Uint8Array<ArrayBuffer>>);
}

// Mock navigator.storage
const mockRootDirectory = new MockFileSystemDirectoryHandle("/");
vi.mock("globalThis", () => ({
    navigator: {
        storage: {
            getDirectory: vi.fn(() => Promise.resolve(mockRootDirectory)),
        },
    },
}));

function createMockWriteBackend(initial: Record<string, string> = {}) {
    const bytesByPath = new Map<string, Uint8Array>(
        Object.entries(initial).map(([path, text]) => [
            path,
            new TextEncoder().encode(text),
        ]),
    );

    const backend: WebFileWriteBackend = {
        read: vi.fn(async (path: string) => {
            return bytesByPath.get(path) ?? new Uint8Array(0);
        }),
        write: vi.fn(async (path: string, bytes: Uint8Array) => {
            bytesByPath.set(path, bytes);
        }),
    };

    return {
        backend,
        asText(path: string) {
            const bytes = bytesByPath.get(path) ?? new Uint8Array(0);
            return new TextDecoder().decode(bytes);
        },
    };
}

describe("WebDirectoryHandle", () => {
    let mockResolveHandle: (path: string) => Promise<IPathHandle>;

    beforeEach(() => {
        // Reset the mock root directory for each test
        mockRootDirectory.entriesMap.clear();

        // Simulate the behavior of WebDirectoryProvider's getHandle
        mockResolveHandle = async (path: string): Promise<IPathHandle> => {
            const parts = path.split("/").filter(Boolean);
            let currentNativeHandle: MockFileSystemDirectoryHandle =
                mockRootDirectory;
            let currentPath = "";

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                currentPath += `/${part}`;

                if (i === parts.length - 1) {
                    // Last part, could be file or directory
                    try {
                        const fileHandle =
                            await currentNativeHandle.getFileHandle(part);
                        return new WebFileHandle(
                            fileHandle,
                            currentPath,
                            mockResolveHandle,
                        );
                    } catch {
                        const dirHandle =
                            await currentNativeHandle.getDirectoryHandle(part);
                        return new WebDirectoryHandle(
                            dirHandle,
                            currentPath,
                            mockResolveHandle,
                        );
                    }
                } else {
                    // Intermediate part, must be a directory
                    currentNativeHandle =
                        await currentNativeHandle.getDirectoryHandle(part);
                }
            }
            // If path is '/', return the root directory itself
            return new WebDirectoryHandle(
                mockRootDirectory,
                "/",
                mockResolveHandle,
            );
        };
    });

    test("constructor sets properties correctly for directory", () => {
        const nativeHandle = new MockFileSystemDirectoryHandle("testDir");
        const wrapper = new WebDirectoryHandle(
            nativeHandle,
            "/root/testDir",
            mockResolveHandle,
        );
        expect(wrapper.kind).toBe("directory");
        expect(wrapper.name).toBe("testDir");
        expect(wrapper.path).toBe("/root/testDir");
        expect(wrapper.isDir).toBe(true);
        expect(wrapper.isFile).toBe(false);
        expect(wrapper.handle).toBe(nativeHandle);
    });

    test("getDirectoryHandle creates and returns a new directory wrapper", async () => {
        const rootWrapper = new WebDirectoryHandle(
            mockRootDirectory,
            "/",
            mockResolveHandle,
        );
        const childDir = await rootWrapper.getDirectoryHandle("newDir", {
            create: true,
        });
        expect(childDir).toBeInstanceOf(WebDirectoryHandle);
        expect(childDir.name).toBe("newDir");
        expect(childDir.path).toBe("/newDir");
    });

    test("getFileHandle creates and returns a new file wrapper", async () => {
        const rootWrapper = new WebDirectoryHandle(
            mockRootDirectory,
            "/",
            mockResolveHandle,
        );
        const childFile = await rootWrapper.getFileHandle("newFile.txt", {
            create: true,
        });
        expect(childFile).toBeInstanceOf(WebFileHandle);
        expect(childFile.name).toBe("newFile.txt");
        expect(childFile.path).toBe("/newFile.txt");
    });

    test("propagates write backend to getFileHandle wrappers", async () => {
        const { backend, asText } = createMockWriteBackend();
        const rootWrapper = new WebDirectoryHandle(
            mockRootDirectory,
            "/",
            mockResolveHandle,
            backend,
        );
        const childFile = await rootWrapper.getFileHandle("backendFile.txt", {
            create: true,
        });

        const writable = await childFile.createWritable();
        await writable.write("hello");
        await writable.close();

        expect(asText("/backendFile.txt")).toBe("hello");
        expect(backend.write).toHaveBeenCalledWith(
            "/backendFile.txt",
            expect.any(Uint8Array),
        );
    });

    test("removeEntry removes a child entry", async () => {
        const rootWrapper = new WebDirectoryHandle(
            mockRootDirectory,
            "/",
            mockResolveHandle,
        );
        await rootWrapper.getFileHandle("toRemove.txt", { create: true });
        let entries: [string, IPathHandle][] = [];
        for await (const entry of rootWrapper.entries()) {
            entries.push(entry);
        }
        expect(entries).toHaveLength(1);

        await rootWrapper.removeEntry("toRemove.txt");
        entries = [];
        for await (const entry of rootWrapper.entries()) {
            entries.push(entry);
        }
        expect(entries).toHaveLength(0);
    });

    test("entries iterates through children and returns wrappers", async () => {
        const file1 = new MockFileSystemFileHandle("file1.txt");
        const dir1 = new MockFileSystemDirectoryHandle("dir1");
        mockRootDirectory.entriesMap.set("file1.txt", file1);
        mockRootDirectory.entriesMap.set("dir1", dir1);

        const rootWrapper = new WebDirectoryHandle(
            mockRootDirectory,
            "/",
            mockResolveHandle,
        );
        const entries: [string, IPathHandle][] = [];
        for await (const entry of rootWrapper.entries()) {
            entries.push(entry);
        }

        expect(entries).toHaveLength(2);
        expect(entries[0][0]).toBe("file1.txt");
        expect(entries[0][1]).toBeInstanceOf(WebFileHandle);
        expect(entries[1][0]).toBe("dir1");
        expect(entries[1][1]).toBeInstanceOf(WebDirectoryHandle);
    });

    test("propagates write backend to entries wrappers", async () => {
        const { backend, asText } = createMockWriteBackend();
        await mockRootDirectory.getFileHandle("entry.txt", { create: true });
        const rootWrapper = new WebDirectoryHandle(
            mockRootDirectory,
            "/",
            mockResolveHandle,
            backend,
        );

        let fileWrapper: WebFileHandle | null = null;
        for await (const [, entry] of rootWrapper.entries()) {
            if (entry.kind === "file") {
                fileWrapper = entry as WebFileHandle;
                break;
            }
        }

        expect(fileWrapper).toBeInstanceOf(WebFileHandle);
        if (!fileWrapper) {
            throw new Error("Expected file wrapper in directory entries");
        }
        const writable = await fileWrapper.createWritable();
        await writable.write("entry-write");
        await writable.close();

        expect(asText("/entry.txt")).toBe("entry-write");
    });

    test("getParent returns the parent directory wrapper for a nested path", async () => {
        await mockRootDirectory.getDirectoryHandle("level1", { create: true });
        const level1Native = (await mockRootDirectory.getDirectoryHandle(
            "level1",
        )) as MockFileSystemDirectoryHandle;
        await level1Native.getDirectoryHandle("level2", { create: true });

        const level2Wrapper = new WebDirectoryHandle(
            await (level1Native.getDirectoryHandle(
                "level2",
            ) as Promise<MockFileSystemDirectoryHandle>),
            "/level1/level2",
            mockResolveHandle,
        );

        const parent = await level2Wrapper.getParent();
        expect(parent).toBeInstanceOf(WebDirectoryHandle);
        expect(parent.path).toBe("/level1");
        expect(parent.name).toBe("level1");
    });

    test("getParent returns the root directory for a top-level directory", async () => {
        const level1Wrapper = new WebDirectoryHandle(
            (await mockRootDirectory.getDirectoryHandle("level1", {
                create: true,
            })) as MockFileSystemDirectoryHandle,
            "/level1",
            mockResolveHandle,
        );
        const parent = await level1Wrapper.getParent();
        expect(parent).toBeInstanceOf(WebDirectoryHandle);
        expect(parent.path).toBe("/");
        expect(parent.name).toBe("/");
    });

    test("getAbsolutePath returns the correct absolute path", async () => {
        const nativeHandle = new MockFileSystemDirectoryHandle("testDir");
        const wrapper = new WebDirectoryHandle(
            nativeHandle,
            "/root/testDir",
            mockResolveHandle,
        );
        await expect(wrapper.getAbsolutePath()).resolves.toBe("/root/testDir");
    });

    test("asFileHandle returns null", () => {
        const nativeHandle = new MockFileSystemDirectoryHandle("testDir");
        const wrapper = new WebDirectoryHandle(
            nativeHandle,
            "/root/testDir",
            mockResolveHandle,
        );
        expect(wrapper.asFileHandle()).toBeNull();
    });

    test("asDirectoryHandle returns itself", () => {
        const nativeHandle = new MockFileSystemDirectoryHandle("testDir");
        const wrapper = new WebDirectoryHandle(
            nativeHandle,
            "/root/testDir",
            mockResolveHandle,
        );
        expect(wrapper.asDirectoryHandle()).toBe(wrapper);
    });

    test("getDirectoryHandle for current directory returns itself", async () => {
        const level1 = await mockRootDirectory.getDirectoryHandle("level1", {
            create: true,
        });
        const level1Wrapper = new WebDirectoryHandle(
            level1,
            "/level1",
            mockResolveHandle,
        );

        const currentDirHandle = await level1Wrapper.getDirectoryHandle(".");
        expect(currentDirHandle).toBeInstanceOf(WebDirectoryHandle);
        expect(currentDirHandle.path).toBe("/level1");
        expect(currentDirHandle.name).toBe("level1");
    });

    test("getDirectoryHandle for parent directory returns parent", async () => {
        const level1 = await mockRootDirectory.getDirectoryHandle("level1", {
            create: true,
        });
        const level2 = await level1.getDirectoryHandle("level2", {
            create: true,
        });
        const level2Wrapper = new WebDirectoryHandle(
            level2,
            "/level1/level2",
            mockResolveHandle,
        );

        const parentDirHandle = await level2Wrapper.getDirectoryHandle("..");
        expect(parentDirHandle).toBeInstanceOf(WebDirectoryHandle);
        expect(parentDirHandle.path).toBe("/level1");
        expect(parentDirHandle.name).toBe("level1");
    });

    test("getFileHandle for file in parent directory ('../file.txt')", async () => {
        const level1 = await mockRootDirectory.getDirectoryHandle("level1", {
            create: true,
        });
        const level2 = await level1.getDirectoryHandle("level2", {
            create: true,
        });
        const level2Wrapper = new WebDirectoryHandle(
            level2,
            "/level1/level2",
            mockResolveHandle,
        );

        const siblingFileHandle = await level2Wrapper.getFileHandle(
            "../sibling.txt",
            { create: true },
        );
        expect(siblingFileHandle).toBeInstanceOf(WebFileHandle);
        expect(siblingFileHandle.path).toBe("/level1/sibling.txt");
        expect(siblingFileHandle.name).toBe("sibling.txt");

        // Verify it was created in the native parent directory
        const level1Native =
            await mockRootDirectory.getDirectoryHandle("level1");
        await level1Native.getFileHandle("sibling.txt"); // Should not throw if exists
    });

    test("getDirectoryHandle for mixed relative path ('./../anotherDir')", async () => {
        const level1 = await mockRootDirectory.getDirectoryHandle("level1", {
            create: true,
        });
        const level2 = await level1.getDirectoryHandle("level2", {
            create: true,
        });
        const level2Wrapper = new WebDirectoryHandle(
            level2,
            "/level1/level2",
            mockResolveHandle,
        );

        const anotherDirHandle = await level2Wrapper.getDirectoryHandle(
            "./../anotherDir",
            { create: true },
        );
        expect(anotherDirHandle).toBeInstanceOf(WebDirectoryHandle);
        expect(anotherDirHandle.path).toBe("/level1/anotherDir");
        expect(anotherDirHandle.name).toBe("anotherDir");

        // Verify native structure
        const level1Native =
            await mockRootDirectory.getDirectoryHandle("level1");
        await level1Native.getDirectoryHandle("anotherDir"); // Should not throw if exists
    });

    test("getDirectoryHandle with absolute path from nested directory creates at root", async () => {
        await mockRootDirectory.getDirectoryHandle("nested", { create: true });
        const nestedWrapper = new WebDirectoryHandle(
            await mockRootDirectory.getDirectoryHandle("nested"),
            "/nested",
            mockResolveHandle,
        );

        const absoluteDirHandle = await nestedWrapper.getDirectoryHandle(
            "/newAbsoluteDir",
            { create: true },
        );
        expect(absoluteDirHandle).toBeInstanceOf(WebDirectoryHandle);
        expect(absoluteDirHandle.path).toBe("/newAbsoluteDir");
        expect(absoluteDirHandle.name).toBe("newAbsoluteDir");

        // Verify it's at the root natively
        await mockRootDirectory.getDirectoryHandle("newAbsoluteDir");
        // Ensure the original nested directory still exists
        await mockRootDirectory.getDirectoryHandle("nested");
    });

    test("getFileHandle with absolute path from nested directory creates at root", async () => {
        await mockRootDirectory.getDirectoryHandle("nested", { create: true });
        const nestedWrapper = new WebDirectoryHandle(
            await mockRootDirectory.getDirectoryHandle("nested"),
            "/nested",
            mockResolveHandle,
        );

        const absoluteFileHandle = await nestedWrapper.getFileHandle(
            "/newAbsoluteFile.txt",
            { create: true },
        );
        expect(absoluteFileHandle).toBeInstanceOf(WebFileHandle);
        expect(absoluteFileHandle.path).toBe("/newAbsoluteFile.txt");
        expect(absoluteFileHandle.name).toBe("newAbsoluteFile.txt");

        // Verify it's at the root natively
        await mockRootDirectory.getFileHandle("newAbsoluteFile.txt");
        // Ensure the original nested directory still exists
        await mockRootDirectory.getDirectoryHandle("nested");
    });

    test("getDirectoryHandle with path containing consecutive slashes is normalized", async () => {
        const rootWrapper = new WebDirectoryHandle(
            mockRootDirectory,
            "/",
            mockResolveHandle,
        );
        const dirHandle = await rootWrapper.getDirectoryHandle(
            "//test//dir//",
            {
                create: true,
            },
        );
        expect(dirHandle).toBeInstanceOf(WebDirectoryHandle);
        expect(dirHandle.path).toBe("/test/dir");
        expect(dirHandle.name).toBe("dir");

        const testDir = await mockRootDirectory.getDirectoryHandle("test");
        await testDir.getDirectoryHandle("dir");
    });

    test("getFileHandle handles deep relative parent paths (e.g., ../../../)", async () => {
        // Setup: /a/b/c/ structure
        const a = await mockRootDirectory.getDirectoryHandle("a", {
            create: true,
        });
        const b = await a.getDirectoryHandle("b", { create: true });
        const c = await b.getDirectoryHandle("c", { create: true });

        // Create a wrapper for /a/b/c
        const cWrapper = new WebDirectoryHandle(c, "/a/b/c", mockResolveHandle);

        // Try to create a directory from /a/b/c using a deep relative path
        const newDirRelativePath = "../../../d/newDir";
        const newDirHandle = await cWrapper.getDirectoryHandle(
            newDirRelativePath,
            {
                create: true,
            },
        );

        expect(newDirHandle).toBeInstanceOf(WebDirectoryHandle);
        expect(newDirHandle.path).toBe("/d/newDir");
        expect(newDirHandle.name).toBe("newDir");

        // Verify the native structure was created correctly
        const rootDir = mockRootDirectory; // The mock root handle
        const dDir = await rootDir.getDirectoryHandle("d");
        const finalDir = await dDir.getDirectoryHandle("newDir");
        expect(finalDir).toBeInstanceOf(MockFileSystemDirectoryHandle);

        // Clean up: verify root.removeEntry is called correctly
        await rootDir.removeEntry("a", { recursive: true });
        await rootDir.removeEntry("d", { recursive: true });
        // expect(mockRootDirectory.entriesMap.size).toBe(0);
    });

    test("getFileHandle handles deep relative parent paths (e.g., ../../../)", async () => {
        // Setup: /x/y/z/ structure
        const x = await mockRootDirectory.getDirectoryHandle("x", {
            create: true,
        });
        const y = await x.getDirectoryHandle("y", { create: true });
        const z = await y.getDirectoryHandle("z", { create: true });

        // Create a wrapper for /x/y/z
        const zWrapper = new WebDirectoryHandle(z, "/x/y/z", mockResolveHandle);

        // Try to create a file from /x/y/z using a deep relative path
        const newFileRelativePath = "../../../e/newFile.txt";
        const newFileHandle = await zWrapper.getFileHandle(
            newFileRelativePath,
            {
                create: true,
            },
        );

        expect(newFileHandle).toBeInstanceOf(WebFileHandle);
        expect(newFileHandle.path).toBe("/e/newFile.txt");
        expect(newFileHandle.name).toBe("newFile.txt");

        // Verify the native structure was created correctly
        const rootDir = mockRootDirectory; // The mock root handle
        const eDir = await rootDir.getDirectoryHandle("e");
        const finalFile = await eDir.getFileHandle("newFile.txt");
        expect(finalFile).toBeInstanceOf(MockFileSystemFileHandle);

        // Clean up
        await rootDir.removeEntry("x", { recursive: true });
        await rootDir.removeEntry("e", { recursive: true });
        // expect(mockRootDirectory.entriesMap.size).toBe(0);
    });
});

describe("WebFileHandle", () => {
    let mockResolveHandle: (path: string) => Promise<IPathHandle>;

    beforeEach(() => {
        // Reset the mock root directory for each test
        mockRootDirectory.entriesMap.clear();

        // Simulate the behavior of WebDirectoryProvider's getHandle
        mockResolveHandle = async (path: string): Promise<IPathHandle> => {
            const parts = path.split("/").filter(Boolean);
            let currentNativeHandle: MockFileSystemDirectoryHandle =
                mockRootDirectory;
            let currentPath = "";

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                currentPath += `/${part}`;

                if (i === parts.length - 1) {
                    // Last part, could be file or directory
                    try {
                        const fileHandle =
                            await currentNativeHandle.getFileHandle(part);
                        return new WebFileHandle(
                            fileHandle,
                            currentPath,
                            mockResolveHandle,
                        );
                    } catch {
                        const dirHandle =
                            await currentNativeHandle.getDirectoryHandle(part);
                        return new WebDirectoryHandle(
                            dirHandle,
                            currentPath,
                            mockResolveHandle,
                        );
                    }
                } else {
                    // Intermediate part, must be a directory
                    currentNativeHandle =
                        await currentNativeHandle.getDirectoryHandle(part);
                }
            }
            // If path is '/', return the root directory itself
            return new WebDirectoryHandle(
                mockRootDirectory,
                "/",
                mockResolveHandle,
            );
        };
    });

    test("constructor sets properties correctly for file", () => {
        const nativeHandle = new MockFileSystemFileHandle("testFile.txt");
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/root/testFile.txt",
            mockResolveHandle,
        );
        expect(wrapper.kind).toBe("file");
        expect(wrapper.name).toBe("testFile.txt");
        expect(wrapper.path).toBe("/root/testFile.txt");
        expect(wrapper.isDir).toBe(false);
        expect(wrapper.isFile).toBe(true);
        expect(wrapper.handle).toBe(nativeHandle);
    });

    test("getFile returns the underlying File object with correct content", async () => {
        const fileContent = "Hello, world!";
        const nativeHandle = new MockFileSystemFileHandle(
            "test.txt",
            fileContent,
        );
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/test.txt",
            mockResolveHandle,
        );
        const file = await wrapper.getFile();
        expect(file).toBeInstanceOf(MockFile);
        expect(file.name).toBe("test.txt");
        expect(await file.text()).toBe(fileContent);
    });

    test("createWritable and write update file content", async () => {
        const nativeHandle = new MockFileSystemFileHandle(
            "test.txt",
            "initial content",
        );
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/test.txt",
            mockResolveHandle,
        );

        const newContent = "Updated content!";
        const writable = await wrapper.createWritable();
        await writable.write(newContent);
        await writable.close();

        const file = await wrapper.getFile();
        expect(await file.text()).toBe(newContent);
    });

    test("createWritable with backend writes through backend", async () => {
        const { backend, asText } = createMockWriteBackend();
        const nativeHandle = new MockFileSystemFileHandle("test.txt", "");
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/test.txt",
            mockResolveHandle,
            backend,
        );

        const writable = await wrapper.createWritable();
        await writable.write("backend-content");
        await writable.close();

        expect(asText("/test.txt")).toBe("backend-content");
        expect(backend.write).toHaveBeenCalledWith(
            "/test.txt",
            expect.any(Uint8Array),
        );
    });

    test("createWritable keepExistingData appends from backend read", async () => {
        const { backend, asText } = createMockWriteBackend({
            "/append.txt": "hello",
        });
        const nativeHandle = new MockFileSystemFileHandle("append.txt", "");
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/append.txt",
            mockResolveHandle,
            backend,
        );

        const writable = await wrapper.createWritable({
            keepExistingData: true,
        });
        await writable.write(" world");
        await writable.close();

        expect(asText("/append.txt")).toBe("hello world");
    });

    test("createWritable supports seek and positional writes", async () => {
        const { backend, asText } = createMockWriteBackend({
            "/seek.txt": "hello",
        });
        const nativeHandle = new MockFileSystemFileHandle("seek.txt", "");
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/seek.txt",
            mockResolveHandle,
            backend,
        );

        const writable = await wrapper.createWritable({
            keepExistingData: true,
        });
        await writable.seek(1);
        await writable.write("A");
        await writable.close();

        expect(asText("/seek.txt")).toBe("hAllo");
    });

    test("createWritable supports truncate", async () => {
        const { backend, asText } = createMockWriteBackend({
            "/truncate.txt": "hello",
        });
        const nativeHandle = new MockFileSystemFileHandle("truncate.txt", "");
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/truncate.txt",
            mockResolveHandle,
            backend,
        );

        const writable = await wrapper.createWritable({
            keepExistingData: true,
        });
        await writable.truncate(2);
        await writable.close();

        expect(asText("/truncate.txt")).toBe("he");
    });

    test("getParent returns the parent directory wrapper", async () => {
        await mockRootDirectory.getDirectoryHandle("level1", { create: true });
        const level1Native = (await mockRootDirectory.getDirectoryHandle(
            "level1",
        )) as MockFileSystemDirectoryHandle;
        await level1Native.getFileHandle("myFile.txt", { create: true });

        const fileWrapper = new WebFileHandle(
            await (level1Native.getFileHandle(
                "myFile.txt",
            ) as Promise<MockFileSystemFileHandle>),
            "/level1/myFile.txt",
            mockResolveHandle,
        );

        const parent = await fileWrapper.getParent();
        expect(parent).toBeInstanceOf(WebDirectoryHandle);
        expect(parent.path).toBe("/level1");
        expect(parent.name).toBe("level1");
    });

    test("getParent returns the root directory for a top-level file", async () => {
        const fileWrapper = new WebFileHandle(
            (await mockRootDirectory.getFileHandle("topFile.txt", {
                create: true,
            })) as MockFileSystemFileHandle,
            "/topFile.txt",
            mockResolveHandle,
        );
        const parent = await fileWrapper.getParent();
        expect(parent).toBeInstanceOf(WebDirectoryHandle);
        expect(parent.path).toBe("/");
        expect(parent.name).toBe("/");
    });

    test("getAbsolutePath returns the correct absolute path", async () => {
        const nativeHandle = new MockFileSystemFileHandle("testFile.txt");
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/root/testFile.txt",
            mockResolveHandle,
        );
        await expect(wrapper.getAbsolutePath()).resolves.toBe(
            "/root/testFile.txt",
        );
    });

    test("asFileHandle returns itself", () => {
        const nativeHandle = new MockFileSystemFileHandle("testFile.txt");
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/root/testFile.txt",
            mockResolveHandle,
        );
        expect(wrapper.asFileHandle()).toBe(wrapper);
    });

    test("asDirectoryHandle returns null", () => {
        const nativeHandle = new MockFileSystemFileHandle("testFile.txt");
        const wrapper = new WebFileHandle(
            nativeHandle,
            "/root/testFile.txt",
            mockResolveHandle,
        );
        expect(wrapper.asDirectoryHandle()).toBeNull();
    });
});
