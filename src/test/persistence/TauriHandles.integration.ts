// src/__tests__/persistence/TauriFileHandle.integration.ts

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
// ⚠️ IMPORTANT: These tests now always run against mocks, not actual Tauri APIs.
// To run against actual Tauri APIs, a true Tauri environment must be set up
// and these mocks should be conditionally skipped or removed.
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { mkdir, remove, readTextFile, readDir, writeTextFile } from "@tauri-apps/plugin-fs";
import {TauriFileHandle} from "@/tauri/io/TauriFileHandle.ts";
import {TauriDirectoryHandle} from "@/tauri/io/TauriDirectoryHandle.ts";
import {TauriDirectoryProvider} from "@/tauri/persistence/TauriDirectoryProvider.ts";
import {IPathHandle} from "@/core/io/IPathHandle.ts";

// --- SETUP CONSTANTS ---
const TEST_DIR_NAME = "tauri-file-handle-tests";
const TEST_FILE_NAME = "stream_test.txt";
let testDirPath: string;
let testFilePath: string;
let testSubDirPath: string;
let testSubFilePath: string;
let tauriDirectoryProvider: TauriDirectoryProvider;

// --- Helper to read file content via Tauri FS plugin (for verification) ---
// This bypasses the stream API and reads the final state of the file directly.
const readVerificationContent = async (path: string): Promise<string> => {
    return readTextFile(path);
};

// All mocks are now unconditional to ensure tests always run.
vi.mock("@tauri-apps/plugin-os", () => ({
    platform: vi.fn(() => Promise.resolve('windows')),
}));

vi.mock("@tauri-apps/api/path", () => {
    const pathModule = require('path');
    return {
        appLocalDataDir: vi.fn(() => Promise.resolve(pathModule.join(process.cwd(), 'mock-app-local-data'))),
        join: vi.fn(pathModule.join),
        homeDir: vi.fn(() => Promise.resolve(pathModule.join(process.cwd(), 'mock-home-dir'))),
        dirname: vi.fn(pathModule.dirname),
    };
});

const fileStore = new Map<string, string>();
const mockDirectories = new Set<string>();

vi.mock('@tauri-apps/plugin-fs', () => ({

    mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
        if (options?.recursive) {
            let currentPath = '';
            for (const part of path.split('/').filter(Boolean)) {
                currentPath = currentPath === '' ? `/${part}` : `${currentPath}/${part}`;
                mockDirectories.add(currentPath);
            }
        } else {
            mockDirectories.add(path);
        }
        // console.log(`[Mock FS] mkdir: ${path}, recursive: ${options?.recursive}, current dirs: ${Array.from(mockDirectories)}`);
    }),
    remove: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
        const isDirectory = mockDirectories.has(path);
        const isFile = fileStore.has(path);

        if (isDirectory) {
            const children = Array.from(fileStore.keys()).filter(key => key.startsWith(`${path}/`));
            const subDirs = Array.from(mockDirectories).filter(dir => dir.startsWith(`${path}/`));

            if ((children.length > 0 || subDirs.length > 1) && !options?.recursive) {
                throw new Error(`ENOTEMPTY: directory not empty, remove '${path}'`);
            }

            // Remove all children files and subdirectories
            children.forEach(key => fileStore.delete(key));
            subDirs.forEach(dir => mockDirectories.delete(dir));
            mockDirectories.delete(path);

        } else if (isFile) {
            fileStore.delete(path);
        } else {
            throw new Error(`ENOENT: no such file or directory, remove '${path}'`);
        }
        // console.log(`[Mock FS] remove: ${path}, recursive: ${options?.recursive}, current dirs: ${Array.from(mockDirectories)}, current files: ${Array.from(fileStore.keys())}`);
    }),

    writeTextFile: vi.fn(async (path: string, contents: string, options?: { append?: boolean }) => {
        // Ensure parent directory exists before writing file
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (parentPath && !mockDirectories.has(parentPath)) {
            // This might happen if parent wasn't explicitly created, so create it
            await mkdir(parentPath, { recursive: true });
        }

        const existing = fileStore.get(path) || '';
        const newContent = options?.append ? existing + contents : contents;
        fileStore.set(path, newContent);
        // console.log(`[Mock FS] Wrote to: ${path}. Content length: ${newContent.length}`);
    }),

    readTextFile: vi.fn(async (path: string) => {
        // Check if it's a directory first
        if (mockDirectories.has(path) && Array.from(fileStore.keys()).filter(key => key.startsWith(`${path}/`)).length === 0) {
            throw new Error(`EISDIR: illegal operation on a directory, read ${path}`);
        }

        const content = fileStore.get(path);
        if (content === undefined) {
            throw new Error(`File not found: ${path}`);
        }
        return content;
    }),

    exists: vi.fn(async (path: string) => {
        return fileStore.has(path) || mockDirectories.has(path);
    }),

    removeDir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
        // Delegate to general remove, ensure recursive is passed if applicable
        await remove(path, options);
    }),

    removeFile: vi.fn(async (path: string) => {
        await remove(path);
    }),

    createDir: vi.fn(async () => { /* Handled by mkdir */ }),

    readDir: vi.fn(async (path: string) => {
        if (!mockDirectories.has(path)) {
            throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
        }

        const entries: any[] = [];
        const seenNames = new Set<string>();

        // Add files
        for (const key of fileStore.keys()) {
            if (key.startsWith(`${path}/`)) {
                const relativePath = key.substring(path.length).replace(/^\/|^\\/, '');
                if (!relativePath.includes('/') && !relativePath.includes('\\')) { // Only direct children
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

        // Add directories
        for (const dir of mockDirectories) {
            if (dir.startsWith(`${path}/`) && dir !== path) {
                const relativePath = dir.substring(path.length).replace(/^\/|^\\/, '');
                if (!relativePath.includes('/') && !relativePath.includes('\\')) { // Only direct children
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

describe('TauriFileHandle Integration Tests (LIVE FS I/O)', () => {
    beforeAll(async () => {
        const baseDir = await appLocalDataDir();
        testDirPath = await join(baseDir, TEST_DIR_NAME);
        testFilePath = await join(testDirPath, TEST_FILE_NAME);
        testSubDirPath = await join(testDirPath, "sub_dir");
        testSubFilePath = await join(testSubDirPath, "sub_file.txt");

        tauriDirectoryProvider = await TauriDirectoryProvider.create("test-app");

        try {
            await remove(testFilePath);
            await remove(testSubFilePath);
            await remove(testSubDirPath, { recursive: true });
            await remove(testDirPath, { recursive: true });
        } catch (e) {
        }

        await mkdir(testDirPath, { recursive: true });
        await mkdir(testSubDirPath, { recursive: true });

        console.log(`\n\t🧪 LIVE I/O: Using base test directory: ${testDirPath}`);
    });

    afterAll(async () => {
        try {
            await remove(testDirPath, { recursive: true });
            console.log(`\t🧹 Cleaned up test directory: ${testDirPath}\n`);
        } catch (e) {
            console.error(`\t🚨 Failed final cleanup for ${testDirPath}: ${e}`);
        }
    });

    test('should write and append content using keepExistingData: true', async () => {
        const handle = new TauriFileHandle(testFilePath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));

        let writer = await handle.createWritable({ keepExistingData: true }).then(s => s.getWriter());
        await writer.write("Hello, World!");
        await writer.close();

        let content = await readVerificationContent(testFilePath);
        expect(content).toBe("Hello, World!");

        writer = await handle.createWritable({ keepExistingData: true }).then(s => s.getWriter());
        await writer.write(" Appended.");
        await writer.close();

        content = await readVerificationContent(testFilePath);
        expect(content).toBe("Hello, World! Appended.");
    });


    test('should perform a stream seek and overwrite content', async () => {
        const handle = new TauriFileHandle(testFilePath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        const initialContent = "The quick brown fox jumps over the lazy dog.";

        let stream = await handle.createWritable({ keepExistingData: false });
        await stream.write(initialContent);
        await stream.close();

        stream = await handle.createWritable({ keepExistingData: true });

        await stream.seek(10);
        await stream.write("RED");
        await stream.close();

        const expected = initialContent.slice(0, 10) + "RED" + initialContent.slice(13);
        const actual = await readVerificationContent(testFilePath);

        expect(actual).toBe(expected);
    });

    test('should truncate file and then seek/append correctly', async () => {
        const handle = new TauriFileHandle(testFilePath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));

        let stream = await handle.createWritable({ keepExistingData: false });
        await stream.write("0123456789ABCDEF");
        await stream.close();

        stream = await handle.createWritable({ keepExistingData: true });
        const expectedTruncate = "0123456789";
        await stream.truncate(expectedTruncate.length);
        await stream.close();

        let actual = await readVerificationContent(testFilePath);
        expect(actual).toBe(expectedTruncate);

        stream = await handle.createWritable({ keepExistingData: true });
        await stream.seek(expectedTruncate.length);
        await stream.write("Z");
        await stream.close();

        actual = await readVerificationContent(testFilePath);
        expect(actual).toBe("0123456789Z");
    });

    test('should perform default truncation (keepExistingData: false)', async () => {
        const handle = new TauriFileHandle(testFilePath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));

        let stream = await handle.createWritable({ keepExistingData: false });
        await stream.write("OLD DATA");
        await stream.close();

        let writer = await handle.createWritable().then(s => s.getWriter());
        await writer.write("NEW");
        await writer.close();

        const actual = await readVerificationContent(testFilePath);
        expect(actual).toBe("NEW");
    });

    test('TauriFileHandle should return its absolute path', async () => {
        const handle = new TauriFileHandle(testFilePath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        expect(await handle.getAbsolutePath()).toBe(testFilePath);
    });

    test('TauriFileHandle should return its parent directory', async () => {
        const handle = new TauriFileHandle(testSubFilePath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        const parent = await handle.getParent();
        expect(parent).toBeInstanceOf(TauriDirectoryHandle);
        expect(parent.path).toBe(testSubDirPath);
    });
});

describe('TauriDirectoryHandle Integration Tests (LIVE FS I/O)', () => {
    let testRootPath: string;
    let testSubDirPath1: string;
    let testSubFilePath1: string;
    let testSubDirPath2: string;

    beforeAll(async () => {
        const baseDir = await appLocalDataDir();
        testRootPath = await join(baseDir, "tauri-directory-handle-tests");
        testSubDirPath1 = await join(testRootPath, "sub_dir_1");
        testSubFilePath1 = await join(testSubDirPath1, "file_1.txt");
        testSubDirPath2 = await join(testRootPath, "sub_dir_2");

        tauriDirectoryProvider = await TauriDirectoryProvider.create("test-app");

        try {
            await remove(testRootPath, { recursive: true });
        } catch (e) { /* ignore */ }
        await mkdir(testRootPath, { recursive: true });
        await mkdir(testSubDirPath1, { recursive: true });
        await writeTextFile(testSubFilePath1, "File 1 content");
        await mkdir(testSubDirPath2, { recursive: true });

        console.log(`\n\t🧪 LIVE I/O: Using base test directory for TauriDirectoryHandle: ${testRootPath}`);
    });

    afterAll(async () => {
        try {
            await remove(testRootPath, { recursive: true });
            console.log(`\t🧹 Cleaned up test directory for TauriDirectoryHandle: ${testRootPath}\n`);
        } catch (e) {
            console.error(`\t🚨 Failed final cleanup for ${testRootPath}: ${e}`);
        }
    });

    test('getDirectoryHandle should create and return a directory handle', async () => {
        const rootHandle = new TauriDirectoryHandle(testRootPath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        const newDirName = 'new_directory';
        const newDirPath = await join(testRootPath, newDirName);

        const newDirHandle = await rootHandle.getDirectoryHandle(newDirName, { create: true });

        expect(newDirHandle).toBeInstanceOf(TauriDirectoryHandle);
        expect(newDirHandle.path).toBe(newDirPath);
        expect(newDirHandle.name).toBe(newDirName);

        const actualEntries = await readDir(testRootPath);
        expect(actualEntries.some(entry => entry.name === newDirName && entry.isDirectory)).toBe(true);
    });

    test('getFileHandle should create and return a file handle', async () => {
        const rootHandle = new TauriDirectoryHandle(testRootPath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        const newFileName = 'new_file.txt';
        const newFilePath = await join(testRootPath, newFileName);

        const newFileHandle = await rootHandle.getFileHandle(newFileName, { create: true });

        expect(newFileHandle).toBeInstanceOf(TauriFileHandle);
        expect(newFileHandle.path).toBe(newFilePath);
        expect(newFileHandle.name).toBe(newFileName);

        const content = await readTextFile(newFilePath);
        expect(content).toBe('');
    });

    test('entries should iterate through children', async () => {
        const rootHandle = new TauriDirectoryHandle(testRootPath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        const entries: [string, IPathHandle][] = [];
        for await (const [name, handle] of rootHandle.entries()) {
            entries.push([name, handle]);
        }
        const expectedNames = ['sub_dir_1', 'sub_dir_2', 'new_directory', 'new_file.txt'];
        expect(entries.map(([name]) => name).sort()).toEqual(expectedNames.sort());

        const subDir1Entry = entries.find(([name]) => name === 'sub_dir_1');
        expect(subDir1Entry?.[1]).toBeInstanceOf(TauriDirectoryHandle);

        const file1Entry = entries.find(([name]) => name === 'new_file.txt');
        expect(file1Entry?.[1]).toBeInstanceOf(TauriFileHandle);
    });

    test('removeEntry should remove a child entry', async () => {
        const rootHandle = new TauriDirectoryHandle(testRootPath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        const fileToRemove = 'temp_remove.txt';
        await rootHandle.getFileHandle(fileToRemove, { create: true });

        let initialEntries: [string, IPathHandle][] = [];
        for await (const entry of rootHandle.entries()) { initialEntries.push(entry); }
        expect(initialEntries.some(([name]) => name === fileToRemove)).toBe(true);

        await rootHandle.removeEntry(fileToRemove);

        let finalEntries: [string, IPathHandle][] = [];
        for await (const entry of rootHandle.entries()) { finalEntries.push(entry); }
        expect(finalEntries.some(([name]) => name === fileToRemove)).toBe(false);

        await expect(readTextFile(await join(testRootPath, fileToRemove))).rejects.toThrow();
    });

    test('TauriDirectoryHandle should return its parent directory', async () => {
        const subDir1Handle = new TauriDirectoryHandle(testSubDirPath1, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        const parent = await subDir1Handle.getParent();
        expect(parent).toBeInstanceOf(TauriDirectoryHandle);
        expect(parent.path).toBe(testRootPath);
    });

    test('TauriDirectoryHandle should return its absolute path', async () => {
        const rootHandle = new TauriDirectoryHandle(testRootPath, tauriDirectoryProvider.getHandle.bind(tauriDirectoryProvider));
        expect(await rootHandle.getAbsolutePath()).toBe(testRootPath);
    });
});