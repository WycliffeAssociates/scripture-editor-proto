import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import type { IFileWriter } from "@/core/persistence/IFileWriter.ts";

// Mock implementations for dependencies
const mockFileWriter: IFileWriter = {
    writeFile: vi.fn(() => Promise.resolve()),
};

const mockMd5Service: IMd5Service = {
    calculateMd5: vi.fn((text: string) => Promise.resolve(`mock-md5-${text}`)),
};

// Helper mock for FileSystemDirectoryHandle
class MockDirectoryHandle implements FileSystemDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    private files: Map<string, string> = new Map();

    constructor(name: string, initialFiles: Record<string, string> = {}) {
        this.name = name;
        for (const [fileName, content] of Object.entries(initialFiles)) {
            this.files.set(fileName, content);
        }
    }

    getDirectoryHandle = vi.fn((name: string) =>
        Promise.reject(new Error("Not implemented for this test")),
    );
    getFileHandle = vi.fn(
        (fileName: string, options?: { create?: boolean }) => {
            if (this.files.has(fileName)) {
                return Promise.resolve(
                    new MockFileHandle(fileName, this.files.get(fileName)!),
                );
            } else if (options?.create) {
                const newFileHandle = new MockFileHandle(fileName, "");
                this.files.set(fileName, ""); // Add to internal map
                return Promise.resolve(newFileHandle);
            }
            return Promise.reject(new Error("File not found"));
        },
    );
    entries = vi.fn(() => (async function* () {})());
    values = vi.fn(() => (async function* () {})());
    keys = vi.fn(() => (async function* () {})());
    removeEntry = vi.fn(() => Promise.resolve());
    resolve = vi.fn(() => Promise.resolve(null));
    isSameEntry = vi.fn(() => Promise.resolve(false));
    [Symbol.asyncIterator] = vi.fn(() => (async function* () {})());
}

// Helper mock for FileSystemFileHandle
class MockFileHandle implements FileSystemFileHandle {
    kind: "file" = "file";
    name: string;
    private content: string;

    constructor(name: string, content: string) {
        this.name = name;
        this.content = content;
    }

    getFile = vi.fn(() =>
        Promise.resolve(new MockFile(this.name, this.content)),
    );
    createWritable = vi.fn(
        () =>
            Promise.resolve({
                write: vi.fn((data: string) => {
                    this.content = data;
                    return Promise.resolve();
                }),
                close: vi.fn(() => Promise.resolve()),
                abort: vi.fn(() => Promise.resolve()),
            }) as unknown as FileSystemWritableFileStream,
    );
    isSameEntry = vi.fn(() => Promise.resolve(false));
}

// Helper mock for File
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

    text = vi.fn(() => Promise.resolve(this.content));
    bytes = vi.fn(() => Promise.resolve(new Uint8Array()));
    arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    slice = vi.fn(() => ({}) as Blob);
    stream = vi.fn(() => ({}) as ReadableStream<Uint8Array>);
}

describe("ResourceContainerProjectLoader", () => {
    let loader: ResourceContainerProjectLoader;
    let mockProjectDir: MockDirectoryHandle;
    const MOCK_PROJECT_NAME = "My Test Resource Project";
    const MOCK_PROJECT_ID = "test-rc-id";

    const sampleManifestYaml = {
        projects: {
            [MOCK_PROJECT_ID]: {
                projectMeta: {
                    name: MOCK_PROJECT_NAME,
                    target_language: {
                        tag: "en",
                        name: "English",
                        direction: "ltr",
                    },
                },
                resources: [],
            },
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockProjectDir = new MockDirectoryHandle(MOCK_PROJECT_ID);
        loader = new ResourceContainerProjectLoader();
    });

    test("loadProject should load a project from manifest.yaml", async () => {
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            JSON.stringify(sampleManifestYaml),
        );

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
            mockMd5Service,
        );

        expect(project).not.toBeNull();
        expect(project?.id).toBe(MOCK_PROJECT_ID);
        expect(project?.name).toBe(MOCK_PROJECT_NAME);
        expect(project?.metadata.language.id).toBe("en");
        expect(project?.manifestYaml).toEqual(sampleManifestYaml);
    });

    test("loadProject should return null if manifest.yaml does not exist", async () => {
        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
            mockMd5Service,
        );
        expect(project).toBeNull();
    });

    test("addBook should add a new USFM file and update manifest.yaml", async () => {
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            JSON.stringify(sampleManifestYaml),
        );
        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
            mockMd5Service,
        );
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const localizedBookTitle = "Matthew";
        const bookContents = "\\id MAT \\c 1 \\v 1 In the beginning...";

        await project!.addBook(bookCode, localizedBookTitle, bookContents);

        const expectedFilename = "41-MAT.usfm";
        expect(mockFileWriter.writeFile).toHaveBeenCalledWith(
            expectedFilename,
            bookContents,
        );

        const updatedManifest = JSON.parse(
            mockProjectDir.files.get(
                ResourceContainerProjectLoader.MANIFEST_FILENAME,
            )!,
        );
        const resources = updatedManifest.projects[MOCK_PROJECT_ID].resources;
        expect(resources).toHaveLength(1);
        expect(resources[0].identifier).toBe("mat");
        expect(resources[0].name).toBe(localizedBookTitle);
        expect(resources[0].path).toBe(expectedFilename);
    });

    test("addBook should not overwrite an existing file (as resource in manifest)", async () => {
        const existingResources = [
            {
                identifier: "mat",
                name: "Matthew",
                format: "usfm",
                path: "41-MAT.usfm",
            },
        ];
        const manifestWithExistingBook = {
            projects: {
                [MOCK_PROJECT_ID]: {
                    projectMeta:
                        sampleManifestYaml.projects[MOCK_PROJECT_ID]
                            .projectMeta,
                    resources: existingResources,
                },
            },
        };
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            JSON.stringify(manifestWithExistingBook),
        );
        mockProjectDir.files.set("41-MAT.usfm", "original content");

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
            mockMd5Service,
        );
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const bookContents = "new content";

        await project!.addBook(bookCode, "Matthew", bookContents);

        expect(mockFileWriter.writeFile).not.toHaveBeenCalledWith(
            "41-MAT.usfm",
            bookContents,
        );
        // Verify manifest wasn't changed for this book
        const updatedManifest = JSON.parse(
            mockProjectDir.files.get(
                ResourceContainerProjectLoader.MANIFEST_FILENAME,
            )!,
        );
        expect(
            updatedManifest.projects[MOCK_PROJECT_ID].resources,
        ).toHaveLength(1);
        expect(
            updatedManifest.projects[MOCK_PROJECT_ID].resources[0].name,
        ).toBe("Matthew");
    });

    test("addBook should not overwrite an existing file (as physical file)", async () => {
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            JSON.stringify(sampleManifestYaml),
        );
        mockProjectDir.files.set("41-MAT.usfm", "original content");

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
            mockMd5Service,
        );
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const bookContents = "new content";

        await project!.addBook(bookCode, "Matthew", bookContents);

        expect(mockFileWriter.writeFile).not.toHaveBeenCalledWith(
            "41-MAT.usfm",
            bookContents,
        );
    });
});
