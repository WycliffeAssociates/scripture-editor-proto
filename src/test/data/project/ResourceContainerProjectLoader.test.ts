import { beforeEach, describe, expect, test, vi } from "vitest";
import { parse, stringify } from "yaml";
import { ResourceContainerProjectLoader } from "@/core/domain/project/ResourceContainerProjectLoader.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import { MockDirectoryHandle } from "@/test/shared/mock.ts";

// Mock implementations for dependencies
let inMemoryFiles: Map<string, string> = new Map();
const mockFileWriter: IFileWriter = {
    writeFile: vi.fn(async (filename: string, content: string) => {
        inMemoryFiles.set(filename, content);
    }),
};

describe("ResourceContainerProjectLoader", () => {
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
        projects: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        inMemoryFiles = new Map();
        // The mockProjectDir constructor can now handle initial files as MockFileHandle instances
        // However, for manifest, we need to ensure the correct content is set for each test
        mockProjectDir = new MockDirectoryHandle(MOCK_PROJECT_ID);
        loader = new ResourceContainerProjectLoader();
    });

    test("loadProject should load a project from manifest.yaml", async () => {
        // Setup manifest specifically for this test
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            stringify(sampleManifestYaml),
        );

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );

        expect(project).not.toBeNull();
        expect(project?.id).toBe(MOCK_PROJECT_ID);
        expect(project?.name).toBe(MOCK_PROJECT_NAME);
        expect(project?.metadata.language.id).toBe("en");
        // We will need to re-parse the written manifest to compare against the parsed object.
        // This assertion can be added here if needed, but for now, focus on core functionality.
    });

    test("loadProject should return null if manifest.yaml does not exist", async () => {
        // No manifest.yaml set up here, so it should return null
        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).toBeNull();
    });

    test("addBook should add a new USFM file and update manifest.yaml", async () => {
        // Setup manifest specifically for this test
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            stringify(sampleManifestYaml),
        );
        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const localizedBookTitle = "Matthew";
        const bookContents = "\\id MAT \\c 1 \\v 1 In the beginning...";

        await project?.addBook({
            bookCode,
            contents: bookContents,
            localizedBookTitle,
        });

        const expectedFilename = "41-MAT.usfm";
        expect(mockFileWriter.writeFile).toHaveBeenCalledWith(
            expectedFilename,
            bookContents,
        );
        // const fileHandle = mockProjectDir.files.get(expectedFilename);
        // if (fileHandle === undefined) {
        //   throw new Error("File not found");
        // }
        const memoryVersion = inMemoryFiles.get(expectedFilename);
        expect(memoryVersion).toBe(bookContents);

        const manifestFileHandle = mockProjectDir.files.get(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
        );
        if (manifestFileHandle === undefined) {
            throw new Error("Manifest file not found");
        }
        const memoryManifest = inMemoryFiles.get(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
        );
        if (memoryManifest === undefined) {
            throw new Error("Manifest file not found in memory");
        }
        const updatedManifest = parse(memoryManifest);
        const projectsInManifest = updatedManifest.projects;
        expect(projectsInManifest).toHaveLength(1);
        expect(projectsInManifest[0].identifier).toBe("mat");
        expect(projectsInManifest[0].title).toBe(localizedBookTitle);
        expect(projectsInManifest[0].path).toBe(expectedFilename);
        expect(projectsInManifest[0].sort).toBe(41); // Ensure sort order is correct
    });

    test("addBook should overwrite an existing file and update manifest (as resource in manifest)", async () => {
        const existingFilename = "41-MAT.usfm";
        const oldContent = "old content";
        const existingResources = [
            {
                identifier: "mat",
                title: "Old Matthew Title",
                path: existingFilename,
                sort: 41,
                versification: "ufw",
                categories: [],
            },
        ];

        const manifestWithExistingBook = {
            dublin_core: sampleManifestYaml.dublin_core,
            projects: existingResources,
        };

        // Setup manifest and existing file specifically for this test
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            stringify(manifestWithExistingBook),
        );
        mockProjectDir.files.set(existingFilename, oldContent);

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const newLocalizedBookTitle = "New Matthew Title";
        const newBookContents = "\\id MAT \\c 1 \\v 1 New content here...";

        await project?.addBook({
            bookCode,
            contents: newBookContents,
            localizedBookTitle: newLocalizedBookTitle,
        });

        // Assert that the file content was overwritten
        expect(mockFileWriter.writeFile).toHaveBeenCalledWith(
            existingFilename,
            newBookContents,
        );
        const fileContent = inMemoryFiles.get(existingFilename);
        if (!fileContent) {
            throw new Error("File not found");
        }
        expect(fileContent).toBe(newBookContents);

        // Verify manifest was updated for this book
        const manifestInMemory = inMemoryFiles.get(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
        );
        if (!manifestInMemory) {
            throw new Error("Manifest file not found");
        }
        const updatedManifestString = manifestInMemory;
        const updatedManifest = parse(updatedManifestString);
        const projectsInManifest = updatedManifest.projects;
        expect(projectsInManifest).toHaveLength(1);
        expect(projectsInManifest[0].identifier).toBe("mat");
        expect(projectsInManifest[0].title).toBe(newLocalizedBookTitle);
        expect(projectsInManifest[0].path).toBe(existingFilename); // Path should remain the same
    });

    test("addBook should overwrite an existing file (as physical file, not in manifest)", async () => {
        const existingFilename = "41-MAT.usfm";
        const oldContent = "original content";

        // Setup manifest and existing file specifically for this test
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            stringify(sampleManifestYaml),
        );
        mockProjectDir.files.set(existingFilename, oldContent);

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const newLocalizedBookTitle = "Matthew";
        const newBookContents = "new content for existing file";

        await project?.addBook({
            bookCode,
            contents: newBookContents,
            localizedBookTitle: newLocalizedBookTitle,
        });

        // Assert that the file content was overwritten
        const fileContent = inMemoryFiles.get(existingFilename);
        if (!fileContent) {
            throw new Error("File not found");
        }
        expect(fileContent).toBe(newBookContents);

        // Verify manifest was updated (new entry should be added since it wasn't in manifest initially)
        const manifestInMemory = inMemoryFiles.get(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
        );
        if (!manifestInMemory) {
            throw new Error("Manifest file not found");
        }
        const updatedManifestString = manifestInMemory;
        const updatedManifest = parse(updatedManifestString);
        const projectsInManifest = updatedManifest.projects;
        expect(projectsInManifest).toHaveLength(1);
        expect(projectsInManifest[0].identifier).toBe("mat");
        expect(projectsInManifest[0].title).toBe(newLocalizedBookTitle);
        expect(projectsInManifest[0].path).toBe(existingFilename);
        expect(projectsInManifest[0].sort).toBe(41);
    });

    test("getBook should retrieve content for an existing book in manifest", async () => {
        const bookCode = "MAT";
        const existingFilename = "41-MAT.usfm";
        const bookContents =
            "\\id MAT \\c 1 \\v 1 Book content for getBook test.";

        const manifestWithBook = {
            dublin_core: sampleManifestYaml.dublin_core,
            projects: [
                {
                    identifier: "mat",
                    title: "Matthew",
                    path: existingFilename,
                    sort: 41,
                    versification: "ufw",
                    categories: [],
                },
            ],
        };
        // Setup manifest and existing file specifically for this test
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            stringify(manifestWithBook),
        );
        mockProjectDir.files.set(existingFilename, bookContents);

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).not.toBeNull();

        const retrievedContent = await project?.getBook(bookCode);
        expect(retrievedContent).toBe(bookContents);
    });

    test("getBook should retrieve content for a book at default path (not in manifest)", async () => {
        const bookCode = "MRK";
        const defaultFilename = "42-MRK.usfm";
        const bookContents = "\\id MRK \\c 1 \\v 1 Mark content.";

        // Setup manifest and existing file specifically for this test
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            stringify(sampleManifestYaml),
        ); // Manifest without MRK
        mockProjectDir.files.set(defaultFilename, bookContents);

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).not.toBeNull();

        const retrievedContent = await project?.getBook(bookCode);
        expect(retrievedContent).toBe(bookContents);
    });

    test("getBook should return null for a non-existent book", async () => {
        const bookCode = "LUK";

        // Setup manifest specifically for this test
        mockProjectDir.files.set(
            ResourceContainerProjectLoader.MANIFEST_FILENAME,
            stringify(sampleManifestYaml),
        );

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).not.toBeNull();

        const retrievedContent = await project?.getBook(bookCode);
        expect(retrievedContent).toBeNull();
    });
});
