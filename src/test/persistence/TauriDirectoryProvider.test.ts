import { join } from "@tauri-apps/api/path"; // This will be mocked
import { mkdir, open } from "@tauri-apps/plugin-fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TauriFileHandle } from "@/tauri/persistence/handlers/TauriFileHandle.ts"; // These will be mocked
import { TauriDirectoryProvider } from "@/tauri/persistence/TauriDirectoryProvider.ts";

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

// Mocking @tauri-apps/api/path to provide predictable paths
// Note: In Vitest, Node.js path module's join is often sufficient,
// but we mock it to control the output of Tauri's path functions.
vi.mock("@tauri-apps/api/path", () => {
    // We use Node's path.join here just for simple, consistent path concatenation
    const path = require("node:path");
    return {
        join: vi.fn(path.join),
        homeDir: vi.fn(() => Promise.resolve(MOCK_HOME_DIR)),
        appDataDir: vi.fn(() => Promise.resolve(MOCK_IOS_APPDATA)),
        appLocalDataDir: vi.fn(() => Promise.resolve(MOCK_APP_LOCAL_DATA)),
    };
});

// Mocking @tauri-apps/plugin-fs commands
vi.mock("@tauri-apps/plugin-fs", () => ({
    // Mocking mkdir to ensure no actual directories are created
    mkdir: vi.fn(() => Promise.resolve()),
    // Mocking open to ensure no actual file manager interaction
    open: vi.fn(() => Promise.resolve()),
}));

// Mocking your custom file/directory handlers for isolation
vi.mock("@/persistence/handlers/TauriFileHandle.ts", () => ({
    TauriFileHandle: vi.fn((path) => ({
        path,
        createWritable: vi.fn(() =>
            Promise.resolve({
                getWriter: vi.fn(() => ({
                    write: vi.fn(() => Promise.resolve()),
                    close: vi.fn(() => Promise.resolve()),
                })),
            }),
        ),
        getFile: vi.fn(() =>
            Promise.resolve({
                name: path.split("/").pop(),
                size: 1234,
            }),
        ),
    })),
}));

vi.mock("@/persistence/handlers/TauriDirectoryHandle.ts", () => ({
    TauriDirectoryHandle: vi.fn((path) => ({
        path,
        // Mock entries/removeEntry for cleanTempDirectory
        entries: vi.fn(async function* () {
            yield ["file1.tmp", { isFile: () => true }];
            yield ["dir2", { isDirectory: () => true }];
        }),
        removeEntry: vi.fn(() => Promise.resolve()),
    })),
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
        const userDataDir = await provider.getUserDataDirectory(appendedPath);

        const expectedPath = `${MOCK_HOME_DIR}/${MOCK_APP_NAME}/${appendedPath}`;

        expect(userDataDir.path).toBe(expectedPath);
        expect(mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true });
    });

    // --- Test 2 & 3: File Write/Read ---
    test("newFileWriter and newFileReader call file handlers correctly", async () => {
        const userDataDir = await provider.getUserDataDirectory("settings");
        const testFilePath = await join(userDataDir.path, "test_file.txt");

        // Test 2 (Write)
        const writer = await provider.newFileWriter(testFilePath);
        await writer.write("Hello Tauri filesystem test!");
        await writer.close();

        expect(TauriFileHandle).toHaveBeenCalledWith(testFilePath);
        // The mock writer's methods should have been called
        // @ts-expect-error
        expect(
            TauriFileHandle.mock.results[0].value.createWritable,
        ).toHaveBeenCalled();

        // Test 3 (Read)
        const file = await provider.newFileReader(testFilePath);
        expect(file.name).toBe("test_file.txt");
        // @ts-expect-error
        expect(
            TauriFileHandle.mock.results[1].value.getFile,
        ).toHaveBeenCalled();
    });

    // --- Test 4: Get App Data Directory ---
    test("getAppDataDirectory uses appLocalDataDir", async () => {
        const appendedPath = "db";
        const appDataDir = await provider.getAppDataDirectory(appendedPath);

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
        // @ts-expect-error
        expect(TauriDirectoryHandle).toHaveBeenCalledWith(expectedTempDirPath);

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
