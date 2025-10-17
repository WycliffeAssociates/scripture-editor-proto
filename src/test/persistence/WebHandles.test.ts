import { describe, test, expect, vi, beforeEach } from 'vitest';
import { WebDirectoryHandle } from "@/web/io/WebDirectoryHandle.ts";
import { WebFileHandle } from "@/web/io/WebFileHandle.ts";
import { IPathHandle } from "@/core/io/IPathHandle.ts";

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
                if (typeof data === 'string') {
                    _this.content = data;
                } else if (data instanceof Blob) {
                    _this.content = await data.text();
                } else if (data instanceof ArrayBuffer) {
                    _this.content = new TextDecoder().decode(data);
                } else if (data instanceof Uint8Array) {
                    _this.content = new TextDecoder().decode(data);
                }
            },
            async close() { /* do nothing */ },
            async abort() { /* do nothing */ },
            getWriter: vi.fn(() => ({
                write: vi.fn((data: FileSystemWriteChunkType) => {
                    if (typeof data === 'string') {
                        _this.content = data;
                    } else if (data instanceof Blob) {
                        data.text().then(text => _this.content = text);
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
    private entriesMap: Map<string, FileSystemHandle>;

    constructor(name: string, entries: Record<string, FileSystemHandle> = {}) {
        this.name = name;
        this.entriesMap = new Map(Object.entries(entries));
    }

    async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
        if (this.entriesMap.has(name) && this.entriesMap.get(name)?.kind === "directory") {
            return this.entriesMap.get(name) as MockFileSystemDirectoryHandle;
        }
        if (options?.create) {
            const newDir = new MockFileSystemDirectoryHandle(name);
            this.entriesMap.set(name, newDir);
            return newDir;
        }
        throw new Error("Directory not found");
    }

    async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
        if (this.entriesMap.has(name) && this.entriesMap.get(name)?.kind === "file") {
            return this.entriesMap.get(name) as MockFileSystemFileHandle;
        }
        if (options?.create) {
            const newFile = new MockFileSystemFileHandle(name);
            this.entriesMap.set(name, newFile);
            return newFile;
        }
        throw new Error("File not found");
    }

    async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
        if (!this.entriesMap.has(name)) {
            throw new Error("Entry not found");
        }
        const entry = this.entriesMap.get(name);
        if (entry?.kind === "directory" && !options?.recursive && (entry as MockFileSystemDirectoryHandle).entriesMap.size > 0) {
            throw new Error("Directory not empty");
        }
        this.entriesMap.delete(name);
    }

    async *entries(): FileSystemDirectoryHandleAsyncIterator<[string, FileSystemHandle]> {
        for (const [name, handle] of this.entriesMap.entries()) {
            yield [name, handle];
        }
    }

    // Mock other FileSystemDirectoryHandle methods
    async *keys(): FileSystemDirectoryHandleAsyncIterator<string> { for await (const [name] of this.entries()) yield name; }
    async *values(): FileSystemDirectoryHandleAsyncIterator<FileSystemHandle> { for await (const [, handle] of this.entries()) yield handle; }
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

    bytes(): Promise<Uint8Array> {
        throw new Error("Method not implemented.");
    }

    text = vi.fn(() => Promise.resolve(this.content));
    arrayBuffer = vi.fn(() => Promise.resolve(new TextEncoder().encode(this.content).buffer));
    slice = vi.fn(() => ({}) as Blob);
    stream = vi.fn(() => ({}) as ReadableStream<Uint8Array>);
}

// Mock navigator.storage
const mockRootDirectory = new MockFileSystemDirectoryHandle("/");
vi.mock('globalThis', () => ({
    navigator: {
        storage: {
            getDirectory: vi.fn(() => Promise.resolve(mockRootDirectory)),
        },
    },
}));


describe('WebDirectoryHandle', () => {
    let mockResolveHandle: (path: string) => Promise<IPathHandle>;

    beforeEach(() => {
        // Reset the mock root directory for each test
        mockRootDirectory.entriesMap.clear();

        // Simulate the behavior of WebDirectoryProvider's getHandle
        mockResolveHandle = async (path: string): Promise<IPathHandle> => {
            const parts = path.split("/").filter(Boolean);
            let currentNativeHandle: MockFileSystemDirectoryHandle = mockRootDirectory;
            let currentPath = "";

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                currentPath += `/${part}`;

                if (i === parts.length - 1) { // Last part, could be file or directory
                    try {
                        const fileHandle = await currentNativeHandle.getFileHandle(part);
                        return new WebFileHandle(fileHandle, currentPath, mockResolveHandle);
                    } catch {
                        const dirHandle = await currentNativeHandle.getDirectoryHandle(part);
                        return new WebDirectoryHandle(dirHandle, currentPath, mockResolveHandle);
                    }
                } else { // Intermediate part, must be a directory
                    currentNativeHandle = await currentNativeHandle.getDirectoryHandle(part);
                }
            }
            // If path is '/', return the root directory itself
            return new WebDirectoryHandle(mockRootDirectory, "/", mockResolveHandle);
        };
    });

    test('constructor sets properties correctly for directory', () => {
        const nativeHandle = new MockFileSystemDirectoryHandle('testDir');
        const wrapper = new WebDirectoryHandle(nativeHandle, '/root/testDir', mockResolveHandle);
        expect(wrapper.kind).toBe('directory');
        expect(wrapper.name).toBe('testDir');
        expect(wrapper.path).toBe('/root/testDir');
        expect(wrapper.isDir).toBe(true);
        expect(wrapper.isFile).toBe(false);
        expect(wrapper.handle).toBe(nativeHandle);
    });

    test('getDirectoryHandle creates and returns a new directory wrapper', async () => {
        const rootWrapper = new WebDirectoryHandle(mockRootDirectory, '/', mockResolveHandle);
        const childDir = await rootWrapper.getDirectoryHandle('newDir', { create: true });
        expect(childDir).toBeInstanceOf(WebDirectoryHandle);
        expect(childDir.name).toBe('newDir');
        expect(childDir.path).toBe('/newDir');
    });

    test('getFileHandle creates and returns a new file wrapper', async () => {
        const rootWrapper = new WebDirectoryHandle(mockRootDirectory, '/', mockResolveHandle);
        const childFile = await rootWrapper.getFileHandle('newFile.txt', { create: true });
        expect(childFile).toBeInstanceOf(WebFileHandle);
        expect(childFile.name).toBe('newFile.txt');
        expect(childFile.path).toBe('/newFile.txt');
    });

    test('removeEntry removes a child entry', async () => {
        const rootWrapper = new WebDirectoryHandle(mockRootDirectory, '/', mockResolveHandle);
        await rootWrapper.getFileHandle('toRemove.txt', { create: true });
        let entries: [string, IPathHandle][] = [];
        for await (const entry of rootWrapper.entries()) { entries.push(entry); }
        expect(entries).toHaveLength(1);

        await rootWrapper.removeEntry('toRemove.txt');
        entries = [];
        for await (const entry of rootWrapper.entries()) { entries.push(entry); }
        expect(entries).toHaveLength(0);
    });

    test('entries iterates through children and returns wrappers', async () => {
        const file1 = new MockFileSystemFileHandle('file1.txt');
        const dir1 = new MockFileSystemDirectoryHandle('dir1');
        mockRootDirectory.entriesMap.set('file1.txt', file1);
        mockRootDirectory.entriesMap.set('dir1', dir1);

        const rootWrapper = new WebDirectoryHandle(mockRootDirectory, '/', mockResolveHandle);
        const entries: [string, IPathHandle][] = [];
        for await (const entry of rootWrapper.entries()) {
            entries.push(entry);
        }

        expect(entries).toHaveLength(2);
        expect(entries[0][0]).toBe('file1.txt');
        expect(entries[0][1]).toBeInstanceOf(WebFileHandle);
        expect(entries[1][0]).toBe('dir1');
        expect(entries[1][1]).toBeInstanceOf(WebDirectoryHandle);
    });

    test('getParent returns the parent directory wrapper for a nested path', async () => {
        await mockRootDirectory.getDirectoryHandle('level1', { create: true });
        const level1Native = await mockRootDirectory.getDirectoryHandle('level1') as MockFileSystemDirectoryHandle;
        await level1Native.getDirectoryHandle('level2', { create: true });

        const level2Wrapper = new WebDirectoryHandle(
            await (level1Native.getDirectoryHandle('level2') as Promise<MockFileSystemDirectoryHandle>),
            '/level1/level2',
            mockResolveHandle
        );

        const parent = await level2Wrapper.getParent();
        expect(parent).toBeInstanceOf(WebDirectoryHandle);
        expect(parent.path).toBe('/level1');
        expect(parent.name).toBe('level1');
    });

    test('getParent returns the root directory for a top-level directory', async () => {
        const level1Wrapper = new WebDirectoryHandle(
            await mockRootDirectory.getDirectoryHandle('level1', { create: true }) as MockFileSystemDirectoryHandle,
            '/level1',
            mockResolveHandle
        );
        const parent = await level1Wrapper.getParent();
        expect(parent).toBeInstanceOf(WebDirectoryHandle);
        expect(parent.path).toBe('/');
        expect(parent.name).toBe('/');
    });

    test('getAbsolutePath returns the correct absolute path', async () => {
        const nativeHandle = new MockFileSystemDirectoryHandle('testDir');
        const wrapper = new WebDirectoryHandle(nativeHandle, '/root/testDir', mockResolveHandle);
        await expect(wrapper.getAbsolutePath()).resolves.toBe('/root/testDir');
    });

    test('asFileHandle returns null', () => {
        const nativeHandle = new MockFileSystemDirectoryHandle('testDir');
        const wrapper = new WebDirectoryHandle(nativeHandle, '/root/testDir', mockResolveHandle);
        expect(wrapper.asFileHandle()).toBeNull();
    });

    test('asDirectoryHandle returns itself', () => {
        const nativeHandle = new MockFileSystemDirectoryHandle('testDir');
        const wrapper = new WebDirectoryHandle(nativeHandle, '/root/testDir', mockResolveHandle);
        expect(wrapper.asDirectoryHandle()).toBe(wrapper);
    });
});

describe('WebFileHandle', () => {
    let mockResolveHandle: (path: string) => Promise<IPathHandle>;

    beforeEach(() => {
        // Reset the mock root directory for each test
        mockRootDirectory.entriesMap.clear();

        // Simulate the behavior of WebDirectoryProvider's getHandle
        mockResolveHandle = async (path: string): Promise<IPathHandle> => {
            const parts = path.split("/").filter(Boolean);
            let currentNativeHandle: MockFileSystemDirectoryHandle = mockRootDirectory;
            let currentPath = "";

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                currentPath += `/${part}`;

                if (i === parts.length - 1) { // Last part, could be file or directory
                    try {
                        const fileHandle = await currentNativeHandle.getFileHandle(part);
                        return new WebFileHandle(fileHandle, currentPath, mockResolveHandle);
                    } catch {
                        const dirHandle = await currentNativeHandle.getDirectoryHandle(part);
                        return new WebDirectoryHandle(dirHandle, currentPath, mockResolveHandle);
                    }
                } else { // Intermediate part, must be a directory
                    currentNativeHandle = await currentNativeHandle.getDirectoryHandle(part);
                }
            }
            // If path is '/', return the root directory itself
            return new WebDirectoryHandle(mockRootDirectory, "/", mockResolveHandle);
        };
    });

    test('constructor sets properties correctly for file', () => {
        const nativeHandle = new MockFileSystemFileHandle('testFile.txt');
        const wrapper = new WebFileHandle(nativeHandle, '/root/testFile.txt', mockResolveHandle);
        expect(wrapper.kind).toBe('file');
        expect(wrapper.name).toBe('testFile.txt');
        expect(wrapper.path).toBe('/root/testFile.txt');
        expect(wrapper.isDir).toBe(false);
        expect(wrapper.isFile).toBe(true);
        expect(wrapper.handle).toBe(nativeHandle);
    });

    test('getFile returns the underlying File object with correct content', async () => {
        const fileContent = 'Hello, world!';
        const nativeHandle = new MockFileSystemFileHandle('test.txt', fileContent);
        const wrapper = new WebFileHandle(nativeHandle, '/test.txt', mockResolveHandle);
        const file = await wrapper.getFile();
        expect(file).toBeInstanceOf(MockFile);
        expect(file.name).toBe('test.txt');
        expect(await file.text()).toBe(fileContent);
    });

    test('createWritable and write update file content', async () => {
        const nativeHandle = new MockFileSystemFileHandle('test.txt', 'initial content');
        const wrapper = new WebFileHandle(nativeHandle, '/test.txt', mockResolveHandle);

        const newContent = 'Updated content!';
        const writable = await wrapper.createWritable();
        await writable.write(newContent);
        await writable.close();

        const file = await wrapper.getFile();
        expect(await file.text()).toBe(newContent);
    });

    test('getParent returns the parent directory wrapper', async () => {
        await mockRootDirectory.getDirectoryHandle('level1', { create: true });
        const level1Native = await mockRootDirectory.getDirectoryHandle('level1') as MockFileSystemDirectoryHandle;
        await level1Native.getFileHandle('myFile.txt', { create: true });

        const fileWrapper = new WebFileHandle(
            await (level1Native.getFileHandle('myFile.txt') as Promise<MockFileSystemFileHandle>),
            '/level1/myFile.txt',
            mockResolveHandle
        );

        const parent = await fileWrapper.getParent();
        expect(parent).toBeInstanceOf(WebDirectoryHandle);
        expect(parent.path).toBe('/level1');
        expect(parent.name).toBe('level1');
    });

    test('getParent returns the root directory for a top-level file', async () => {
        const fileWrapper = new WebFileHandle(
            await mockRootDirectory.getFileHandle('topFile.txt', { create: true }) as MockFileSystemFileHandle,
            '/topFile.txt',
            mockResolveHandle
        );
        const parent = await fileWrapper.getParent();
        expect(parent).toBeInstanceOf(WebDirectoryHandle);
        expect(parent.path).toBe('/');
        expect(parent.name).toBe('/');
    });

    test('getAbsolutePath returns the correct absolute path', () => {
        const nativeHandle = new MockFileSystemFileHandle('testFile.txt');
        const wrapper = new WebFileHandle(nativeHandle, '/root/testFile.txt', mockResolveHandle);
        expect(wrapper.getAbsolutePath()).resolves.toBe('/root/testFile.txt');
    });

    test('asFileHandle returns itself', () => {
        const nativeHandle = new MockFileSystemFileHandle('testFile.txt');
        const wrapper = new WebFileHandle(nativeHandle, '/root/testFile.txt', mockResolveHandle);
        expect(wrapper.asFileHandle()).toBe(wrapper);
    });

    test('asDirectoryHandle returns null', () => {
        const nativeHandle = new MockFileSystemFileHandle('testFile.txt');
        const wrapper = new WebFileHandle(nativeHandle, '/root/testFile.txt', mockResolveHandle);
        expect(wrapper.asDirectoryHandle()).toBeNull();
    });
});
