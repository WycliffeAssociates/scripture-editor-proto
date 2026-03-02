import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebGitProvider } from "@/web/adapters/git/WebGitProvider.ts";
import { WebFileHandle } from "@/web/io/WebFileHandle.ts";
import { ZenFsFileWriteBackend } from "@/web/io/write/ZenFsFileWriteBackend.ts";

const gitMocks = vi.hoisted(() => ({
    statusMatrix: vi.fn(),
    remove: vi.fn(),
    add: vi.fn(),
    resolveRef: vi.fn(),
    commit: vi.fn(),
}));

vi.mock("isomorphic-git", () => ({
    statusMatrix: gitMocks.statusMatrix,
    remove: gitMocks.remove,
    add: gitMocks.add,
    resolveRef: gitMocks.resolveRef,
    commit: gitMocks.commit,
}));

class MockNativeFileHandle {
    kind: "file" = "file";
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    async getFile() {
        return new File([], this.name);
    }

    async createWritable(): Promise<FileSystemWritableFileStream> {
        throw new Error("Native writable should not be used in backend mode");
    }

    async isSameEntry() {
        return false;
    }
}

function createFakeRuntime() {
    const dataByPath = new Map<string, Uint8Array>();
    const fs = {
        promises: {
            async readFile(path: string): Promise<Uint8Array> {
                const content = dataByPath.get(path);
                if (!content) {
                    throw new Error(`ENOENT: ${path}`);
                }
                return content;
            },
            async writeFile(path: string, content: Uint8Array) {
                dataByPath.set(path, content);
            },
            async mkdir() {},
            async stat(path: string) {
                if (!dataByPath.has(path)) {
                    throw new Error(`ENOENT: ${path}`);
                }
                return {};
            },
            async rm(path: string) {
                dataByPath.delete(path);
            },
        },
    };

    return {
        runtime: {
            ensureReady: async () => {},
            fs,
        },
        dataByPath,
    };
}

describe("web write-through regression", () => {
    beforeEach(() => {
        gitMocks.statusMatrix.mockReset();
        gitMocks.remove.mockReset();
        gitMocks.add.mockReset();
        gitMocks.resolveRef.mockReset();
        gitMocks.commit.mockReset();
    });

    it("uses the same fs for WebFileHandle writes and git commitAll reads", async () => {
        const { runtime } = createFakeRuntime();
        const writeBackend = new ZenFsFileWriteBackend(runtime as never);
        const path = "/userData/projects/p/04-NUM.usfm";

        const fileHandle = new WebFileHandle(
            new MockNativeFileHandle("04-NUM.usfm"),
            path,
            async () => {
                throw new Error("resolveHandle should not be called");
            },
            writeBackend,
        );

        const writable = await fileHandle.createWritable();
        await writable.write("123456");
        await writable.close();

        gitMocks.statusMatrix.mockImplementation(
            async ({ fs, dir }: { fs: typeof runtime.fs; dir: string }) => {
                const bytes = await fs.promises.readFile(`${dir}/04-NUM.usfm`);
                if (bytes.length !== 6) {
                    throw new Error("Unexpected mismatch in file data size");
                }
                return [["04-NUM.usfm", 1, 2, 1]];
            },
        );
        gitMocks.add.mockResolvedValue(undefined);
        gitMocks.resolveRef.mockRejectedValue(new Error("Could not find HEAD"));
        gitMocks.commit.mockResolvedValue("commit-hash-1");

        const provider = new WebGitProvider(runtime as never);
        const result = await provider.commitAll(
            "/userData/projects/p",
            {
                op: "save",
                timestampIso: "2026-02-27T20:30:00.000Z",
                changedChapters: ["NUM 4"],
            },
            {
                name: "Dovetail",
                email: "noreply@dovetail.local",
            },
        );

        expect(result.hash).toBe("commit-hash-1");
        expect(gitMocks.statusMatrix).toHaveBeenCalledTimes(1);
        expect(gitMocks.add).toHaveBeenCalledWith(
            expect.objectContaining({
                dir: "/userData/projects/p",
                filepath: "04-NUM.usfm",
            }),
        );
    });
});
