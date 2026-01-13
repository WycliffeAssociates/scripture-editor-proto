/** biome-ignore-all lint/suspicious/noExplicitAny: <testing mocks with any is acceptable for test files where scope is one specific thing usually> */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { db as mockedDb } from "@/app/db/__mocks__/db.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
// import type {IFileWriter} from "@/core/io/IFileWriter.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import { ProjectRepository } from "@/core/persistence/repositories/ProjectRepository.ts";
import { MockFileHandle } from "@/test/shared/mock.ts";

vi.mock("@/app/db/db.ts", () => {
    return { db: mockedDb };
});

// Mock implementations for dependencies
let inMemoryFiles: Map<string, string> = new Map();
const _mockFileWriter: IFileWriter = {
    writeFile: vi.fn(async (filename: string, content: string) => {
        inMemoryFiles.set(filename, content);
    }),
};

const mockMd5Service: IMd5Service = {
    calculateMd5: vi.fn((text: string) => Promise.resolve(`mock-md5-${text}`)),
};

// Mock data
const MOCK_USER_DATA_DIR = "/mock/user/data";

class MockDirectoryHandle implements IDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    path: string; // Keep for internal mock logic, not Project interface
    private entriesMap: Map<string, MockDirectoryHandle | MockFileHandle>;
    isDir: boolean = true;
    isFile: boolean = false;

    constructor(path: string, initialEntries: Record<string, any> = {}) {
        this.path = path;
        this.name = path.split("/").pop() || "";
        this.entriesMap = new Map();
        for (const [name, content] of Object.entries(initialEntries)) {
            if (typeof content === "string") {
                this.entriesMap.set(
                    name,
                    new MockFileHandle(`${path}/${name}`, content),
                );
            } else if (
                content &&
                typeof content === "object" &&
                content.kind === "directory"
            ) {
                this.entriesMap.set(
                    name,
                    new MockDirectoryHandle(`${path}/${name}`, content.entries),
                );
            } else {
                this.entriesMap.set(
                    name,
                    new MockFileHandle(
                        `${path}/${name}`,
                        JSON.stringify(content),
                    ),
                );
            }
        }
    }

    async getDirectoryHandle(
        name: string,
        options?: { create?: boolean },
    ): Promise<IDirectoryHandle> {
        const fullPath = `${this.path}/${name}`;
        let handle = this.entriesMap.get(name);
        if (!handle || handle.kind !== "directory") {
            if (options?.create) {
                handle = new MockDirectoryHandle(fullPath);
                this.entriesMap.set(name, handle);
            } else {
                throw new Error(`Directory not found: ${fullPath}`);
            }
        }
        return handle as IDirectoryHandle;
    }

    async getFileHandle(
        name: string,
        options?: { create?: boolean },
    ): Promise<IFileHandle> {
        const fullPath = `${this.path}/${name}`;
        let handle = this.entriesMap.get(name);
        if (!handle || handle.kind !== "file") {
            if (options?.create) {
                handle = new MockFileHandle(fullPath, "");
                this.entriesMap.set(name, handle);
            } else {
                throw new Error(`File not found: ${fullPath}`);
            }
        }
        return handle as IFileHandle;
    }
    getParent = vi.fn(() => Promise.resolve(new MockDirectoryHandle("/")));
    asFileHandle = vi.fn(() => null);
    asDirectoryHandle = vi.fn(() => this);
    getAbsolutePath = vi.fn(() => Promise.resolve(this.path));
    containsFile = vi.fn(async (name: string) => {
        const found = Object.keys(this.entriesMap).find((fileName) => {
            return name === fileName;
        });
        return !!found;
    });
    containsDir = vi.fn(async (name: string) => {
        const found = Object.keys(this.entriesMap).find((fileName) => {
            return fileName.includes(name);
        });
        return !!found;
    });

    entries(): FileSystemDirectoryHandleAsyncIterator<[string, IPathHandle]> {
        const self = this;
        return (async function* (): FileSystemDirectoryHandleAsyncIterator<
            [string, IPathHandle]
        > {
            for (const [name, handle] of self.entriesMap.entries()) {
                yield [name, handle]; // handle must implement IPathHandle
            }
        })();
    }

    async removeEntry(name: string): Promise<void> {
        if (!this.entriesMap.has(name)) {
            throw new Error(`Entry not found: ${name}`);
        }
        this.entriesMap.delete(name);
    }

    async *keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        for (const key of this.entriesMap.keys()) yield key;
    }

    values(): FileSystemDirectoryHandleAsyncIterator<IPathHandle> {
        const self = this;
        return (async function* (): FileSystemDirectoryHandleAsyncIterator<IPathHandle> {
            for (const handle of self.entriesMap.values()) {
                yield handle; // each handle must implement IPathHandle
            }
        })();
    }

    async resolve(_other: FileSystemHandle): Promise<string[] | null> {
        // Simplified mock implementation
        return null;
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        if ("path" in other && "path" in this) {
            return this.path === other.path;
        }
        return false;
    }

    [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<
        [string, IPathHandle]
    > {
        return this.entries();
    }

    [Symbol.asyncDispose] = vi.fn(() => Promise.resolve());
}

// Mock IDirectoryProvider
const mockDirectoryProvider: IDirectoryProvider = {
    getAppPublicDirectory: vi.fn(async (appendedPath?: string) => {
        const path = appendedPath
            ? `${MOCK_USER_DATA_DIR}/${appendedPath}`
            : MOCK_USER_DATA_DIR;
        return new MockDirectoryHandle(path);
    }),
    projectsDirectory: Promise.resolve(new MockDirectoryHandle("projects")),
    getAppPrivateDirectory: vi.fn(),
    getProjectDirectory: vi.fn(),
    newFileWriter: vi.fn(),
    newFileReader: vi.fn(),
    createTempFile: vi.fn(),
    cleanTempDirectory: vi.fn(),
    openInFileManager: vi.fn(),
    removeDirectory: vi.fn(
        async (_path: string, _opts: { recursive?: boolean }) => {},
    ),
    //   getDirectoryHandle, getHandle, resolveHandle
    getDirectoryHandle: vi.fn(),
    getHandle: vi.fn(),
    resolveHandle: vi.fn(),
    databaseDirectory: Promise.resolve(
        new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/database`),
    ),
    logsDirectory: Promise.resolve(
        new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/logs`),
    ),
    cacheDirectory: Promise.resolve(
        new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/cache`),
    ),
    tempDirectory: Promise.resolve(
        new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/temp`),
    ),
};

describe("ProjectRepository", () => {
    let projectRepository: ProjectRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        inMemoryFiles = new Map();
        projectRepository = new ProjectRepository(
            mockDirectoryProvider,
            mockMd5Service,
        );
    });

    test("loadProject should return null if project does not exist", async () => {
        // Setup a mock directory with no projects
        vi.spyOn(
            mockDirectoryProvider,
            "getAppPublicDirectory",
        ).mockResolvedValueOnce(new MockDirectoryHandle(MOCK_USER_DATA_DIR));

        const loadedProject =
            await projectRepository.loadProject("non-existent-id");
        expect(loadedProject).toBeNull();
    });

    test("listProjects should return an empty array if no projects exist", async () => {
        vi.spyOn(
            mockDirectoryProvider,
            "getAppPublicDirectory",
        ).mockResolvedValueOnce(new MockDirectoryHandle(MOCK_USER_DATA_DIR));

        const listedProjects = await projectRepository.listProjects();
        expect(listedProjects).toEqual([]);
    });
});
