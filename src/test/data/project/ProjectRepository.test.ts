import { describe, test, expect, vi, beforeEach } from 'vitest';
import {LanguageDirection} from "@/core/domain/project/project.ts";
import {Project} from "@/core/persistence/ProjectRepository.ts";
import {IDirectoryProvider} from "@/core/persistence/DirectoryProvider.ts";
import {ProjectRepository} from "@/core/persistence/repositories/ProjectRepository.ts";
import {FileWriter} from "@/core/io/DefaultFileWriter.ts";
import {IFileWriter} from "@/core/io/IFileWriter.ts";
import {IMd5Service} from "@/core/domain/md5/IMd5Service.ts";

// Mock implementations for dependencies
const mockFileWriter: IFileWriter = {
    writeFile: vi.fn(() => Promise.resolve()),
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
        name: '',
        id: '',
        language: {
            name: '',
            id: '',
            direction: LanguageDirection.LTR
        }
    },
    projectDir: {} as FileSystemDirectoryHandle, // Mock or actual handle
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
        name: '',
        id: '',
        language: {
            name: '',
            id: '',
            direction: LanguageDirection.LTR
        }
    },
    projectDir: {} as FileSystemDirectoryHandle, // Mock or actual handle
    fileWriter: mockFileWriter,
    manifestYaml: undefined,
    metadataJson: undefined,
    md5Service: mockMd5Service,
    addBook: vi.fn(),
};

// Mock for FileSystemDirectoryHandle-like behavior
class MockDirectoryHandle implements FileSystemDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    path: string; // Keep for internal mock logic, not Project interface
    private entriesMap: Map<string, MockDirectoryHandle | MockFileHandle>;

    constructor(path: string, initialEntries: Record<string, any> = {}) {
        this.path = path;
        this.name = path.split('/').pop() || '';
        this.entriesMap = new Map();
        for (const [name, content] of Object.entries(initialEntries)) {
            if (typeof content === 'string') {
                this.entriesMap.set(name, new MockFileHandle(`${path}/${name}`, content));
            } else if (content && typeof content === 'object' && content.kind === 'directory') {
                this.entriesMap.set(name, new MockDirectoryHandle(`${path}/${name}`, content.entries));
            } else {
                this.entriesMap.set(name, new MockFileHandle(`${path}/${name}`, JSON.stringify(content)));
            }
        }
    }

    async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
        const fullPath = `${this.path}/${name}`;
        let handle = this.entriesMap.get(name);
        if (!handle || handle.kind !== 'directory') {
            if (options?.create) {
                handle = new MockDirectoryHandle(fullPath);
                this.entriesMap.set(name, handle);
            } else {
                throw new Error(`Directory not found: ${fullPath}`);
            }
        }
        return handle as FileSystemDirectoryHandle;
    }

    async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
        const fullPath = `${this.path}/${name}`;
        let handle = this.entriesMap.get(name);
        if (!handle || handle.kind !== 'file') {
            if (options?.create) {
                handle = new MockFileHandle(fullPath, '');
                this.entriesMap.set(name, handle);
            } else {
                throw new Error(`File not found: ${fullPath}`);
            }
        }
        return handle as FileSystemFileHandle;
    }

    async *entries(): FileSystemDirectoryHandleAsyncIterator<[string, FileSystemHandle]> {
        for (const entry of this.entriesMap.entries()) {
            yield entry;
        }
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

    async *values(): FileSystemDirectoryHandleAsyncIterator<FileSystemHandle> {
        for (const value of this.entriesMap.values()) yield value;
    }

    async resolve(_other: FileSystemHandle): Promise<string[] | null> {
        // Simplified mock implementation
        return null;
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return (this as any)?.path === (other as any)?.path;
    }

    [Symbol.asyncIterator]() {
        return this.entries();
    }
}

class MockFileHandle implements FileSystemFileHandle {
    kind: "file" = "file";
    name: string;
    path: string; // Keep for internal mock logic
    private content: string;

    constructor(path: string, initialContent: string = '') {
        this.path = path;
        this.name = path.split('/').pop() || '';
        this.content = initialContent;
    }

    async getFile(): Promise<File> {
        return new MockFile(this.name, this.content);
    }

    async createWritable(): Promise<FileSystemWritableFileStream> {
        const writer = new MockWritableStreamDefaultWriter();
        writer.write = vi.fn((data: string) => {
            this.content = data;
            return Promise.resolve();
        });
        return writer as unknown as FileSystemWritableFileStream;
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return (other as any)?.path === this.path;
    }
}

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

    async text(): Promise<string> {
        return this.content;
    }
    async bytes(): Promise<Uint8Array> { return new Uint8Array(); }
    arrayBuffer(): Promise<ArrayBuffer> { throw new Error("Method not implemented."); }
    slice(_start?: number, _end?: number, _contentType?: string): Blob { throw new Error("Method not implemented."); }
    stream(): ReadableStream<Uint8Array> { throw new Error("Method not implemented."); }
}

class MockWritableStreamDefaultWriter {
    write: (data: string) => Promise<void> = vi.fn(() => Promise.resolve());
    close: () => Promise<void> = vi.fn(() => Promise.resolve());
    abort: (reason?: any) => Promise<void> = vi.fn(() => Promise.resolve());
}

// Mock IDirectoryProvider
const mockDirectoryProvider: IDirectoryProvider = {
    getUserDataDirectory: vi.fn(async (appendedPath?: string) => {
        const path = appendedPath ? `${MOCK_USER_DATA_DIR}/${appendedPath}` : MOCK_USER_DATA_DIR;
        return new MockDirectoryHandle(path);
    }),
    getAppDataDirectory: vi.fn(),
    getProjectDirectory: vi.fn(),
    newFileWriter: vi.fn(),
    newFileReader: vi.fn(),
    createTempFile: vi.fn(),
    cleanTempDirectory: vi.fn(),
    openInFileManager: vi.fn(),
    databaseDirectory: Promise.resolve(new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/database`)),
    logsDirectory: Promise.resolve(new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/logs`)),
    cacheDirectory: Promise.resolve(new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/cache`)),
    tempDirectory: Promise.resolve(new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/temp`)),
};

describe('ProjectRepository', () => {
    let projectRepository: ProjectRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        projectRepository = new ProjectRepository(mockDirectoryProvider, mockMd5Service);
    });

    test('saveProject should save a project to the correct directory', async () => {
        const projectToSave = { ...MOCK_PROJECT_1 };
        await projectRepository.saveProject(projectToSave);

        expect(mockDirectoryProvider.getUserDataDirectory).toHaveBeenCalledWith(undefined);

        // Simulate the directory structure being built and file being written
        const userDataDir = await mockDirectoryProvider.getUserDataDirectory();
        const projectsDir = await userDataDir.getDirectoryHandle("projects");
        const projectDir = await projectsDir.getDirectoryHandle(MOCK_PROJECT_ID_1);
        const projectFile = await projectDir.getFileHandle("project.json");

        const writer = await projectFile.createWritable();
        expect(writer.write).toHaveBeenCalledWith(JSON.stringify(projectToSave, null, 2));
        expect(writer.close).toHaveBeenCalled();
    });

    test('loadProject should load an existing project', async () => {
        // Setup a mock directory structure with a saved project
        const projectsDirMock = new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/projects`, {
            [MOCK_PROJECT_ID_1]: {
                kind: 'directory',
                entries: {
                    'project.json': MOCK_PROJECT_1,
                },
            },
        });

        // Temporarily override getUserDataDirectory to return the pre-populated structure
        vi.spyOn(mockDirectoryProvider, 'getUserDataDirectory').mockResolvedValueOnce(
            new MockDirectoryHandle(MOCK_USER_DATA_DIR, { projects: projectsDirMock }),
        );

        const loadedProject = await projectRepository.loadProject(MOCK_PROJECT_ID_1);

        // Expect the loaded project to match the mocked project, with additional properties from loader
        expect(loadedProject).toMatchObject({
            ...MOCK_PROJECT_1,
            projectDir: expect.any(MockDirectoryHandle),
            fileWriter: expect.any(FileWriter), // Check if FileWriter is instantiated
        });
        expect(mockDirectoryProvider.getUserDataDirectory).toHaveBeenCalledWith(undefined);
    });

    test('loadProject should return null if project does not exist', async () => {
        // Setup a mock directory with no projects
        vi.spyOn(mockDirectoryProvider, 'getUserDataDirectory').mockResolvedValueOnce(
            new MockDirectoryHandle(MOCK_USER_DATA_DIR),
        );

        const loadedProject = await projectRepository.loadProject("non-existent-id");
        expect(loadedProject).toBeNull();
    });

    test('listProjects should return a list of all saved projects', async () => {
        // Setup a mock directory structure with multiple saved projects
        const projectsDirMock = new MockDirectoryHandle(`${MOCK_USER_DATA_DIR}/projects`, {
            [MOCK_PROJECT_ID_1]: {
                kind: 'directory',
                entries: {
                    'project.json': MOCK_PROJECT_1,
                },
            },
            [MOCK_PROJECT_ID_2]: {
                kind: 'directory',
                entries: {
                    'project.json': MOCK_PROJECT_2,
                },
            },
            'invalid-project': {
                kind: 'directory',
                entries: {},
            } // Should be ignored
        });

        vi.spyOn(mockDirectoryProvider, 'getUserDataDirectory').mockResolvedValueOnce(
            new MockDirectoryHandle(MOCK_USER_DATA_DIR, { projects: projectsDirMock }),
        );

        const listedProjects = await projectRepository.listProjects();

        // The listed projects will have the added properties from the loader
        expect(listedProjects).toEqual(expect.arrayContaining([
            expect.objectContaining({ ...MOCK_PROJECT_1, projectDir: expect.any(MockDirectoryHandle), fileWriter: expect.any(FileWriter), md5Service: mockMd5Service }),
            expect.objectContaining({ ...MOCK_PROJECT_2, projectDir: expect.any(MockDirectoryHandle), fileWriter: expect.any(FileWriter), md5Service: mockMd5Service }),
        ]));
        expect(mockDirectoryProvider.getUserDataDirectory).toHaveBeenCalledWith(undefined);
    });

    test('listProjects should return an empty array if no projects exist', async () => {
        vi.spyOn(mockDirectoryProvider, 'getUserDataDirectory').mockResolvedValueOnce(
            new MockDirectoryHandle(MOCK_USER_DATA_DIR),
        );

        const listedProjects = await projectRepository.listProjects();
        expect(listedProjects).toEqual([]);
    });
});
