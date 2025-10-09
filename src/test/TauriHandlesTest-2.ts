import {beforeEach, describe, expect, test, vi} from "vitest";

// Mock state for the file system
let mockFileState: {[path: string]: string} = {};

// Mock functions for tauri-apps/plugin-fs
const mockReadTextFile = vi.fn((path: string) => {
  const content = mockFileState[path];
  if (content === undefined) {
    // Simulate 'not found' error if no mock content is set for the path
    return Promise.reject(new Error("No such file or directory"));
  }
  return Promise.resolve(content);
});

const mockWriteTextFile = vi.fn((path: string, contents: string) => {
  mockFileState[path] = contents;
  return Promise.resolve();
});

// Use vi.mock to intercept calls to the Tauri FS plugin within TauriHandles.ts
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: mockReadTextFile,
  writeTextFile: mockWriteTextFile,
  // Add other imported methods used in TauriHandles.ts to satisfy imports
  mkdir: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  readDir: vi.fn(() => Promise.resolve([])),
}));

// Use vi.mock to intercept calls to the Tauri Path API
vi.mock("@tauri-apps/api/path", () => ({
  join: (...parts: string[]) => parts.join("/"),
}));

// Assuming the TauriHandles implementation is in a file named 'TauriHandles.ts'
import {TauriFileHandle} from "../core/domain/persistence/TauriHandles";

describe("TauriFileHandle.createWritable()", () => {
  const TEST_FILE_PATH = "/test/file.txt";

  beforeEach(() => {
    // Reset file state and clear mock history before each test
    mockFileState = {};
    mockReadTextFile.mockClear();
    mockWriteTextFile.mockClear();
  });

  // Helper function to simulate the Tauri file read for a handle
  const setupFileRead = (path: string, content: string) => {
    mockFileState[path] = content;
  };

  // Helper function to create a writer and close it, applying all operations
  const executeWriteOps = async (
    handle: TauriFileHandle,
    ops: (writer: WritableStreamDefaultWriter) => Promise<void>
  ) => {
    const stream = await handle.createWritable();
    const writer = stream.getWriter();
    try {
      await ops(writer);
    } finally {
      await writer.close();
    }
    // Ensure writeTextFile was called exactly once on close/commit
    expect(mockWriteTextFile).toHaveBeenCalledTimes(1);
  };

  test("should create a new file and write text on commit", async () => {
    const handle = new TauriFileHandle(TEST_FILE_PATH);

    // readTextFile will throw, meaning the file is created empty.
    await executeWriteOps(handle, async (writer) => {
      await writer.write("Initial content.");
    });

    // readTextFile should be called once to check for existing content
    expect(mockReadTextFile).toHaveBeenCalledTimes(1);
    // The content should now be committed to the mock file system state
    expect(mockFileState[TEST_FILE_PATH]).toBe("Initial content.");
  });

  test("should append content to an existing file on first write", async () => {
    const initialContent = "Existing start. ";
    setupFileRead(TEST_FILE_PATH, initialContent);
    const handle = new TauriFileHandle(TEST_FILE_PATH);

    await executeWriteOps(handle, async (writer) => {
      await writer.write("Appended end.");
    });

    // The initial content should be loaded and the new content appended
    expect(mockReadTextFile).toHaveBeenCalledTimes(1);
    expect(mockFileState[TEST_FILE_PATH]).toBe("Existing start. Appended end.");
  });

  test("should seek and overwrite content correctly", async () => {
    const initialContent = "The quick brown fox jumps over the lazy dog.";
    setupFileRead(TEST_FILE_PATH, initialContent);
    const handle = new TauriFileHandle(TEST_FILE_PATH);

    await executeWriteOps(handle, async (writer) => {
      // Seek to position 10 (right before 'brown')
      await writer.seek(10);
      await writer.write("RED"); // "The quick REDn fox jumps over the lazy dog."
    });

    expect(mockFileState[TEST_FILE_PATH]).toBe(
      "The quick REDn fox jumps over the lazy dog."
    );
  });

  test("should truncate the file to a specified size", async () => {
    const initialContent = "A very long string of text for truncation.";
    setupFileRead(TEST_FILE_PATH, initialContent);
    const handle = new TauriFileHandle(TEST_FILE_PATH);

    await executeWriteOps(handle, async (writer) => {
      // Truncate to size 15 ("A very long s")
      await writer.truncate(15);
    });

    expect(mockFileState[TEST_FILE_PATH]).toBe("A very long s");
  });

  test("should handle truncate, seek, and write sequence", async () => {
    const initialContent = "OneTwoThreeFourFive";
    setupFileRead(TEST_FILE_PATH, initialContent);
    const handle = new TauriFileHandle(TEST_FILE_PATH);

    await executeWriteOps(handle, async (writer) => {
      // 1. Truncate to "One" (length 3)
      await writer.truncate(3);
      // 2. Seek to the new end (position 3)
      await writer.seek(3);
      // 3. Write "Four"
      await writer.write("Four");
      // Result: "OneFour"
    });

    expect(mockFileState[TEST_FILE_PATH]).toBe("OneFour");
  });

  test("should process different data types correctly", async () => {
    const handle = new TauriFileHandle(TEST_FILE_PATH);

    await executeWriteOps(handle, async (writer) => {
      await writer.write("String content. ");

      // Writing an ArrayBuffer
      const arrBuffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]).buffer; // "Hello"
      await writer.write(arrBuffer);

      await writer.write(" and ");

      // Writing a Blob
      const blob = new Blob(["Blob"], {type: "text/plain"});
      await writer.write(blob);
    });

    // Should decode to the combined string
    expect(mockFileState[TEST_FILE_PATH]).toBe(
      "String content. Hello and Blob"
    );
  });

  test("should reset buffer on abort", async () => {
    const initialContent = "Keep this safe.";
    setupFileRead(TEST_FILE_PATH, initialContent);
    const handle = new TauriFileHandle(TEST_FILE_PATH);

    const stream = await handle.createWritable();
    const writer = stream.getWriter();

    await writer.write("This should be discarded.");
    await writer.abort(); // Discard the current buffer

    // Verify writeTextFile was NOT called
    expect(mockWriteTextFile).toHaveBeenCalledTimes(0);

    // After abort, the mock file state should remain unchanged (initial content)
    expect(mockFileState[TEST_FILE_PATH]).toBe(initialContent);

    // A subsequent close should also not trigger a write
    await writer.close();
    expect(mockWriteTextFile).toHaveBeenCalledTimes(0);
  });
});
