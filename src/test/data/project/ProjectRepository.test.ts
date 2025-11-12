import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import { FileWriter } from "@/core/io/DefaultFileWriter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import { ProjectRepository } from "@/core/persistence/repositories/ProjectRepository.ts";
import { MockFileHandle } from "@/test/shared/mock.ts";

// Mock implementations for dependencies
let inMemoryFiles: Map<string, string> = new Map();
const mockFileWriter: IFileWriter = {
    writeFile: vi.fn(async (filename: string, content: string) => {
        inMemoryFiles.set(filename, content);
    }),
};

const mockMd5Service: IMd5Service = {
    calculateMd5: vi.fn((text: string) => Promise.resolve(`mock-md5-${text}`)),
};

// Mock data
const MOCK_USER_DATA_DIR = "/mock/user/data";
const MOCK_PROJECT_ID_1 = "project-1";
const MOCK_PROJECT_NAME_1 = "My First Project";
const MOCK_PROJECT_1: Project = {
    id: MOCK_PROJECT_ID_1,
    name: MOCK_PROJECT_NAME_1,
    files: [],
    metadata: {
        name: "",
        id: "",
        language: {
            name: "",
            id: "",
            direction: LanguageDirection.LTR,
        },
    },
    projectDir: {} as IDirectoryHandle, // Mock or actual handle
    fileWriter: mockFileWriter,
    manifestYaml: undefined,
    metadataJson: undefined,
    md5Service: mockMd5Service,
    addBook: vi.fn(),
};

const MOCK_PROJECT_ID_2 = "project-2";
const MOCK_PROJECT_NAME_2 = "Another Project";
const MOCK_PROJECT_2: Project = {
    id: MOCK_PROJECT_ID_2,
    name: MOCK_PROJECT_NAME_2,
    files: [],
    metadata: {
        name: "",
        id: "",
        language: {
            name: "",
            id: "",
            direction: LanguageDirection.LTR,
        },
    },
    projectDir: {} as IDirectoryHandle, // Mock or actual handle
    fileWriter: mockFileWriter,
    manifestYaml: undefined,
    metadataJson: undefined,
    md5Service: mockMd5Service,
    addBook: vi.fn(),
};

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
        return (this as any)?.path === (other as any)?.path;
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
    getAppPrivateDirectory: vi.fn(),
    getProjectDirectory: vi.fn(),
    newFileWriter: vi.fn(),
    newFileReader: vi.fn(),
    createTempFile: vi.fn(),
    cleanTempDirectory: vi.fn(),
    openInFileManager: vi.fn(),
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

    test("saveProject should save a project to the correct directory", async () => {
        const projectToSave = { ...MOCK_PROJECT_1 };
        await projectRepository.saveProject(projectToSave);

        expect(
            mockDirectoryProvider.getAppPublicDirectory,
        ).toHaveBeenCalledWith(undefined);

        // Simulate the directory structure being built and file being written
        const userDataDir = await mockDirectoryProvider.getAppPublicDirectory();
        const projectsDir = await userDataDir.getDirectoryHandle("projects");
        const projectDir =
            await projectsDir.getDirectoryHandle(MOCK_PROJECT_ID_1);
        const projectFile = await projectDir.getFileHandle("project.json");

        const writer = await projectFile.createWritable();
        expect(writer.write).toHaveBeenCalledWith(
            JSON.stringify(projectToSave, null, 2),
        );
        expect(writer.close).toHaveBeenCalled();
    });

    test("loadProject should load an existing project", async () => {
        // Setup a mock directory structure with a saved project
        const projectsDirMock = new MockDirectoryHandle(
            `${MOCK_USER_DATA_DIR}/projects`,
            {
                [MOCK_PROJECT_ID_1]: {
                    kind: "directory",
                    entries: {
                        "project.json": MOCK_PROJECT_1,
                    },
                },
            },
        );

        // Temporarily override getUserDataDirectory to return the pre-populated structure
        vi.spyOn(
            mockDirectoryProvider,
            "getAppPublicDirectory",
        ).mockResolvedValueOnce(
            new MockDirectoryHandle(MOCK_USER_DATA_DIR, {
                projects: projectsDirMock,
            }),
        );

        const loadedProject =
            await projectRepository.loadProject(MOCK_PROJECT_ID_1);

        // Expect the loaded project to match the mocked project, with additional properties from loader
        expect(loadedProject).toMatchObject({
            ...MOCK_PROJECT_1,
            projectDir: expect.any(MockDirectoryHandle),
            fileWriter: expect.any(FileWriter), // Check if FileWriter is instantiated
        });
        expect(
            mockDirectoryProvider.getAppPublicDirectory,
        ).toHaveBeenCalledWith(undefined);
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

    test("listProjects should return a list of all saved projects", async () => {
        // Setup a mock directory structure with multiple saved projects
        const projectsDirMock = new MockDirectoryHandle(
            `${MOCK_USER_DATA_DIR}/projects`,
            {
                [MOCK_PROJECT_ID_1]: {
                    kind: "directory",
                    entries: {
                        "project.json": MOCK_PROJECT_1,
                    },
                },
                [MOCK_PROJECT_ID_2]: {
                    kind: "directory",
                    entries: {
                        "project.json": MOCK_PROJECT_2,
                    },
                },
                "invalid-project": {
                    kind: "directory",
                    entries: {},
                }, // Should be ignored
            },
        );

        vi.spyOn(
            mockDirectoryProvider,
            "getAppPublicDirectory",
        ).mockResolvedValueOnce(
            new MockDirectoryHandle(MOCK_USER_DATA_DIR, {
                projects: projectsDirMock,
            }),
        );

        const listedProjects = await projectRepository.listProjects();

        // The listed projects will have the added properties from the loader
        expect(listedProjects).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    ...MOCK_PROJECT_1,
                    projectDir: expect.any(MockDirectoryHandle),
                    fileWriter: expect.any(FileWriter),
                    md5Service: mockMd5Service,
                }),
                expect.objectContaining({
                    ...MOCK_PROJECT_2,
                    projectDir: expect.any(MockDirectoryHandle),
                    fileWriter: expect.any(FileWriter),
                    md5Service: mockMd5Service,
                }),
            ]),
        );
        expect(
            mockDirectoryProvider.getAppPublicDirectory,
        ).toHaveBeenCalledWith(undefined);
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
