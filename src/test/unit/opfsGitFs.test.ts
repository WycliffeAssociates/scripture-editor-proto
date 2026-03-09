import { beforeEach, describe, expect, it } from "vitest";
import { OpfsGitFs } from "@/web/adapters/git/OpfsGitFs.ts";
import { WebGitProvider } from "@/web/adapters/git/WebGitProvider.ts";

function createHandleError(name: string, message: string) {
    const error = new Error(message);
    error.name = name;
    return error;
}

function toUint8Array(data: FileSystemWriteChunkType): Uint8Array {
    if (typeof data === "string") {
        return new TextEncoder().encode(data);
    }
    if (data instanceof Blob) {
        throw new Error("Blob writes are not supported in mock OPFS");
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        data.type === "write"
    ) {
        return toUint8Array(data.data ?? new Uint8Array(0));
    }
    return new Uint8Array(0);
}

class MockOpfsFile implements File {
    readonly lastModified: number;
    readonly name: string;
    readonly size: number;
    readonly type = "";
    readonly webkitRelativePath = "";

    constructor(
        name: string,
        private readonly bytesValue: Uint8Array,
        lastModified = Date.now(),
    ) {
        this.name = name;
        this.lastModified = lastModified;
        this.size = bytesValue.byteLength;
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        return this.bytesValue.slice().buffer;
    }

    async bytes(): Promise<Uint8Array<ArrayBuffer>> {
        const copy = new Uint8Array(this.bytesValue.byteLength);
        copy.set(this.bytesValue);
        return copy as unknown as Uint8Array<ArrayBuffer>;
    }

    slice(): Blob {
        throw new Error("Not implemented");
    }

    stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
        throw new Error("Not implemented");
    }

    async text(): Promise<string> {
        return new TextDecoder().decode(this.bytesValue);
    }
}

class MockFileSystemFileHandle {
    kind: "file" = "file";
    lastModified = Date.now();
    name: string;
    private bytesValue = new Uint8Array(0);

    constructor(name: string) {
        this.name = name;
    }

    async getFile(): Promise<File> {
        return new MockOpfsFile(this.name, this.bytesValue, this.lastModified);
    }

    async createWritable(
        options?: FileSystemCreateWritableOptions,
    ): Promise<FileSystemWritableFileStream> {
        let nextBytes: Uint8Array = options?.keepExistingData
            ? new Uint8Array(this.bytesValue)
            : new Uint8Array(0);
        return {
            write: async (data: FileSystemWriteChunkType) => {
                nextBytes = new Uint8Array(toUint8Array(data));
            },
            close: async () => {
                this.bytesValue = new Uint8Array(nextBytes);
                this.lastModified = Date.now();
            },
            abort: async () => {},
            getWriter: () => {
                throw new Error("Not implemented");
            },
            locked: false,
        } as unknown as FileSystemWritableFileStream;
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return other === this;
    }
}

class MockFileSystemDirectoryHandle {
    kind: "directory" = "directory";
    entriesMap = new Map<
        string,
        MockFileSystemDirectoryHandle | MockFileSystemFileHandle
    >();
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    async getDirectoryHandle(
        name: string,
        options?: { create?: boolean },
    ): Promise<MockFileSystemDirectoryHandle> {
        const existing = this.entriesMap.get(name);
        if (existing instanceof MockFileSystemDirectoryHandle) {
            return existing;
        }
        if (existing) {
            throw createHandleError(
                "TypeMismatchError",
                `Expected directory at ${name}`,
            );
        }
        if (options?.create) {
            const handle = new MockFileSystemDirectoryHandle(name);
            this.entriesMap.set(name, handle);
            return handle;
        }
        throw createHandleError("NotFoundError", `Missing directory: ${name}`);
    }

    async getFileHandle(
        name: string,
        options?: { create?: boolean },
    ): Promise<MockFileSystemFileHandle> {
        const existing = this.entriesMap.get(name);
        if (existing instanceof MockFileSystemFileHandle) {
            return existing;
        }
        if (existing) {
            throw createHandleError(
                "TypeMismatchError",
                `Expected file at ${name}`,
            );
        }
        if (options?.create) {
            const handle = new MockFileSystemFileHandle(name);
            this.entriesMap.set(name, handle);
            return handle;
        }
        throw createHandleError("NotFoundError", `Missing file: ${name}`);
    }

    async removeEntry(
        name: string,
        options?: { recursive?: boolean },
    ): Promise<void> {
        const entry = this.entriesMap.get(name);
        if (!entry) {
            throw createHandleError("NotFoundError", `Missing entry: ${name}`);
        }
        if (
            entry instanceof MockFileSystemDirectoryHandle &&
            entry.entriesMap.size > 0 &&
            !options?.recursive
        ) {
            throw createHandleError(
                "InvalidModificationError",
                `Directory not empty: ${name}`,
            );
        }
        this.entriesMap.delete(name);
    }

    async *entries(): FileSystemDirectoryHandleAsyncIterator<
        [string, FileSystemHandle]
    > {
        for (const entry of this.entriesMap.entries()) {
            yield entry as [string, FileSystemHandle];
        }
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return other === this;
    }

    async *keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        for (const [name] of this.entriesMap) {
            yield name;
        }
    }

    async *values(): FileSystemDirectoryHandleAsyncIterator<FileSystemHandle> {
        for (const [, handle] of this.entriesMap) {
            yield handle as FileSystemHandle;
        }
    }

    resolve(): Promise<string[] | null> {
        return Promise.resolve(null);
    }

    [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<
        [string, FileSystemHandle]
    > {
        return this.entries();
    }
}

describe("OpfsGitFs", () => {
    let root: MockFileSystemDirectoryHandle;

    beforeEach(() => {
        root = new MockFileSystemDirectoryHandle("");
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: {
                storage: {
                    getDirectory: async () => root,
                },
            },
        });
    });

    it("supports basic sibling file writes and stats through OPFS", async () => {
        const runtime = new OpfsGitFs();
        await runtime.ensureReady();

        await runtime.fs.promises.mkdir("/appData/temp/example", {
            recursive: true,
        });
        await runtime.fs.promises.writeFile(
            "/appData/temp/example/manifest.yaml",
            "name: test",
        );
        await runtime.fs.promises.writeFile(
            "/appData/temp/example/01-GEN.usfm",
            "\\id GEN",
        );

        const names = await runtime.fs.promises.readdir(
            "/appData/temp/example",
        );
        expect([...names].sort()).toEqual(["01-GEN.usfm", "manifest.yaml"]);

        const stat = await runtime.fs.promises.lstat(
            "/appData/temp/example/manifest.yaml",
        );
        expect(stat.isFile()).toBe(true);
        expect(stat.isDirectory()).toBe(false);
        expect(stat.mode).toBe(0o100644);

        const dirStat = await runtime.fs.promises.stat("/appData/temp/example");
        expect(dirStat.isDirectory()).toBe(true);
        expect(dirStat.mode).toBe(0o040755);
    });

    it("works with WebGitProvider and real isomorphic-git operations", async () => {
        const runtime = new OpfsGitFs();
        const provider = new WebGitProvider(runtime);
        const dir = "/userData/projects/opfs-git";

        await provider.ensureRepo(dir, { defaultBranch: "main" });
        await runtime.fs.promises.writeFile(
            `${dir}/manifest.yaml`,
            "title: OPFS",
        );

        const commit = await provider.commitAll(
            dir,
            {
                op: "baseline",
                timestampIso: "2026-03-06T12:00:00.000Z",
                changedChapters: [],
            },
            { name: "Dovetail", email: "noreply@dovetail.local" },
        );

        expect(commit.hash).toBeTruthy();

        const history = await provider.listHistory(dir, {
            limit: 10,
            offset: 0,
        });
        expect(history).toHaveLength(1);
        expect(history[0]?.hash).toBe(commit.hash);

        const snapshot = await provider.readProjectSnapshotAtCommit(
            dir,
            commit.hash,
        );
        expect(snapshot.get("manifest.yaml")).toBe("title: OPFS");
    });
});
