import { describe, test, expect, vi, beforeEach } from 'vitest';
import {IMd5Service} from "@/core/domain/md5/IMd5Service.ts";
import {IFileWriter} from "@/core/io/IFileWriter.ts";
import {ResourceContainerProjectLoader} from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import { parse, stringify } from 'yaml';
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";
import {IPathHandle} from "@/core/io/IPathHandle.ts";

// Mock implementations for dependencies
const mockFileWriter: IFileWriter = {
    writeFile: vi.fn(() => Promise.resolve()),
};

const mockMd5Service: IMd5Service = {
    calculateMd5: vi.fn((text: string) => Promise.resolve(`mock-md5-${text}`)),
};

// Helper mock for IDirectoryHandle
class MockDirectoryHandle implements IDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    path: string;
    isDir: boolean = true;
    isFile: boolean = false;
    private files: Map<string, IFileHandle> = new Map();

    constructor(name: string, path: string = `/${name}`, initialFiles: Record<string, string> = {}) {
        this.name = name;
        this.path = path;
        for (const [fileName, content] of Object.entries(initialFiles)) {
            this.files.set(fileName, new MockFileHandle(fileName, `${path}/${fileName}`, content));
        }
    }

    getDirectoryHandle = vi.fn((name: string, options?: { create?: boolean }) => {
        const newPath = `${this.path}/${name}`;
        if (options?.create) {
            const newDir = new MockDirectoryHandle(name, newPath);
            // In a real scenario, you'd add this to a mock filesystem structure
            return Promise.resolve(newDir);
        } else if (name === "manifest.yaml" && this.files.has(name)) {
            // Special handling for manifest in some scenarios if needed for testing specific paths
            return Promise.reject(new Error("Not a directory"));
        }
        return Promise.reject(new Error("Directory not found"));
    });
    getFileHandle = vi.fn((fileName: string, options?: { create?: boolean }) => {
        const filePath = `${this.path}/${fileName}`;
        if (this.files.has(fileName)) {
            return Promise.resolve(this.files.get(fileName)!);
        } else if (options?.create) {
            const newFileHandle = new MockFileHandle(fileName, filePath, "");
            this.files.set(fileName, newFileHandle); // Store the instance
            return Promise.resolve(newFileHandle);
        }
        return Promise.reject(new Error("File not found"));
    });
    entries = vi.fn(() => (async function* () {})());
    values = vi.fn(() => (async function* () {})());
    keys = vi.fn(() => (async function* () {})());
    removeEntry = vi.fn(() => Promise.resolve());
    resolve = vi.fn(() => Promise.resolve(null));
    isSameEntry = vi.fn((other: IPathHandle) => Promise.resolve(this.path === other.path));
    [Symbol.asyncIterator] = vi.fn(() => (async function* () {})());
    getParent = vi.fn(() => Promise.resolve(new MockDirectoryHandle("parent", `${this.path}/..`)));
    asFileHandle = vi.fn(() => null);
    asDirectoryHandle = vi.fn(() => this);
    getAbsolutePath = vi.fn(() => Promise.resolve(this.path));
};

// Helper mock for IFileHandle
class MockFileHandle implements IFileHandle {
    kind: "file" = "file";
    name: string;
    path: string;
    isDir: boolean = false;
    isFile: boolean = true;
    private _content: string;

    constructor(name: string, path: string = `/${name}`, content: string) {
        this.name = name;
        this.path = path;
        this._content = content;
    }

    getFile = vi.fn(() => Promise.resolve(new MockFile(this.name, this._content)));
    createWritable = vi.fn(() => {
        const self = this; // Capture the MockFileHandle instance
        return Promise.resolve({
            getWriter: vi.fn(() => ({
                write: vi.fn((data: string) => { self._content = data; return Promise.resolve(); }),
                close: vi.fn(() => Promise.resolve()),
                releaseLock: vi.fn(() => Promise.resolve()),
            })),
        });
    });
    isSameEntry = vi.fn((other: IPathHandle) => Promise.resolve(this.path === other.path));
    getParent = vi.fn(() => Promise.resolve(new MockDirectoryHandle("parent", `${this.path}/..`)));
    asFileHandle = vi.fn(() => this);
    asDirectoryHandle = vi.fn(() => null);
    getAbsolutePath = vi.fn(() => Promise.resolve(this.path));
    createWriter = vi.fn(() => this.createWritable().then(ws => ws.getWriter()));
    [Symbol.asyncDispose] = vi.fn(() => Promise.resolve());

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

describe('ResourceContainerProjectLoader', () => {
    let loader: ResourceContainerProjectLoader;
    let mockProjectDir: MockDirectoryHandle;
    const MOCK_PROJECT_NAME = "My Test Resource Project";
    const MOCK_PROJECT_ID = "test-rc-id";

    const sampleManifestYaml = {
        dublin_core: {
            identifier: MOCK_PROJECT_ID,
            title: MOCK_PROJECT_NAME,
            language: { identifier: "en", title: "English", direction: "ltr" },
        },
        projects: [
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // The mockProjectDir constructor can now handle initial files as MockFileHandle instances
        // However, for manifest, we need to ensure the correct content is set for each test
        mockProjectDir = new MockDirectoryHandle(MOCK_PROJECT_ID, `/${MOCK_PROJECT_ID}`);
        loader = new ResourceContainerProjectLoader();
    });

    test('loadProject should load a project from manifest.yaml', async () => {
        // Setup manifest specifically for this test
        mockProjectDir.files.set(ResourceContainerProjectLoader.MANIFEST_FILENAME, new MockFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME, `/${MOCK_PROJECT_ID}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`, stringify(sampleManifestYaml)));

        const project = await loader.loadProject(mockProjectDir, mockFileWriter);

        expect(project).not.toBeNull();
        expect(project?.id).toBe(MOCK_PROJECT_ID);
        expect(project?.name).toBe(MOCK_PROJECT_NAME);
        expect(project?.metadata.language.id).toBe("en");
        // We will need to re-parse the written manifest to compare against the parsed object.
        // This assertion can be added here if needed, but for now, focus on core functionality.
    });

    test('loadProject should return null if manifest.yaml does not exist', async () => {
        // No manifest.yaml set up here, so it should return null
        const project = await loader.loadProject(mockProjectDir, mockFileWriter);
        expect(project).toBeNull();
    });

    test('addBook should add a new USFM file and update manifest.yaml', async () => {
        // Setup manifest specifically for this test
        mockProjectDir.files.set(ResourceContainerProjectLoader.MANIFEST_FILENAME, new MockFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME, `/${MOCK_PROJECT_ID}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`, stringify(sampleManifestYaml)));
        const project = await loader.loadProject(mockProjectDir, mockFileWriter);
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const localizedBookTitle = "Matthew";
        const bookContents = "\\id MAT \\c 1 \\v 1 In the beginning...";

        await project!.addBook(bookCode, localizedBookTitle, bookContents);

        const expectedFilename = "41-MAT.usfm";
        const fileHandle = mockProjectDir.files.get(expectedFilename)!;
        const file = await fileHandle.getFile();
        const content = await file.text();
        expect(content).toBe(bookContents);

        const updatedManifestString = (await mockProjectDir.files.get(ResourceContainerProjectLoader.MANIFEST_FILENAME)!.getFile()).text();
        const updatedManifest = parse(await updatedManifestString);
        const projectsInManifest = updatedManifest.projects;
        expect(projectsInManifest).toHaveLength(1);
        expect(projectsInManifest[0].identifier).toBe("mat");
        expect(projectsInManifest[0].title).toBe(localizedBookTitle);
        expect(projectsInManifest[0].path).toBe(expectedFilename);
        expect(projectsInManifest[0].sort).toBe(41); // Ensure sort order is correct
    });

    test('addBook should overwrite an existing file and update manifest (as resource in manifest)', async () => {
        const existingFilename = "41-MAT.usfm";
        const oldContent = "old content";
        const existingResources = [{
            identifier: "mat",
            title: "Old Matthew Title",
            path: existingFilename,
            sort: 41,
            versification: "ufw",
            categories: []
        }];

        const manifestWithExistingBook = {
            dublin_core: sampleManifestYaml.dublin_core,
            projects: existingResources,
        };

        // Setup manifest and existing file specifically for this test
        mockProjectDir.files.set(ResourceContainerProjectLoader.MANIFEST_FILENAME, new MockFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME, `/${MOCK_PROJECT_ID}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`, stringify(manifestWithExistingBook)));
        mockProjectDir.files.set(existingFilename, new MockFileHandle(existingFilename, `/${MOCK_PROJECT_ID}/${existingFilename}`, oldContent));

        const project = await loader.loadProject(mockProjectDir, mockFileWriter);
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const newLocalizedBookTitle = "New Matthew Title";
        const newBookContents = "\\id MAT \\c 1 \\v 1 New content here...";

        await project!.addBook(bookCode, newLocalizedBookTitle, newBookContents);

        // Assert that the file content was overwritten
        const fileHandle = mockProjectDir.files.get(existingFilename)!;
        const file = await fileHandle.getFile();
        const content = await file.text();
        expect(content).toBe(newBookContents);

        // Verify manifest was updated for this book
        const updatedManifestString = (await mockProjectDir.files.get(ResourceContainerProjectLoader.MANIFEST_FILENAME)!.getFile()).text();
        const updatedManifest = parse(await updatedManifestString);
        const projectsInManifest = updatedManifest.projects;
        expect(projectsInManifest).toHaveLength(1);
        expect(projectsInManifest[0].identifier).toBe("mat");
        expect(projectsInManifest[0].title).toBe(newLocalizedBookTitle);
        expect(projectsInManifest[0].path).toBe(existingFilename); // Path should remain the same
    });

    test('addBook should overwrite an existing file (as physical file, not in manifest)', async () => {
        const existingFilename = "41-MAT.usfm";
        const oldContent = "original content";

        // Setup manifest and existing file specifically for this test
        mockProjectDir.files.set(ResourceContainerProjectLoader.MANIFEST_FILENAME, new MockFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME, `/${MOCK_PROJECT_ID}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`, stringify(sampleManifestYaml)));
        mockProjectDir.files.set(existingFilename, new MockFileHandle(existingFilename, `/${MOCK_PROJECT_ID}/${existingFilename}`, oldContent));

        const project = await loader.loadProject(mockProjectDir, mockFileWriter);
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const newLocalizedBookTitle = "Matthew";
        const newBookContents = "new content for existing file";

        await project!.addBook(bookCode, newLocalizedBookTitle, newBookContents);

        // Assert that the file content was overwritten
        const fileHandle = mockProjectDir.files.get(existingFilename)!;
        const file = await fileHandle.getFile();
        const content = await file.text();
        expect(content).toBe(newBookContents);

        // Verify manifest was updated (new entry should be added since it wasn't in manifest initially)
        const updatedManifestString = (await mockProjectDir.files.get(ResourceContainerProjectLoader.MANIFEST_FILENAME)!.getFile()).text();
        const updatedManifest = parse(await updatedManifestString);
        const projectsInManifest = updatedManifest.projects;
        expect(projectsInManifest).toHaveLength(1);
        expect(projectsInManifest[0].identifier).toBe("mat");
        expect(projectsInManifest[0].title).toBe(newLocalizedBookTitle);
        expect(projectsInManifest[0].path).toBe(existingFilename);
        expect(projectsInManifest[0].sort).toBe(41);
    });

    test('getBook should retrieve content for an existing book in manifest', async () => {
        const bookCode = "MAT";
        const existingFilename = "41-MAT.usfm";
        const bookContents = "\\id MAT \\c 1 \\v 1 Book content for getBook test.";

        const manifestWithBook = {
            dublin_core: sampleManifestYaml.dublin_core,
            projects: [
                {
                    identifier: "mat",
                    title: "Matthew",
                    path: existingFilename,
                    sort: 41,
                    versification: "ufw",
                    categories: []
                },
            ],
        };
        // Setup manifest and existing file specifically for this test
        mockProjectDir.files.set(ResourceContainerProjectLoader.MANIFEST_FILENAME, new MockFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME, `/${MOCK_PROJECT_ID}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`, stringify(manifestWithBook)));
        mockProjectDir.files.set(existingFilename, new MockFileHandle(existingFilename, `/${MOCK_PROJECT_ID}/${existingFilename}`, bookContents));

        const project = await loader.loadProject(mockProjectDir, mockFileWriter);
        expect(project).not.toBeNull();

        const retrievedContent = await project!.getBook(bookCode);
        expect(retrievedContent).toBe(bookContents);
    });

    test('getBook should retrieve content for a book at default path (not in manifest)', async () => {
        const bookCode = "MRK";
        const defaultFilename = "42-MRK.usfm";
        const bookContents = "\\id MRK \\c 1 \\v 1 Mark content.";

        // Setup manifest and existing file specifically for this test
        mockProjectDir.files.set(ResourceContainerProjectLoader.MANIFEST_FILENAME, new MockFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME, `/${MOCK_PROJECT_ID}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`, stringify(sampleManifestYaml))); // Manifest without MRK
        mockProjectDir.files.set(defaultFilename, new MockFileHandle(defaultFilename, `/${MOCK_PROJECT_ID}/${defaultFilename}`, bookContents));

        const project = await loader.loadProject(mockProjectDir, mockFileWriter);
        expect(project).not.toBeNull();

        const retrievedContent = await project!.getBook(bookCode);
        expect(retrievedContent).toBe(bookContents);
    });

    test('getBook should return null for a non-existent book', async () => {
        const bookCode = "LUK";

        // Setup manifest specifically for this test
        mockProjectDir.files.set(ResourceContainerProjectLoader.MANIFEST_FILENAME, new MockFileHandle(ResourceContainerProjectLoader.MANIFEST_FILENAME, `/${MOCK_PROJECT_ID}/${ResourceContainerProjectLoader.MANIFEST_FILENAME}`, stringify(sampleManifestYaml)));

        const project = await loader.loadProject(mockProjectDir, mockFileWriter);
        expect(project).not.toBeNull();

        const retrievedContent = await project!.getBook(bookCode);
        expect(retrievedContent).toBeNull();
    });
});
