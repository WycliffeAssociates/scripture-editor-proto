// --------------------------------------------------------------------------------
// TEST LOGIC AND EXECUTION
// --------------------------------------------------------------------------------

import { join } from "@tauri-apps/api/path";
import { TauriDirectoryProvider } from "@/core/domain/persistence/TauriDirectoryProvider";

const logArea = document.getElementById("log-area");

/**
 * Appends a message to the UI log area.
 * @param {string} message
 * @param {string} [className]
 */
function log(message: string, className = "") {
    // const entry = document.createElement('div');
    // entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    // if (className) {
    //     entry.className = className;
    // }
    // logArea.appendChild(entry);
    // logArea.scrollTop = logArea.scrollHeight; // Scroll to bottom
    console.log(message);
}

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

/**
 * Executes all functional tests for the Directory Provider.
 */
export async function runTests() {
    log("--- Starting Functional Directory Tests ---", "font-bold");

    const provider = await TauriDirectoryProvider.create("app");

    try {
        // TEST 1: Get User Data Directory
        log("--- Test 1: create settings directory in UserDataDirectory ---");
        const userDataDir = await provider.getUserDataDirectory("settings");
        log(`Path generated: ${userDataDir.path}`);
        log("Test 1 Passed: User data directory created.", "log-success");

        // TEST 2: Write a file to the User Data Directory
        log("--- Test 2: newFileWriter (Write Test) ---");
        const testFilePath = await join(userDataDir.path, "test_file.txt");
        const writer = await provider.newFileWriter(await testFilePath);
        await writer.write("Hello Tauri filesystem test!");
        await writer.close();
        log("Test 2 Passed: File written (mocked).", "log-success");

        // TEST 3: Read the file back (mocked)
        log("--- Test 3: newFileReader (Read Test) ---");
        const file = await provider.newFileReader(await testFilePath);
        log(`File name: ${file.name}, Size: ${file.size} (Mocked File).`);
        log("Test 3 Passed: File read (mocked).", "log-success");

        // TEST 4: Get App Data Directory
        log("--- Test 4: getAppDataDirectory ---");
        const appDataDir = await provider.getAppDataDirectory("db");
        log(`Path generated: ${appDataDir.path}`);
        log("Test 4 Passed: App data directory created.", "log-success");

        // TEST 5: Get Project Directory (Complex Path)
        log("--- Test 5: getProjectDirectory ---");
        const projectDir = await provider.getProjectDirectory(
            SAMPLE_SOURCE_METADATA,
            SAMPLE_TARGET_METADATA,
            "mat", // Book slug
        );
        log(`Project Path: ${projectDir.path}`);
        log("Test 5 Passed: Complex project path generated.", "log-success");

        // TEST 7: Test Predefined Directory (logsDirectory)
        log("--- Test 7: logsDirectory (Predefined) ---");
        const logsDir = await provider.logsDirectory;
        log(`Logs Path: ${logsDir.path}`);
        log(
            "Test 7 Passed: Predefined logs directory accessed.",
            "log-success",
        );

        // TEST 8: Test Temp File and Clean
        log("--- Test 8: createTempFile & cleanTempDirectory ---");
        const tempFile = await provider.createTempFile("upload", ".part");
        log(`Temp File Path: ${tempFile.path}`);
        await provider.cleanTempDirectory();
        log(
            "Test 8 Passed: Temp directory created and clean called.",
            "log-success",
        );

        // TEST 9: openInFileManager
        log("--- Test 9: openInFileManager ---");
        await provider.openInFileManager(userDataDir.path);
        log("Test 9 Passed: openInFileManager called (mocked).", "log-success");
    } catch (error) {
        // @ts-ignore
        log(`FATAL TEST ERROR: ${error.message}`, "log-error");
        console.error("Test Error:", error);
    }

    log("--- All Functional Directory Tests Complete ---", "font-bold");
}
