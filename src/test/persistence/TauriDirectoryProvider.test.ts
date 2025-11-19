import { dirname, join, normalize } from "@tauri-apps/api/path"; // This will be mocked
import { mkdir, open, remove } from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, test, vi } from "vitest";

// --- MOCK CONSTANTS ---
const MOCK_APP_NAME = "test-app";
const MOCK_HOME_DIR = "/mock/user/home";
const MOCK_APP_LOCAL_DATA = "/mock/app/localdata";
const MOCK_IOS_APPDATA = "/mock/ios/appdata";

const SAMPLE_SOURCE_METADATA = {
  creator: "unfoldingWord",
  identifier: "ult",
  language: { slug: "en" },
  version: 1,
  type: "bible",
};

const SAMPLE_TARGET_METADATA = {
  creator: "proskomma",
  identifier: "luke",
  language: { slug: "fr" },
  version: 2,
};

// --- VITEST MOCKS ---

// Mocking @tauri-apps/api/app to control the app name
vi.mock("@tauri-apps/api/app", () => ({
  getName: vi.fn(() => Promise.resolve(MOCK_APP_NAME)),
}));

// Mocking @tauri-apps/plugin-os to control the OS name
vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "windows"), // Default to 'windows' for testing homeDir logic
}));

vi.mock("@tauri-apps/api/path", () => {
  const pathModule = require("node:path");
  return {
    appLocalDataDir: vi.fn(() => Promise.resolve(MOCK_APP_LOCAL_DATA)),
    appDataDir: vi.fn(() => Promise.resolve(MOCK_IOS_APPDATA)),
    join: vi.fn(pathModule.join),
    homeDir: vi.fn(() => Promise.resolve(MOCK_HOME_DIR)),
    dirname: vi.fn(pathModule.dirname),
    normalize: vi.fn(pathModule.normalize),
  };
});

// Mocking your custom file/directory handlers for isolation
vi.mock("@/tauri/io/TauriFileHandle.ts", () => ({
  TauriFileHandle: vi.fn((path, resolveHandle) => {
    const mockFileHandle = {
      path,
      name: path.split("/").pop() || "",
      kind: "file" as const,
      isDir: false,
      isFile: true,
      getAbsolutePath: vi.fn(() => Promise.resolve(path)),
      getParent: vi.fn(() =>
        resolveHandle(path.substring(0, path.lastIndexOf("/"))),
      ),
      asFileHandle: vi.fn(() => mockFileHandle),
      asDirectoryHandle: vi.fn(() => null),
      isSameEntry: vi.fn(() => Promise.resolve(true)),
      getFile: vi.fn(() =>
        Promise.resolve({
          name: path.split("/").pop() || "",
          size: 1234,
          text: vi.fn(() => Promise.resolve("mock file content")),
        }),
      ),
      createWritable: vi.fn(() =>
        Promise.resolve({
          getWriter: vi.fn(() => ({
            write: vi.fn(() => Promise.resolve()),
            close: vi.fn(() => Promise.resolve()),
            releaseLock: vi.fn(() => Promise.resolve()), // Add releaseLock
          })),
        }),
      ),
    };
    return mockFileHandle;
  }),
}));

vi.mock("@/tauri/io/TauriDirectoryHandle.ts", () => ({
  TauriDirectoryHandle: vi.fn((path, resolveHandle) => ({
    path,
    name: path.split("/").pop(),
    kind: "directory",
    isDir: true,
    isFile: false,
    getAbsolutePath: vi.fn(() => Promise.resolve(path)),
    getParent: vi.fn(() =>
      resolveHandle(path.substring(0, path.lastIndexOf("/"))),
    ),
    asFileHandle: vi.fn(() => null),
    asDirectoryHandle: vi.fn(() => this),
    isSameEntry: vi.fn(() => Promise.resolve(true)),
    entries: vi.fn(async function* () {
      yield ["file1.tmp", { isFile: () => true }];
      yield ["dir2", { isDirectory: () => true }];
    }),
    removeEntry: vi.fn(() => Promise.resolve()),
    getFileHandle: vi.fn(() => Promise.reject(new Error("Mock: Not a file"))),
    getDirectoryHandle: vi.fn(() =>
      Promise.reject(new Error("Mock: Not a directory")),
    ),
  })),
}));

import { TauriDirectoryHandle } from "@/tauri/io/TauriDirectoryHandle.ts";
import { TauriFileHandle } from "@/tauri/io/TauriFileHandle.ts";
import { TauriDirectoryProvider } from "@/tauri/persistence/TauriDirectoryProvider.ts";

const fileStore = new Map<string, string>();
const mockDirectories = new Set<string>();

vi.mock("@tauri-apps/plugin-fs", () => ({
  open: vi.fn((_path: string) => Promise.resolve()),

  mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    const normalizedPath = await normalize(path);
    if (options?.recursive) {
      let currentPath = "";
      for (const part of (await normalizedPath).split("/").filter(Boolean)) {
        currentPath =
          currentPath === "" ? `/${part}` : `${currentPath}/${part}`;
        mockDirectories.add(await normalize(currentPath));
      }
    } else {
      mockDirectories.add(normalizedPath);
    }
  }),
  remove: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    const normalizedPath = await normalize(path);
    const isDirectory = mockDirectories.has(normalizedPath);
    const isFile = fileStore.has(normalizedPath);

    if (isDirectory) {
      const children = Array.from(fileStore.keys()).filter((key) =>
        key.startsWith(`${normalizedPath}/`),
      );
      const subDirs = Array.from(mockDirectories).filter((dir) =>
        dir.startsWith(`${normalizedPath}/`),
      );

      if ((children.length > 0 || subDirs.length > 1) && !options?.recursive) {
        throw new Error(
          `ENOTEMPTY: directory not empty, remove '${normalizedPath}'`,
        );
      }

      children.forEach((key) => {
        fileStore.delete(key);
      });
      subDirs.forEach((dir) => {
        mockDirectories.delete(dir);
      });
      mockDirectories.delete(normalizedPath);
    } else if (isFile) {
      fileStore.delete(normalizedPath);
    } else {
      throw new Error(
        `ENOENT: no such file or directory, remove '${normalizedPath}'`,
      );
    }
  }),

  writeTextFile: vi.fn(
    async (path: string, contents: string, options?: { append?: boolean }) => {
      const normalizedPath = await normalize(path);
      const parentPath = await dirname(normalizedPath); // Use dirname for parent path
      if (
        parentPath &&
        parentPath !== "/" &&
        !mockDirectories.has(parentPath)
      ) {
        await mkdir(parentPath, { recursive: true });
      }

      const existing = fileStore.get(normalizedPath) || "";
      const newContent = options?.append ? existing + contents : contents;
      fileStore.set(normalizedPath, newContent);
    },
  ),

  readTextFile: vi.fn(async (path: string) => {
    const normalizedPath = await normalize(path);
    if (mockDirectories.has(normalizedPath)) {
      throw new Error(
        `EISDIR: illegal operation on a directory, read ${normalizedPath}`,
      );
    }

    const content = fileStore.get(normalizedPath);
    if (content === undefined) {
      throw new Error(`File not found: ${normalizedPath}`);
    }
    return content;
  }),

  exists: vi.fn(async (path: string) => {
    const normalizedPath = await normalize(path);
    return fileStore.has(normalizedPath) || mockDirectories.has(normalizedPath);
  }),

  removeDir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    await remove(await normalize(path), options);
  }),

  removeFile: vi.fn(async (path: string) => {
    await remove(await normalize(path));
  }),

  createDir: vi.fn(async () => {
    /* Handled by mkdir */
  }),

  readDir: vi.fn(async (path: string) => {
    const normalizedPath = await normalize(path);
    if (!mockDirectories.has(normalizedPath)) {
      throw new Error(
        `ENOENT: no such file or directory, scandir '${normalizedPath}'`,
      );
    }

    const entries: Array<{
      name: string;
      isDirectory: boolean;
      isFile: boolean;
    }> = [];
    const seenNames = new Set<string>();

    for (const key of fileStore.keys()) {
      const normalizedKey = await normalize(key);
      if (normalizedKey.startsWith(`${normalizedPath}/`)) {
        const relativePath = normalizedKey
          .substring(normalizedPath.length)
          .replace(/^\/|^\\/, "");
        if (!relativePath.includes("/") && !relativePath.includes("\\")) {
          if (!seenNames.has(relativePath)) {
            entries.push({
              name: relativePath,
              isDirectory: false,
              isFile: true,
            });
            seenNames.add(relativePath);
          }
        }
      }
    }

    for (const dir of mockDirectories) {
      const normalizedDir = await normalize(dir);
      if (
        normalizedDir.startsWith(`${normalizedPath}/`) &&
        normalizedDir !== normalizedPath
      ) {
        const relativePath = normalizedDir
          .substring(normalizedPath.length)
          .replace(/^\/|^\\/, "");
        if (!relativePath.includes("/") && !relativePath.includes("\\")) {
          if (!seenNames.has(relativePath)) {
            entries.push({
              name: relativePath,
              isDirectory: true,
              isFile: false,
            });
            seenNames.add(relativePath);
          }
        }
      }
    }
    return entries;
  }),
}));

// --- VITEST TESTS ---

describe("TauriDirectoryProvider", () => {
  let provider: TauriDirectoryProvider;

  beforeEach(async () => {
    // Reset mocks and create a new provider instance before each test
    vi.clearAllMocks();
    provider = await TauriDirectoryProvider.create("test-app");
  });

  // --- Test 1: Get User Data Directory ---
  test("getUserDataDirectory creates the correct path on Windows/Linux", async () => {
    const appendedPath = "settings";
    const userDataDir = await provider.getAppPublicDirectory(appendedPath);

    const expectedPath = `${MOCK_HOME_DIR}/${MOCK_APP_NAME}/${appendedPath}`;

    expect(userDataDir.path).toBe(expectedPath);
    expect(mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true });
  });

  // --- Test 2 & 3: File Write/Read ---
  test("newFileWriter and newFileReader call file handlers correctly", async () => {
    const userDataDir = await provider.getAppPublicDirectory("settings");
    const testFilePath = await join(userDataDir.path, "test_file.txt");

    // Test 2 (Write)
    const writer = await provider.newFileWriter(testFilePath);
    await writer.write("Hello Tauri filesystem test!");
    await writer.close();

    expect(TauriFileHandle).toHaveBeenCalledWith(
      testFilePath,
      expect.any(Function),
    );
    // The mock writer's methods should have been called
    expect(
      // @ts-expect-error: todo, inspect?
      TauriFileHandle.mock.results[0].value.createWritable,
    ).toHaveBeenCalled();

    // Test 3 (Read)
    const file = await provider.newFileReader(testFilePath);
    expect(file.name).toBe("test_file.txt");
    expect(
      // @ts-expect-error: todo, inspect?
      TauriFileHandle.mock.results[1].value.getFile,
    ).toHaveBeenCalledWith();
  });

  // --- Test 4: Get App Data Directory ---
  test("getAppDataDirectory uses appLocalDataDir", async () => {
    const appendedPath = "db";
    const appDataDir = await provider.getAppPrivateDirectory(appendedPath);

    const expectedPath = `${MOCK_APP_LOCAL_DATA}/${appendedPath}`;

    expect(appDataDir.path).toBe(expectedPath);
    expect(mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true });
  });

  // --- Test 5: Get Project Directory (Complex Path) ---
  test("getProjectDirectory generates complex path correctly", async () => {
    // The project path is built off getUserDataDirectory()
    const projectDir = await provider.getProjectDirectory(
      SAMPLE_SOURCE_METADATA,
      SAMPLE_TARGET_METADATA,
      "mat",
    );

    const baseDir = `${MOCK_HOME_DIR}/${MOCK_APP_NAME}`;
    const expectedPath = `${baseDir}/${SAMPLE_TARGET_METADATA.creator}/${SAMPLE_SOURCE_METADATA.creator}/${SAMPLE_SOURCE_METADATA.language.slug}_${SAMPLE_SOURCE_METADATA.identifier}/v${SAMPLE_TARGET_METADATA.version}/${SAMPLE_TARGET_METADATA.language.slug}/mat`;

    expect(projectDir.path).toBe(expectedPath);
    expect(mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true });
  });

  // --- Test 7: Predefined Directory (logsDirectory) ---
  test('logsDirectory calls getAppDataDirectory with "logs"', async () => {
    const logsDir = await provider.logsDirectory;
    const expectedPath = `${MOCK_APP_LOCAL_DATA}/logs`;

    expect(logsDir.path).toBe(expectedPath);
    expect(mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true });
  });

  // --- Test 8: Test Temp File and Clean ---
  test("cleanTempDirectory calls removeEntry on all entries", async () => {
    // This test relies on the mock implementation of TauriDirectoryHandle
    await provider.cleanTempDirectory();

    const expectedTempDirPath = `${MOCK_APP_LOCAL_DATA}/temp`;

    // Assert that the temp directory was accessed

    expect(TauriDirectoryHandle).toHaveBeenCalledWith(
      expectedTempDirPath,
      expect.any(Function),
    );

    // Assert that the entries were iterated and removed
    // The mock yields 'file1.tmp' and 'dir2'
    // @ts-expect-error
    const tempDirHandle = TauriDirectoryHandle.mock.results.find(
      (r) => r.value.path === expectedTempDirPath,
    )?.value;

    expect(tempDirHandle.entries).toHaveBeenCalled();
    expect(tempDirHandle.removeEntry).toHaveBeenCalledWith("file1.tmp", {
      recursive: true,
    });
    expect(tempDirHandle.removeEntry).toHaveBeenCalledWith("dir2", {
      recursive: true,
    });
    expect(tempDirHandle.removeEntry).toHaveBeenCalledTimes(2);
  });

  // --- Test 9: openInFileManager ---
  test("openInFileManager calls open command", async () => {
    const testPath = "/test/path/to/open";
    await provider.openInFileManager(testPath);
    expect(open).toHaveBeenCalledWith(testPath);
  });
});
