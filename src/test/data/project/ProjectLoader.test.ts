import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ProjectLoader } from "@/core/domain/project/ProjectLoader.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import {
    MockDirectoryHandle,
    type MockFileHandle,
} from "@/test/shared/mock.ts";

// Mock implementations for dependencies
const mockFileWriter: IFileWriter = {
    writeFile: vi.fn(() => Promise.resolve()),
};

const mockMd5Service: IMd5Service = {
    calculateMd5: vi.fn(() => Promise.resolve("mock-md5-checksum")),
};

const mockProjectDir = new MockDirectoryHandle("mock-project-dir");
// const mockProjectDir: FileSystemDirectoryHandle = {
//   kind: "directory",
//   name: "mock-project-dir",
//   getDirectoryHandle: vi.fn(() =>
//     Promise.resolve(new MockDirectoryHandle("mock-subdir"))
//   ),
//   getFileHandle: vi.fn((fileName: string) => {
//     if (fileName === "metadata.json" || fileName === "manifest.yaml") {
//       return Promise.resolve({} as FileSystemFileHandle); // Just return a mock handle indicating existence
//     }
//     return Promise.reject(new Error("File not found"));
//   }),
//   entries: vi.fn(() => (async function* () {})()),
//   values: vi.fn(() => (async function* () {})()),
//   keys: vi.fn(() => (async function* () {})()),
//   removeEntry: vi.fn(() => Promise.resolve()),
//   resolve: vi.fn(() => Promise.resolve(null)),
//   isSameEntry: vi.fn(() => Promise.resolve(false)),
//   [Symbol.asyncIterator]: vi.fn(() => (async function* () {})()),
//   [Symbol.asyncDispose]: vi.fn(() => (async function* () {})()),
// };

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
    ResourceContainerProjectLoader: vi.fn(),
    MANIFEST_FILENAME: "manifest.yaml",
}));

vi.mock("@/core/domain/project/ScriptureBurritoProjectLoader.ts", () => ({
    ScriptureBurritoProjectLoader: vi.fn(),
    METADATA_FILENAME: "metadata.json",
}));

// Helper mock for FileSystemDirectoryHandle to implement methods
// class MockDirectoryHandle implements FileSystemDirectoryHandle {
//   kind: "directory" = "directory";
//   name: string;

//   constructor(name: string) {
//     this.name = name;
//   }

//   getDirectoryHandle = vi.fn((name: string) =>
//     Promise.resolve(new MockDirectoryHandle(name))
//   );
//   getFileHandle = vi.fn((_name: string) =>
//     Promise.resolve({} as FileSystemFileHandle)
//   );
//   entries = vi.fn(() => (async function* () {})());
//   values = vi.fn(() => (async function* () {})());
//   keys = vi.fn(() => (async function* () {})());
//   removeEntry = vi.fn(() => Promise.resolve());
//   resolve = vi.fn(() => Promise.resolve(null));
//   isSameEntry = vi.fn(() => Promise.resolve(false));
//   [Symbol.asyncIterator] = vi.fn(() => (async function* () {})());
// }

describe("ProjectLoader", () => {
    let projectLoader: ProjectLoader;
    let mockScriptureBurritoLoader: any;
    let mockResourceContainerLoader: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockScriptureBurritoLoader = {
            loadProject: vi.fn(() =>
                Promise.resolve(mockScriptureBurritoProject),
            ),
            METADATA_FILENAME: "metadata.json",
        };
        mockResourceContainerLoader = {
            loadProject: vi.fn(() =>
                Promise.resolve(mockResourceContainerProject),
            ),
            MANIFEST_FILENAME: "manifest.yaml",
        };
        projectLoader = new ProjectLoader(
            mockMd5Service,
            mockResourceContainerLoader,
            mockScriptureBurritoLoader,
        );
    });

    test("should prefer ScriptureBurritoProjectLoader if metadata.json exists", async () => {
        vi.spyOn(mockProjectDir, "getFileHandle").mockImplementation(
            (fileName) => {
                if (fileName === "metadata.json")
                    return Promise.resolve({} as FileSystemFileHandle);
                if (fileName === "manifest.yaml")
                    return Promise.resolve({} as FileSystemFileHandle);
                return Promise.reject(new Error("File not found"));
            },
        );

        const loadedProject = await projectLoader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );

        expect(mockScriptureBurritoLoader.loadProject).toHaveBeenCalledTimes(1);
        expect(mockScriptureBurritoLoader.loadProject).toHaveBeenCalledWith(
            mockProjectDir,
            mockFileWriter,
        );
        expect(mockResourceContainerLoader.loadProject).not.toHaveBeenCalled();
        expect(loadedProject).toEqual(mockScriptureBurritoProject);
    });

    test("should use ResourceContainerProjectLoader if only manifest.yaml exists", async () => {
        vi.spyOn(mockProjectDir, "getFileHandle").mockImplementation(
            (fileName) => {
                if (fileName === "manifest.yaml")
                    return Promise.resolve({} as MockFileHandle);
                return Promise.reject(new Error("File not found"));
            },
        );

        const loadedProject = await projectLoader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );

        expect(mockResourceContainerLoader.loadProject).toHaveBeenCalledTimes(
            1,
        );
        expect(mockResourceContainerLoader.loadProject).toHaveBeenCalledWith(
            mockProjectDir,
            mockFileWriter,
        );
        expect(mockScriptureBurritoLoader.loadProject).not.toHaveBeenCalled();
        expect(loadedProject).toEqual(mockResourceContainerProject);
    });

    test("should return null if neither metadata.json nor manifest.yaml exists", async () => {
        vi.spyOn(mockProjectDir, "getFileHandle").mockImplementation(() =>
            Promise.reject(new Error("File not found")),
        );

        const loadedProject = await projectLoader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );

        expect(mockScriptureBurritoLoader.loadProject).not.toHaveBeenCalled();
        expect(mockResourceContainerLoader.loadProject).not.toHaveBeenCalled();
        expect(loadedProject).toBeNull();
    });
});
