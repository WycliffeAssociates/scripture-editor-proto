import { beforeEach, describe, expect, test, vi } from "vitest";
import { ScriptureBurritoProjectLoader } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import {
    MockDirectoryHandle,
    type MockIDirectoryHandle,
    mockMd5Service,
} from "@/test/shared/mock.ts";

// Mock implementations for dependencies
let inMemoryFiles: Map<string, string> = new Map();
const mockFileWriter: IFileWriter = {
    writeFile: vi.fn(async (filename: string, content: string) => {
        inMemoryFiles.set(filename, content);
    }),
};
// Helper mock for File
// class MockFile implements File {
//   name: string;
//   private content: string;
//   readonly lastModified: number = Date.now();
//   readonly size: number;
//   readonly type: string = "text/plain";
//   readonly webkitRelativePath: string = "";

//   constructor(name: string, content: string) {
//     this.name = name;
//     this.content = content;
//     this.size = content.length;
//   }

//   text = vi.fn(() => Promise.resolve(this.content));
//   bytes = vi.fn(() => Promise.resolve(new Uint8Array()));
//   arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
//   slice = vi.fn(() => ({} as Blob));
//   stream = vi.fn(() => ({} as ReadableStream<Uint8Array<ArrayBuffer>>));
// }

describe("ScriptureBurritoProjectLoader", () => {
    let loader: ScriptureBurritoProjectLoader;
    let mockProjectDir: MockIDirectoryHandle;
    const MOCK_PROJECT_NAME = "My Test Burrito Project";

    const sampleMetadataJson = {
        meta: {
            version: "1.0.0",
            defaultLocale: "en",
            dateCreated: new Date().toISOString(),
        },
        identification: {
            name: { en: MOCK_PROJECT_NAME },
        },
        languages: [
            {
                tag: "en",
                name: { en: "English" },
                scriptDirection: "ltr",
            },
        ],
        ingredients: {},
    };

    beforeEach(() => {
        vi.clearAllMocks();
        inMemoryFiles = new Map();
        mockProjectDir = new MockDirectoryHandle(MOCK_PROJECT_NAME);
        loader = new ScriptureBurritoProjectLoader(mockMd5Service);
    });

    test("loadProject should load a project from metadata.json", async () => {
        mockProjectDir.files.set(
            ScriptureBurritoProjectLoader.METADATA_FILENAME,
            JSON.stringify(sampleMetadataJson),
        );

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );

        expect(project).not.toBeNull();
        expect(project?.id).toBe(MOCK_PROJECT_NAME);
        expect(project?.name).toBe(MOCK_PROJECT_NAME);
        expect(project?.metadata.language.id).toBe("en");
        expect(project?.metadataJson).toEqual(sampleMetadataJson);
    });

    test("loadProject should return null if metadata.json does not exist", async () => {
        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).toBeNull();
    });

    test("addBook should add a new USFM file and update metadata.json", async () => {
        mockProjectDir.files.set(
            ScriptureBurritoProjectLoader.METADATA_FILENAME,
            JSON.stringify(sampleMetadataJson),
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
            localizedBookTitle,
            contents: bookContents,
        });

        const expectedFilename = "41-MAT.usfm";
        expect(mockFileWriter.writeFile).toHaveBeenCalledWith(
            expectedFilename,
            bookContents,
        );
        expect(mockMd5Service.calculateMd5).toHaveBeenCalledWith(bookContents);

        const memoryWrittenFile = inMemoryFiles.get(
            ScriptureBurritoProjectLoader.METADATA_FILENAME,
        );
        if (!memoryWrittenFile) {
            throw new Error("Metadata file not found in memory");
        }
        const memoryWrittenMetadata = JSON.parse(memoryWrittenFile);
        expect(memoryWrittenMetadata.ingredients).toHaveProperty(
            expectedFilename,
        );
        expect(
            memoryWrittenMetadata.ingredients[expectedFilename].checksum.md5,
        ).toBe(`mock-md5-${bookContents}`);
        expect(memoryWrittenMetadata.ingredients[expectedFilename].title).toBe(
            localizedBookTitle,
        );
    });

    test("addBook should not overwrite an existing file (as ingredient)", async () => {
        const existingIngredients = {
            "41-MAT.usfm": {
                checksum: { md5: "old-md5" },
                mimeType: "text/usfm", // Required field
                size: 12345, // Recommended field (integer)
            },
        };
        const metadataWithExistingBook = {
            ...sampleMetadataJson,
            ingredients: existingIngredients,
        };
        mockProjectDir.files.set(
            ScriptureBurritoProjectLoader.METADATA_FILENAME,
            JSON.stringify(metadataWithExistingBook),
        );
        mockProjectDir.files.set("41-MAT.usfm", "original content");

        const project = await loader.loadProject(
            mockProjectDir,
            mockFileWriter,
        );
        expect(project).not.toBeNull();

        const bookCode = "MAT";
        const bookContents = "new content";

        await project?.addBook({
            bookCode,
            localizedBookTitle: "Matthew",
            contents: bookContents,
        });

        expect(mockFileWriter.writeFile).not.toHaveBeenCalledWith(
            "41-MAT.usfm",
            bookContents,
        );
        expect(mockMd5Service.calculateMd5).not.toHaveBeenCalled();
        // Verify metadata wasn't changed for this book
        const metadataJson = mockProjectDir.files.get(
            ScriptureBurritoProjectLoader.METADATA_FILENAME,
        );
        if (!metadataJson) {
            throw new Error("Metadata file not found");
        }
        const updatedMetadata = JSON.parse(metadataJson);
        expect(updatedMetadata.ingredients["41-MAT.usfm"].checksum.md5).toBe(
            "old-md5",
        );
    });
});
