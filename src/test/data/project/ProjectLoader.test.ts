import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ProjectLoader } from "@/core/domain/project/ProjectLoader.ts";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import { ScriptureBurritoProjectLoader } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import type { IFileWriter } from "@/core/persistence/IFileWriter.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

// Mock implementations for dependencies
const mockFileWriter: IFileWriter = {
    writeFile: vi.fn(() => Promise.resolve()),
};

const mockMd5Service: IMd5Service = {
    calculateMd5: vi.fn(() => Promise.resolve("mock-md5-checksum")),
};

const mockProjectDir: FileSystemDirectoryHandle = {
    kind: "directory",
    name: "mock-project-dir",
    getDirectoryHandle: vi.fn(() =>
        Promise.resolve(new MockDirectoryHandle("mock-subdir")),
    ),
    getFileHandle: vi.fn((fileName: string) => {
        if (
            fileName === ScriptureBurritoProjectLoader.METADATA_FILENAME ||
            fileName === ResourceContainerProjectLoader.MANIFEST_FILENAME
        ) {
            return Promise.resolve({} as FileSystemFileHandle); // Just return a mock handle indicating existence
        }
        return Promise.reject(new Error("File not found"));
    }),
    entries: vi.fn(() => (async function* () {})()),
    values: vi.fn(() => (async function* () {})()),
    keys: vi.fn(() => (async function* () {})()),
    removeEntry: vi.fn(() => Promise.resolve()),
    resolve: vi.fn(() => Promise.resolve(null)),
    isSameEntry: vi.fn(() => Promise.resolve(false)),
    [Symbol.asyncIterator]: vi.fn(() => (async function* () {})()),
    [Symbol.asyncDispose]: vi.fn(() => (async function* () {})()),
};

// Mock Project implementations to be returned by the loaders
const mockScriptureBurritoProject: Project = {
    id: "sb-project",
    name: "Scripture Burrito Project",
    files: [],
    metadata: {
        id: "sb-project",
        name: "Scripture Burrito Project",
        language: { id: "en", name: "English", direction: "ltr" },
    },
    projectDir: mockProjectDir,
    fileWriter: mockFileWriter,
    metadataJson: { ingredients: {} },
    md5Service: mockMd5Service,
    addBook: vi.fn(),
};

const mockResourceContainerProject: Project = {
    id: "rc-project",
    name: "Resource Container Project",
    files: [],
    metadata: {
        id: "rc-project",
        name: "Resource Container Project",
        language: { id: "en", name: "English", direction: "ltr" },
    },
    projectDir: mockProjectDir,
    fileWriter: mockFileWriter,
    manifestYaml: { projects: {} },
    md5Service: mockMd5Service,
    addBook: vi.fn(),
};

// Mock the actual loader implementations
vi.mock("@/core/domain/project/ResourceContainerProjectLoader.ts", () => ({
    ResourceContainerProjectLoader: vi.fn(() => ({
        loadProject: vi.fn(() => Promise.resolve(mockResourceContainerProject)),
        MANIFEST_FILENAME: "manifest.yaml", // Ensure static property is mocked
    })),
}));

vi.mock("@/core/domain/project/ScriptureBurritoProjectLoader.ts", () => ({
    ScriptureBurritoProjectLoader: vi.fn(() => ({
        loadProject: vi.fn(() => Promise.resolve(mockScriptureBurritoProject)),
        METADATA_FILENAME: "metadata.json", // Ensure static property is mocked
    })),
}));

// Helper mock for FileSystemDirectoryHandle to implement methods
class MockDirectoryHandle implements FileSystemDirectoryHandle {
    kind: "directory" = "directory";
    name: string;

    constructor(name: string) {
        this.name = name;
    }

    getDirectoryHandle = vi.fn((name: string) =>
        Promise.resolve(new MockDirectoryHandle(name)),
    );
    getFileHandle = vi.fn((name: string) =>
        Promise.resolve({} as FileSystemFileHandle),
    );
    entries = vi.fn(() => (async function* () {})());
    values = vi.fn(() => (async function* () {})());
    keys = vi.fn(() => (async function* () {})());
    removeEntry = vi.fn(() => Promise.resolve());
    resolve = vi.fn(() => Promise.resolve(null));
    isSameEntry = vi.fn(() => Promise.resolve(false));
    [Symbol.asyncIterator] = vi.fn(() => (async function* () {})());
}

describe("ProjectLoader", () => {
    let projectLoader: ProjectLoader;

    beforeEach(() => {
        vi.clearAllMocks();
        projectLoader = new ProjectLoader();
    });

    test("should prefer ScriptureBurritoProjectLoader if metadata.json exists", async () => {
        vi.spyOn(mockProjectDir, "getFileHandle").mockImplementation(
            (fileName) => {
                if (
                    fileName === ScriptureBurritoProjectLoader.METADATA_FILENAME
                )
                    return Promise.resolve({} as FileSystemFileHandle);
                if (
                    fileName ===
                    ResourceContainerProjectLoader.MANIFEST_FILENAME
                )
                    return Promise.resolve({} as FileSystemFileHandle);
                return Promise.reject(new Error("File not found"));
            },
        );

        const loadedProject = await projectLoader.loadProject(
            mockProjectDir,
            mockFileWriter,
            mockMd5Service,
        );

        expect(ScriptureBurritoProjectLoader).toHaveBeenCalledTimes(1);
        expect(
            ScriptureBurritoProjectLoader.mock.results[0].value.loadProject,
        ).toHaveBeenCalledWith(mockProjectDir, mockFileWriter, mockMd5Service);
        //expect(ResourceContainerProjectLoader).not.toHaveBeenCalled();
        expect(loadedProject).toEqual(mockScriptureBurritoProject);
    });

    test("should use ResourceContainerProjectLoader if only manifest.yaml exists", async () => {
        vi.spyOn(mockProjectDir, "getFileHandle").mockImplementation(
            (fileName) => {
                if (
                    fileName ===
                    ResourceContainerProjectLoader.MANIFEST_FILENAME
                )
                    return Promise.resolve({} as FileSystemFileHandle);
                return Promise.reject(new Error("File not found"));
            },
        );

        const loadedProject = await projectLoader.loadProject(
            mockProjectDir,
            mockFileWriter,
            mockMd5Service,
        );

        expect(ScriptureBurritoProjectLoader).not.toHaveBeenCalled();
        expect(ResourceContainerProjectLoader).toHaveBeenCalledTimes(1);
        expect(
            ResourceContainerProjectLoader.mock.results[0].value.loadProject,
        ).toHaveBeenCalledWith(mockProjectDir, mockFileWriter, mockMd5Service);
        expect(loadedProject).toEqual(mockResourceContainerProject);
    });

    test("should return null if neither metadata.json nor manifest.yaml exists", async () => {
        vi.spyOn(mockProjectDir, "getFileHandle").mockImplementation(() =>
            Promise.reject(new Error("File not found")),
        );

        const loadedProject = await projectLoader.loadProject(
            mockProjectDir,
            mockFileWriter,
            mockMd5Service,
        );

        expect(ScriptureBurritoProjectLoader).not.toHaveBeenCalled();
        expect(ResourceContainerProjectLoader).not.toHaveBeenCalled();
        expect(loadedProject).toBeNull();
    });
});
