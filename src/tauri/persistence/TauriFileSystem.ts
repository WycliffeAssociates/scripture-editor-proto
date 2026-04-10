import { dirname, join } from "@tauri-apps/api/path";
import {
    copyFile,
    exists,
    mkdir,
    readDir,
    readFile,
    readTextFile,
    remove,
    rename,
    writeFile,
    writeTextFile,
} from "@tauri-apps/plugin-fs";
import type {
    FileSystem,
    FileSystemEntry,
} from "@/core/persistence/FileSystem.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import { normalizeManagedDesktopPath } from "@/tauri/io/PathUtils.ts";

/**
 * Normalize external path input into the app's managed-storage path format.
 *
 * Upstream code should only ever deal in managed paths like `/userData/projects/...`.
 * This keeps the shared filesystem contract detached from platform-specific path
 * separators and trailing-slash quirks.
 */
function normalizePublicPath(path: string): string {
    const normalized = normalizeManagedDesktopPath(path || "/");
    if (normalized === "") return "/";
    if (/^[A-Za-z]:\/?/u.test(normalized)) return normalized;
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

/**
 * Desktop implementation of the shared filesystem seam.
 *
 * Importers, loaders, index reconciliation, and export flows all operate on the
 * app's managed storage roots through this contract. This adapter is responsible
 * for translating those app-relative paths into Tauri filesystem plugin calls
 * while rejecting anything outside the managed roots.
 */
export class TauriFileSystem implements FileSystem {
    constructor(private readonly roots: StorageRoots) {}

    async readText(path: string): Promise<string> {
        return readTextFile(await this.resolvePath(path));
    }

    async readBytes(path: string): Promise<Uint8Array> {
        const bytes = await readFile(await this.resolvePath(path));
        return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    }

    async writeText(path: string, content: string): Promise<void> {
        const resolved = await this.resolvePath(path);
        await mkdir(await dirname(resolved), { recursive: true });
        await writeTextFile(resolved, content);
    }

    async writeBytes(path: string, content: Uint8Array): Promise<void> {
        const resolved = await this.resolvePath(path);
        await mkdir(await dirname(resolved), { recursive: true });
        await writeFile(resolved, content);
    }

    async exists(path: string): Promise<boolean> {
        return exists(await this.resolvePath(path));
    }

    async list(path: string): Promise<FileSystemEntry[]> {
        const resolved = await this.resolvePath(path);
        const entries = await readDir(resolved);
        return entries.map((entry) => ({
            name: entry.name,
            path: `${normalizePublicPath(path).replace(/\/$/, "")}/${entry.name}`.replace(
                /^$/,
                "/",
            ),
            kind: entry.isDirectory ? "directory" : "file",
        }));
    }

    async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
        await mkdir(await this.resolvePath(path), {
            recursive: opts?.recursive ?? false,
        });
    }

    async remove(path: string, opts?: { recursive?: boolean }): Promise<void> {
        await remove(await this.resolvePath(path), {
            recursive: opts?.recursive ?? false,
        });
    }

    async move(from: string, to: string): Promise<void> {
        const source = await this.resolvePath(from);
        const destination = await this.resolvePath(to);
        await mkdir(await dirname(destination), { recursive: true });
        await rename(source, destination);
    }

    async createTempFile(prefix: string, suffix?: string): Promise<string> {
        const publicPath = `${this.roots.tempRoot}/${prefix}${Date.now()}${suffix ?? ""}`;
        await this.writeBytes(publicPath, new Uint8Array(0));
        return publicPath;
    }
    async copy(from: string, to: string): Promise<void> {
        const source = await this.resolvePath(from);
        const destination = await this.resolvePath(to);
        await mkdir(await dirname(destination), { recursive: true });
        await copyFile(source, destination);
    }

    private async resolvePath(path: string): Promise<string> {
        const normalized = normalizePublicPath(path);
        const candidates = [
            this.roots.appDataRoot,
            this.roots.projectsRoot,
            this.roots.tempRoot,
            this.roots.cacheRoot,
            this.roots.logsRoot,
            this.roots.databaseRoot,
        ].map(normalizePublicPath);

        for (const publicRoot of candidates) {
            if (normalized === publicRoot) {
                return publicRoot;
            }
            if (normalized.startsWith(`${publicRoot}/`)) {
                // Keep callers in the managed-path vocabulary while letting Tauri
                // resolve the final platform path segment safely.
                const relative = normalized.slice(publicRoot.length + 1);
                return join(publicRoot, relative);
            }
        }

        throw new Error(`Path is outside managed storage roots: ${path}`);
    }
}
