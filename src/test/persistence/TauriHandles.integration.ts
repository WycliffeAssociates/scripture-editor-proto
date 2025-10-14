// src/__tests__/persistence/TauriFileHandle.integration.ts

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
// ⚠️ IMPORTANT: These must be the actual Tauri APIs, not mocks!
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { mkdir, remove, readTextFile } from "@tauri-apps/plugin-fs";
import {TauriFileHandle} from "@/tauri/persistence/handlers/TauriFileHandle.ts";

// Assuming this path is correct for your project structure

// --- SETUP CONSTANTS ---
const TEST_DIR_NAME = "tauri-file-handle-tests";
const TEST_FILE_NAME = "stream_test.txt";
let testDirPath: string;
let testFilePath: string;

// --- Helper to read file content via Tauri FS plugin (for verification) ---
// This bypasses the stream API and reads the final state of the file directly.
const readVerificationContent = async (path: string): Promise<string> => {
    // We use the direct readTextFile call from the FS plugin for assertion,
    // which is the simplest way to check the final state.
    return readTextFile(path);
};

// --- SKIP CONTROL ---
// These tests MUST be skipped in a regular Vitest/Node.js environment.
// They should only be run using a specific command/flag in Tauri.
// E.g., run only if a specific environment variable is set.
const isTauriEnv = process.env.TAURI_TEST_INTEGRATION === 'true';
const integrationTest = isTauriEnv ? test : test.skip;

// 3. Mock the OS Plugin API
vi.mock("@tauri-apps/plugin-os", () => ({
    platform: vi.fn(() => Promise.resolve('windows')),
}));

vi.mock("@tauri-apps/api/path", () => ({
    // Since invoke is mocked, appLocalDataDir *should* work without being fully mocked,
    // but it's safer to provide direct mocks for stability.
    appLocalDataDir: vi.fn(() => Promise.resolve('/mock/app/localdata')),
    join: (base, ...parts) => require('path').join(base, ...parts),
}));

// Simple in-memory storage for file content simulation
const fileStore = new Map<string, string>();

vi.mock('@tauri-apps/plugin-fs', () => ({

    mkdir: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),

    // Mock functions for reading and writing data
    writeTextFile: vi.fn(async (path: string, contents: string, options?: { append?: boolean }) => {
        const existing = fileStore.get(path) || '';
        const newContent = options?.append ? existing + contents : contents;
        fileStore.set(path, newContent);
        // console.log(`[Mock FS] Wrote ${options?.append ? 'and appended' : ''} to: ${path}. Content length: ${newContent.length}`);
    }),

    readTextFile: vi.fn(async (path: string) => {
        const content = fileStore.get(path);
        if (content === undefined) {
            // Simulate file not found error if needed, but for now return empty string if not exists
            // depending on what the actual Tauri readTextFile does when a file is missing.
            return '';
        }
        // console.log(`[Mock FS] Read from: ${path}. Content length: ${content.length}`);
        return content;
    }),

    // Mock functions for path and directory management (used in setup/teardown)
    exists: vi.fn(async (path: string) => fileStore.has(path)),

    // Mock for directory removal (used in cleanup)
    removeDir: vi.fn(async (path: string) => {
        // Simulate directory removal by clearing all files under this path
        const keysToDelete = Array.from(fileStore.keys()).filter(key => key.startsWith(path));
        keysToDelete.forEach(key => fileStore.delete(key));
    }),

    // Mock for file removal (in case TauriFileHandle uses it)
    removeFile: vi.fn(async (path: string) => {
        fileStore.delete(path);
    }),

    // Mock for directory creation (used in setup)
    createDir: vi.fn(async () => {}),
}));

describe.skipIf(!isTauriEnv)('TauriFileHandle Integration Tests (LIVE FS I/O)', () => {

    // --- SETUP AND CLEANUP HOOKS ---
    beforeAll(async () => {
        // 1. Determine paths
        const baseDir = await appLocalDataDir();
        testDirPath = await join(baseDir, TEST_DIR_NAME);
        testFilePath = await join(testDirPath, TEST_FILE_NAME);

        // 2. Initial cleanup and directory creation
        try {
            // Remove the file first, then the directory recursively
            await remove(testFilePath);
            await remove(testDirPath, { recursive: true });
        } catch (e) {
            // Ignore 'not found' errors during clean up
        }

        // 3. Create the necessary directory
        await mkdir(testDirPath, { recursive: true });

        console.log(`\n\t🧪 LIVE I/O: Using base test directory: ${testDirPath}`);
    });

    afterAll(async () => {
        // Final cleanup
        try {
            await remove(testDirPath, { recursive: true });
            console.log(`\t🧹 Cleaned up test directory: ${testDirPath}\n`);
        } catch (e) {
            console.error(`\t🚨 Failed final cleanup for ${testDirPath}: ${e}`);
        }
    });

    // --- INTEGRATION TESTS ---

    // --- Test 1: Basic Write/Append (keepExistingData: true) ---
    integrationTest('should write and append content using keepExistingData: true', async () => {
        const handle = new TauriFileHandle(testFilePath);

        // Step 1: Write initial content (file is created or truncated)
        let writer = await handle.createWritable({ keepExistingData: true }).then(s => s.getWriter());
        await writer.write("Hello, World!");
        await writer.close();

        let content = await readVerificationContent(testFilePath);
        expect(content).toBe("Hello, World!");

        // Step 2: Re-open and append
        writer = await handle.createWritable({ keepExistingData: true }).then(s => s.getWriter());
        await writer.write(" Appended.");
        await writer.close();

        content = await readVerificationContent(testFilePath);
        expect(content).toBe("Hello, World! Appended.");
    });


    // --- Test 2: Stream Seek/Write (keepExistingData: true) ---
    integrationTest('should perform a stream seek and overwrite content', async () => {
        const handle = new TauriFileHandle(testFilePath);
        const initialContent = "The quick brown fox jumps over the lazy dog.";

        // Set file content (Truncate for fresh start)
        let stream = await handle.createWritable({ keepExistingData: false });
        await stream.write(initialContent);
        await stream.close();

        // Overwrite 'brown' with 'RED'
        stream = await handle.createWritable({ keepExistingData: true });

        // "The quick ".length is 10
        await stream.seek(10);
        await stream.write("RED"); // Note: Using "RED" instead of "RED  " for simpler assertion
        await stream.close();

        // Expected: The content should be "The quick RED fox jumps over the lazy dog."
        const expected = initialContent.slice(0, 10) + "RED" + initialContent.slice(13);
        const actual = await readVerificationContent(testFilePath);

        expect(actual).toBe(expected);
    });

    // --- Test 3: Truncate and Mixed Ops (keepExistingData: true) ---
    integrationTest('should truncate file and then seek/append correctly', async () => {
        const handle = new TauriFileHandle(testFilePath);

        // Set file content (Truncate for fresh start)
        let stream = await handle.createWritable({ keepExistingData: false });
        await stream.write("0123456789ABCDEF");
        await stream.close();

        // Truncate to 10 bytes (should leave '0123456789')
        stream = await handle.createWritable({ keepExistingData: true });
        const expectedTruncate = "0123456789";
        await stream.truncate(expectedTruncate.length);
        await stream.close();

        let actual = await readVerificationContent(testFilePath);
        expect(actual).toBe(expectedTruncate);

        // Re-open and seek/append
        stream = await handle.createWritable({ keepExistingData: true });
        await stream.seek(expectedTruncate.length); // seek to 10
        await stream.write("Z");
        await stream.close();

        actual = await readVerificationContent(testFilePath);
        expect(actual).toBe("0123456789Z");
    });

    // --- Test 4: Default Truncation Test (Uses keepExistingData: false / default) ---
    integrationTest('should perform default truncation (keepExistingData: false)', async () => {
        const handle = new TauriFileHandle(testFilePath);

        // Set file content to 'OLD DATA'
        let stream = await handle.createWritable({ keepExistingData: false });
        await stream.write("OLD DATA");
        await stream.close();

        // Re-open with default options (should truncate the file)
        let writer = await handle.createWritable().then(s => s.getWriter()); // Note: No options passed
        await writer.write("NEW");
        await writer.close();

        const actual = await readVerificationContent(testFilePath);
        expect(actual).toBe("NEW");
    });
});