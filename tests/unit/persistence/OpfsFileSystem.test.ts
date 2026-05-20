/**
 * These are contract tests for our OPFS-backed implementation, not browser
 * integration tests for the real Origin Private File System runtime.
 *
 * We mock the native handle API and verify the logic that belongs to Zephyr:
 * path normalization, managed-root enforcement, and file operation behavior
 * over the OPFS-style handle surface. Real browser/engine behavior still needs
 * end-to-end coverage elsewhere.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpfsFileSystem } from "@/web/persistence/OpfsFileSystem.ts";
import { OpfsStorageRoots } from "@/web/persistence/OpfsStorageRoots.ts";

function createHandleError(name: string, message: string) {
    const error = new Error(message);
    error.name = name;
    return error;
}

function toUint8Array(data: FileSystemWriteChunkType): Uint8Array {
    if (typeof data === "string") return new TextEncoder().encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return new Uint8Array(0);
}

class MockFile {
    constructor(private readonly bytesValue: Uint8Array) {}
    async arrayBuffer(): Promise<ArrayBuffer> {
        const copy = new Uint8Array(this.bytesValue);
        return copy.buffer;
    }
}

class MockFileHandle {
    kind: "file" = "file";
    constructor(
        public name: string,
        private bytesValue: Uint8Array = new Uint8Array(0),
    ) {}
    async getFile(): Promise<File> {
        return new MockFile(this.bytesValue) as unknown as File;
    }
    async createWritable(): Promise<FileSystemWritableFileStream> {
        return {
            write: async (data: FileSystemWriteChunkType) => {
                this.bytesValue = toUint8Array(data);
            },
            close: async () => {},
            abort: async () => {},
            getWriter: () => {
                throw new Error("Not implemented");
            },
            locked: false,
        } as unknown as FileSystemWritableFileStream;
    }
}

class MockDirectoryHandle {
    kind: "directory" = "directory";
    entriesMap = new Map<string, MockDirectoryHandle | MockFileHandle>();
    constructor(public name: string) {}
    async getDirectoryHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<MockDirectoryHandle> {
        const existing = this.entriesMap.get(name);
        if (existing instanceof MockDirectoryHandle) return existing;
        if (existing) {
            throw createHandleError("TypeMismatchError", `Expected directory ${name}`);
        }
        if (opts?.create) {
            const created = new MockDirectoryHandle(name);
            this.entriesMap.set(name, created);
            return created;
        }
        throw createHandleError("NotFoundError", `Missing directory ${name}`);
    }
    async getFileHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<MockFileHandle> {
        const existing = this.entriesMap.get(name);
        if (existing instanceof MockFileHandle) return existing;
        if (existing) {
            throw createHandleError("TypeMismatchError", `Expected file ${name}`);
        }
        if (opts?.create) {
            const created = new MockFileHandle(name);
            this.entriesMap.set(name, created);
            return created;
        }
        throw createHandleError("NotFoundError", `Missing file ${name}`);
    }
    async removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void> {
        const existing = this.entriesMap.get(name);
        if (!existing) {
            throw createHandleError("NotFoundError", `Missing entry ${name}`);
        }
        if (
            existing instanceof MockDirectoryHandle &&
            existing.entriesMap.size > 0 &&
            !opts?.recursive
        ) {
            throw createHandleError("InvalidModificationError", `Directory not empty`);
        }
        this.entriesMap.delete(name);
    }
    async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
        for (const [name, handle] of this.entriesMap.entries()) {
            yield [name, handle as unknown as FileSystemHandle];
        }
    }
}

const mockRoot = new MockDirectoryHandle("/");

describe("OpfsFileSystem", () => {
    beforeEach(() => {
        mockRoot.entriesMap.clear();
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: {
                storage: {
                    getDirectory: vi.fn(async () => mockRoot),
                },
            },
        });
    });

    it("writes and reads text through managed OPFS paths", async () => {
        const fs = new OpfsFileSystem(new OpfsStorageRoots());
        await fs.writeText("/userData/projects/reg/63-1JN.usfm", "\\id 1JN");
        await expect(
            fs.readText("/userData/projects/reg/63-1JN.usfm"),
        ).resolves.toBe("\\id 1JN");
    });

    it("lists typed entries for a managed directory", async () => {
        const fs = new OpfsFileSystem(new OpfsStorageRoots());
        await fs.writeText("/userData/projects/reg/63-1JN.usfm", "a");
        const entries = await fs.list("/userData/projects/reg");
        expect(entries).toEqual([
            {
                kind: "file",
                name: "63-1JN.usfm",
                path: "/userData/projects/reg/63-1JN.usfm",
            },
        ]);
    });

    it("moves content between managed paths", async () => {
        const fs = new OpfsFileSystem(new OpfsStorageRoots());
        await fs.writeText("/userData/projects/reg/63-1JN.usfm", "content");
        await fs.move(
            "/userData/projects/reg/63-1JN.usfm",
            "/userData/projects/reg/renamed.usfm",
        );
        await expect(
            fs.exists("/userData/projects/reg/63-1JN.usfm"),
        ).resolves.toBe(false);
        await expect(
            fs.readText("/userData/projects/reg/renamed.usfm"),
        ).resolves.toBe("content");
    });

    it("creates temp files inside the temp root", async () => {
        const fs = new OpfsFileSystem(new OpfsStorageRoots());
        const tempPath = await fs.createTempFile("import-", ".zip");
        expect(tempPath).toMatch(/^\/appData\/temp\/import-\d+\.zip$/);
        await expect(fs.exists(tempPath)).resolves.toBe(true);
    });

    it("allows app-local files directly beneath the app data root", async () => {
        const fs = new OpfsFileSystem(new OpfsStorageRoots());
        await fs.writeText(
            "/appData/git-remote/git-remote-session.json",
            '{"username":"alice"}',
        );

        await expect(
            fs.readText("/appData/git-remote/git-remote-session.json"),
        ).resolves.toBe('{"username":"alice"}');
    });

    it("supports namespaced storage roots for isolated browser runs", async () => {
        const roots = new OpfsStorageRoots("pw-worker-2");
        expect(roots.appDataRoot).toBe("/appData/pw-worker-2");
        expect(roots.projectsRoot).toBe("/userData/pw-worker-2/projects");
        expect(roots.tempRoot).toBe("/appData/pw-worker-2/temp");
        expect(roots.cacheRoot).toBe("/appData/pw-worker-2/cache");
        expect(roots.logsRoot).toBe("/appData/pw-worker-2/logs");
        expect(roots.databaseRoot).toBe("/appData/pw-worker-2/database");
    });
});
