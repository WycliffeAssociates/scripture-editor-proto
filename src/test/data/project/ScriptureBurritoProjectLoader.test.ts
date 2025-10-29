import {beforeEach, describe, expect, test, vi} from "vitest";
import {IMd5Service} from "@/core/domain/md5/IMd5Service.ts";
import {ScriptureBurritoProjectLoader} from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import {IFileWriter} from "@/core/io/IFileWriter.ts";

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
    Promise.reject(new Error("Not implemented for this test"))
  );
  getFileHandle = vi.fn((fileName: string, options?: {create?: boolean}) => {
    if (this.files.has(fileName)) {
      return Promise.resolve(
        new MockFileHandle(fileName, this.files.get(fileName)!)
      );
    } else if (options?.create) {
      const newFileHandle = new MockFileHandle(fileName, "");
      this.files.set(fileName, ""); // Add to internal map
      return Promise.resolve(newFileHandle);
    }
    return Promise.reject(new Error("File not found"));
  });
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

  getFile = vi.fn(() => Promise.resolve(new MockFile(this.name, this.content)));
  createWritable = vi.fn(
    () =>
      Promise.resolve({
        write: vi.fn((data: string) => {
          this.content = data;
          return Promise.resolve();
        }),
        close: vi.fn(() => Promise.resolve()),
        abort: vi.fn(() => Promise.resolve()),
      }) as unknown as FileSystemWritableFileStream
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
  slice = vi.fn(() => ({} as Blob));
  stream = vi.fn(() => ({} as ReadableStream<Uint8Array>));
}

describe("ScriptureBurritoProjectLoader", () => {
  let loader: ScriptureBurritoProjectLoader;
  let mockProjectDir: FileSystemDirectoryHandle;
  const MOCK_PROJECT_NAME = "My Test Burrito Project";
  const MOCK_PROJECT_ID = "test-burrito-id";

  const sampleMetadataJson = {
    id: MOCK_PROJECT_ID,
    identification: {
      name: {en: MOCK_PROJECT_NAME},
    },
    languages: {
      default: {tag: "en", direction: "ltr"},
      en: {name: {en: "English"}},
    },
    ingredients: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectDir = new MockDirectoryHandle(MOCK_PROJECT_NAME);
    loader = new ScriptureBurritoProjectLoader(mockMd5Service);
  });

  test("loadProject should load a project from metadata.json", async () => {
    mockProjectDir.files.set(
      ScriptureBurritoProjectLoader.METADATA_FILENAME,
      JSON.stringify(sampleMetadataJson)
    );

    const project = await loader.loadProject(
      mockProjectDir,
      mockFileWriter,
      mockMd5Service
    );

    expect(project).not.toBeNull();
    expect(project?.id).toBe(MOCK_PROJECT_ID);
    expect(project?.name).toBe(MOCK_PROJECT_NAME);
    expect(project?.metadata.language.id).toBe("en");
    expect(project?.metadataJson).toEqual(sampleMetadataJson);
  });

  test("loadProject should return null if metadata.json does not exist", async () => {
    const project = await loader.loadProject(
      mockProjectDir,
      mockFileWriter,
      mockMd5Service
    );
    expect(project).toBeNull();
  });

  test("addBook should add a new USFM file and update metadata.json", async () => {
    mockProjectDir.files.set(
      ScriptureBurritoProjectLoader.METADATA_FILENAME,
      JSON.stringify(sampleMetadataJson)
    );
    const project = await loader.loadProject(
      mockProjectDir,
      mockFileWriter,
      mockMd5Service
    );
    expect(project).not.toBeNull();

    const bookCode = "MAT";
    const localizedBookTitle = "Matthew";
    const bookContents = "\\id MAT \\c 1 \\v 1 In the beginning...";

    await project!.addBook(bookCode, localizedBookTitle, bookContents);

    const expectedFilename = "41-MAT.usfm";
    expect(mockFileWriter.writeFile).toHaveBeenCalledWith(
      expectedFilename,
      bookContents
    );
    expect(mockMd5Service.calculateMd5).toHaveBeenCalledWith(bookContents);

    const updatedMetadata = JSON.parse(
      mockProjectDir.files.get(ScriptureBurritoProjectLoader.METADATA_FILENAME)!
    );
    expect(updatedMetadata.ingredients).toHaveProperty(expectedFilename);
    expect(updatedMetadata.ingredients[expectedFilename].checksum.md5).toBe(
      `mock-md5-${bookContents}`
    );
    expect(updatedMetadata.ingredients[expectedFilename].title).toBe(
      localizedBookTitle
    );
  });

  test("addBook should not overwrite an existing file (as ingredient)", async () => {
    const existingIngredients = {"41-MAT.usfm": {checksum: {md5: "old-md5"}}};
    const metadataWithExistingBook = {
      ...sampleMetadataJson,
      ingredients: existingIngredients,
    };
    mockProjectDir.files.set(
      ScriptureBurritoProjectLoader.METADATA_FILENAME,
      JSON.stringify(metadataWithExistingBook)
    );
    mockProjectDir.files.set("41-MAT.usfm", "original content");

    const project = await loader.loadProject(
      mockProjectDir,
      mockFileWriter,
      mockMd5Service
    );
    expect(project).not.toBeNull();

    const bookCode = "MAT";
    const bookContents = "new content";

    await project!.addBook(bookCode, "Matthew", bookContents);

    expect(mockFileWriter.writeFile).not.toHaveBeenCalledWith(
      "41-MAT.usfm",
      bookContents
    );
    expect(mockMd5Service.calculateMd5).not.toHaveBeenCalled();
    // Verify metadata wasn't changed for this book
    const updatedMetadata = JSON.parse(
      mockProjectDir.files.get(ScriptureBurritoProjectLoader.METADATA_FILENAME)!
    );
    expect(updatedMetadata.ingredients["41-MAT.usfm"].checksum.md5).toBe(
      "old-md5"
    );
  });
});
