// src/__tests__/persistence/TauriFileHandle.integration.ts

import { describe, test, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
// ⚠️ IMPORTANT: These tests now always run against mocks, not actual Tauri APIs.
// To run against actual Tauri APIs, a true Tauri environment must be set up
// and these mocks should be conditionally skipped or removed.
import { appLocalDataDir, join, dirname, normalize } from "@tauri-apps/api/path";
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
        normalize: vi.fn(pathModule.normalize),
    };
});

const fileStore = new Map<string, string>();
const mockDirectories = new Set<string>();

vi.mock('@tauri-apps/plugin-fs', () => ({

    mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
        const normalizedPath = await normalize(path);
        if (options?.recursive) {
            let currentPath = '';
            for (const part of (await normalizedPath).split('/').filter(Boolean)) {
                currentPath = currentPath === '' ? `/${part}` : `${currentPath}/${part}`;
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
            const children = Array.from(fileStore.keys()).filter(key => key.startsWith(`${normalizedPath}/`));
            const subDirs = Array.from(mockDirectories).filter(dir => dir.startsWith(`${normalizedPath}/`));

            if ((children.length > 0 || subDirs.length > 1) && !options?.recursive) {
                throw new Error(`ENOTEMPTY: directory not empty, remove '${normalizedPath}'`);
            }

            children.forEach(key => fileStore.delete(key));
            subDirs.forEach(dir => mockDirectories.delete(dir));
            mockDirectories.delete(normalizedPath);

        } else if (isFile) {
            fileStore.delete(normalizedPath);
        } else {
            throw new Error(`ENOENT: no such file or directory, remove '${normalizedPath}'`);
        }
    }),

    writeTextFile: vi.fn(async (path: string, contents: string, options?: { append?: boolean }) => {
        const normalizedPath = await normalize(path);
        const parentPath = await dirname(normalizedPath); // Use dirname for parent path
        if (parentPath && parentPath !== '/' && !mockDirectories.has(parentPath)) {
            await mkdir(parentPath, { recursive: true });
        }

        const existing = fileStore.get(normalizedPath) || '';
        const newContent = options?.append ? existing + contents : contents;
        fileStore.set(normalizedPath, newContent);
    }),

    readTextFile: vi.fn(async (path: string) => {
        const normalizedPath = await normalize(path);
        if (mockDirectories.has(normalizedPath)) {
            throw new Error(`EISDIR: illegal operation on a directory, read ${normalizedPath}`);
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

    createDir: vi.fn(async () => { /* Handled by mkdir */ }),

    readDir: vi.fn(async (path: string) => {
        const normalizedPath = await normalize(path);
        if (!mockDirectories.has(normalizedPath)) {
            throw new Error(`ENOENT: no such file or directory, scandir '${normalizedPath}'`);
        }

        const entries: any[] = [];
        const seenNames = new Set<string>();

        for (const key of fileStore.keys()) {
            const normalizedKey = await normalize(key);
            if (normalizedKey.startsWith(`${normalizedPath}/`)) {
                const relativePath = normalizedKey.substring(normalizedPath.length).replace(/^\/|^\\/, '');
                if (!relativePath.includes('/') && !relativePath.includes('\\')) {
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
            if (normalizedDir.startsWith(`${normalizedPath}/`) && normalizedDir !== normalizedPath) {
                const relativePath = normalizedDir.substring(normalizedPath.length).replace(/^\/|^\\/, '');
                if (!relativePath.includes('/') && !relativePath.includes('\\')) {
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

        console.log(`\n\t🧪 LIVE I/O: Using base test directory: ${testDirPath}`);
    });

    beforeEach(async () => {
        // Clear file system state before each test
        fileStore.clear();
        mockDirectories.clear();

        // Set up initial directories for each test
        await mkdir(testDirPath, { recursive: true });
        await mkdir(testSubDirPath, { recursive: true });
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

        let content = await readTextFile(testFilePath);
        expect(content).toBe("Hello, World!");

        writer = await handle.createWritable({ keepExistingData: true }).then(s => s.getWriter());
        await writer.write(" Appended.");
        await writer.close();

        content = await readTextFile(testFilePath);
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
        const actual = await readTextFile(testFilePath);

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

        let actual = await readTextFile(testFilePath);
        expect(actual).toBe(expectedTruncate);

        stream = await handle.createWritable({ keepExistingData: true });
        await stream.seek(expectedTruncate.length);
        await stream.write("Z");
        await stream.close();

        actual = await readTextFile(testFilePath);
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

        const actual = await readTextFile(testFilePath);
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

        console.log(`\n\t🧪 LIVE I/O: Using base test directory for TauriDirectoryHandle: ${testRootPath}`);
    });

    beforeEach(async () => {
        // Clear file system state before each test
        fileStore.clear();
        mockDirectories.clear();

        // Set up initial directories and files for each test
        await mkdir(testRootPath, { recursive: true });
        await mkdir(testSubDirPath1, { recursive: true });
        await writeTextFile(testSubFilePath1, "File 1 content");
        await mkdir(testSubDirPath2, { recursive: true });
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
        const expectedNames = ['sub_dir_1', 'sub_dir_2'];
        expect(entries.map(([name]) => name).sort()).toEqual(expectedNames.sort());

        const subDir1Entry = entries.find(([name]) => name === 'sub_dir_1');
        expect(subDir1Entry?.[1]).toBeInstanceOf(TauriDirectoryHandle);

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