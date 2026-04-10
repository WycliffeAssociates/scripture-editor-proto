/** biome-ignore-all lint/suspicious/noExplicitAny: test mocks */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { TauriFileSystem } from "@/tauri/persistence/TauriFileSystem.ts";
import { TauriStorageRoots } from "@/tauri/persistence/TauriStorageRoots.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

const fileStore = new Map<string, Uint8Array>();
const dirStore = new Set<string>();

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

vi.mock("@tauri-apps/api/path", () => {
    const pathModule = require("node:path");
    return {
        join: vi.fn((...parts: string[]) =>
            normalizePath(pathModule.join(...parts)),
        ),
        dirname: vi.fn((path: string) =>
            normalizePath(pathModule.dirname(path)),
        ),
        appDataDir: vi.fn(async () => "/mock/app/data"),
        appLocalDataDir: vi.fn(async () => "/mock/app/local"),
    };
});

vi.mock("@tauri-apps/plugin-fs", () => ({
    exists: vi.fn(async (path: string) => {
        const normalized = normalizePath(path);
        return fileStore.has(normalized) || dirStore.has(normalized);
    }),
    mkdir: vi.fn(async (path: string, opts?: { recursive?: boolean }) => {
        const normalized = normalizePath(path);
        if (opts?.recursive) {
            let current = "";
            for (const part of normalized.split("/").filter(Boolean)) {
                current = current ? `${current}/${part}` : `/${part}`;
                dirStore.add(current);
            }
            return;
        }
        dirStore.add(normalized);
    }),
    writeTextFile: vi.fn(async (path: string, contents: string) => {
        fileStore.set(normalizePath(path), new TextEncoder().encode(contents));
    }),
    writeFile: vi.fn(async (path: string, bytes: Uint8Array) => {
        fileStore.set(normalizePath(path), bytes);
    }),
    readTextFile: vi.fn(async (path: string) => {
        const bytes = fileStore.get(normalizePath(path));
        if (!bytes) throw new Error("File not found");
        return new TextDecoder().decode(bytes);
    }),
    readFile: vi.fn(async (path: string) => {
        const bytes = fileStore.get(normalizePath(path));
        if (!bytes) throw new Error("File not found");
        return bytes;
    }),
    readDir: vi.fn(async (path: string) => {
        const normalized = normalizePath(path);
        const directChildren = new Map<string, { isDirectory: boolean; name: string }>();
        for (const dir of dirStore) {
            if (!dir.startsWith(`${normalized}/`)) continue;
            const remainder = dir.slice(normalized.length + 1);
            if (!remainder || remainder.includes("/")) continue;
            directChildren.set(remainder, {
                name: remainder,
                isDirectory: true,
            });
        }
        for (const file of fileStore.keys()) {
            if (!file.startsWith(`${normalized}/`)) continue;
            const remainder = file.slice(normalized.length + 1);
            if (!remainder || remainder.includes("/")) continue;
            directChildren.set(remainder, {
                name: remainder,
                isDirectory: false,
            });
        }
        return Array.from(directChildren.values());
    }),
    remove: vi.fn(async (path: string, opts?: { recursive?: boolean }) => {
        const normalized = normalizePath(path);
        if (fileStore.delete(normalized)) return;
        if (dirStore.has(normalized)) {
            if (opts?.recursive) {
                for (const file of Array.from(fileStore.keys())) {
                    if (file.startsWith(`${normalized}/`)) fileStore.delete(file);
                }
                for (const dir of Array.from(dirStore)) {
                    if (dir === normalized || dir.startsWith(`${normalized}/`)) {
                        dirStore.delete(dir);
                    }
                }
                return;
            }
            dirStore.delete(normalized);
            return;
        }
        throw new Error("Not found");
    }),
    rename: vi.fn(async (from: string, to: string) => {
        const fromNormalized = normalizePath(from);
        const toNormalized = normalizePath(to);
        const bytes = fileStore.get(fromNormalized);
        if (!bytes) throw new Error("Not found");
        fileStore.set(toNormalized, bytes);
        fileStore.delete(fromNormalized);
    }),
    copyFile: vi.fn(async (from: string, to: string) => {
        const fromNormalized = normalizePath(from);
        const toNormalized = normalizePath(to);
        const bytes = fileStore.get(fromNormalized);
        if (!bytes) throw new Error("Not found");
        fileStore.set(toNormalized, new Uint8Array(bytes));
    }),
}));

describe("TauriFileSystem", () => {
    let roots: TauriStorageRoots;

    beforeEach(async () => {
        fileStore.clear();
        dirStore.clear();
        roots = await TauriStorageRoots.create();
        for (const path of [
            roots.appDataRoot,
            roots.projectsRoot,
            roots.tempRoot,
            roots.cacheRoot,
            roots.logsRoot,
            roots.databaseRoot,
        ]) {
            dirStore.add(path);
        }
    });

    it("writes and reads text through resolved tauri paths", async () => {
        const fs = new TauriFileSystem(roots);
        await fs.writeText("/mock/app/data/projects/reg/63-1JN.usfm", "\\id 1JN");
        await expect(
            fs.readText("/mock/app/data/projects/reg/63-1JN.usfm"),
        ).resolves.toBe("\\id 1JN");
    });

    it("lists typed entries for a managed directory", async () => {
        const fs = new TauriFileSystem(roots);
        await fs.writeText("/mock/app/data/projects/reg/63-1JN.usfm", "a");
        const entries = await fs.list("/mock/app/data/projects/reg");
        expect(entries).toEqual([
            {
                kind: "file",
                name: "63-1JN.usfm",
                path: "/mock/app/data/projects/reg/63-1JN.usfm",
            },
        ]);
    });

    it("moves content between managed paths", async () => {
        const fs = new TauriFileSystem(roots);
        await fs.writeText("/mock/app/data/projects/reg/63-1JN.usfm", "content");
        await fs.move(
            "/mock/app/data/projects/reg/63-1JN.usfm",
            "/mock/app/data/projects/reg/renamed.usfm",
        );
        await expect(
            fs.exists("/mock/app/data/projects/reg/63-1JN.usfm"),
        ).resolves.toBe(false);
        await expect(
            fs.readText("/mock/app/data/projects/reg/renamed.usfm"),
        ).resolves.toBe("content");
    });

    it("creates temp files inside the resolved temp root", async () => {
        const fs = new TauriFileSystem(roots);
        const tempPath = await fs.createTempFile("import-", ".zip");
        expect(tempPath).toMatch(/^\/mock\/app\/local\/temp\/import-\d+\.zip$/);
        await expect(fs.exists(tempPath)).resolves.toBe(true);
    });

    it("allows app-private cloud session files under appDataRoot", async () => {
        const fs = new TauriFileSystem(roots);
        const sessionPath =
            "/mock/app/local/git-remote/git-remote-session.json";

        await fs.writeText(sessionPath, '{"username":"alice"}');

        await expect(fs.readText(sessionPath)).resolves.toBe(
            '{"username":"alice"}',
        );
    });

    it("preserves windows drive-letter roots when resolving managed paths", async () => {
        const windowsRoots: StorageRoots = {
            appDataRoot:
                "C:/Users/person/AppData/Local/org.bibletranslationtools.bttrefinerproto",
            projectsRoot:
                "C:/Users/person/AppData/Roaming/org.bibletranslationtools.bttrefinerproto/projects",
            tempRoot:
                "C:/Users/person/AppData/Local/org.bibletranslationtools.bttrefinerproto/temp",
            cacheRoot:
                "C:/Users/person/AppData/Local/org.bibletranslationtools.bttrefinerproto/cache",
            logsRoot:
                "C:/Users/person/AppData/Local/org.bibletranslationtools.bttrefinerproto/logs",
            databaseRoot:
                "C:/Users/person/AppData/Local/org.bibletranslationtools.bttrefinerproto/database",
        };
        const fs = new TauriFileSystem(windowsRoots);
        const projectInfoPath =
            "C:/Users/person/AppData/Local/org.bibletranslationtools.bttrefinerproto/git-remote/project-info/C%3A%2FUsers%2Fperson%2FAppData%2FRoaming%2Forg.bibletranslationtools.bttrefinerproto%2Fprojects%2Fmerged-ida-xisukha%20(1).json";

        await fs.writeText(projectInfoPath, '{"ok":true}');

        expect(writeTextFile).toHaveBeenCalledWith(
            projectInfoPath,
            '{"ok":true}',
        );
    });
});
