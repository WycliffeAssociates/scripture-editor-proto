import type {
    FileSystem,
    FileSystemEntry,
} from "@/core/persistence/FileSystem.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Browser implementation of the shared filesystem seam.
 *
 * Import, load, index, and export flows all work with managed storage paths.
 * This adapter keeps those flows platform-neutral by translating that path
 * vocabulary into OPFS handles and by rejecting access outside the managed roots.
 */
function normalizePath(path: string): string {
    if (!path || path === ".") return "/";
    const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
    const stack: string[] = [];
    for (const part of withLeadingSlash.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") {
            stack.pop();
            continue;
        }
        stack.push(part);
    }
    return `/${stack.join("/")}`;
}

function splitPath(path: string): string[] {
    return normalizePath(path).split("/").filter(Boolean);
}

function dirname(path: string): string {
    const normalized = normalizePath(path);
    if (normalized === "/") return "/";
    const parts = splitPath(normalized);
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "/";
}

function basename(path: string): string {
    const parts = splitPath(path);
    return parts.at(-1) ?? "";
}

function isNotFoundError(error: unknown): boolean {
    if (error instanceof DOMException) {
        return error.name === "NotFoundError";
    }
    const message =
        error instanceof Error ? error.message : String(error ?? "");
    return /not found|enoent|no such file/i.test(message);
}

export class OpfsFileSystem implements FileSystem {
    constructor(private readonly roots: StorageRoots) {}

    async readText(path: string): Promise<string> {
        const bytes = await this.readBytes(path);
        return new TextDecoder().decode(bytes);
    }

    async readBytes(path: string): Promise<Uint8Array> {
        const fileHandle = await this.resolveFileHandle(path, false);
        const file = await fileHandle.getFile();
        return new Uint8Array(await file.arrayBuffer());
    }

    async writeText(path: string, content: string): Promise<void> {
        await this.writeBytes(path, new TextEncoder().encode(content));
    }

    async atomicWriteText(path: string, content: string): Promise<void> {
        // OPFS `FileSystemWritableFileStream` buffers writes and commits them
        // on `close()`, so a single `writeText` already gives us atomic
        // replace-on-close semantics. No separate temp-file + rename dance is
        // needed (and `move()` here is copy+delete, which is NOT atomic).
        await this.writeText(path, content);
    }

    async writeBytes(path: string, content: Uint8Array): Promise<void> {
        const normalized = this.assertManagedPath(path);
        const fileHandle = await this.resolveFileHandle(normalized, true);
        const writable = await fileHandle.createWritable({
            keepExistingData: false,
        });
        const stableBytes = new Uint8Array(content.length);
        stableBytes.set(content);
        await writable.write(stableBytes);
        await writable.close();
    }

    async exists(path: string): Promise<boolean> {
        const normalized = this.assertManagedPath(path);
        if (normalized === "/") return true;
        try {
            await this.resolveEntry(normalized);
            return true;
        } catch (error) {
            if (isNotFoundError(error)) {
                return false;
            }
            throw error;
        }
    }

    async list(path: string): Promise<FileSystemEntry[]> {
        const normalized = this.assertManagedPath(path);
        const dirHandle = await this.resolveDirectoryHandle(normalized, false);
        const entries: FileSystemEntry[] = [];
        for await (const [name, handle] of dirHandle.entries()) {
            entries.push({
                name,
                path: normalized === "/" ? `/${name}` : `${normalized}/${name}`,
                kind: handle.kind,
            });
        }
        return entries;
    }

    async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
        const normalized = this.assertManagedPath(path);
        await this.resolveDirectoryHandle(
            normalized,
            opts?.recursive ?? false,
            true,
        );
    }

    async remove(path: string, opts?: { recursive?: boolean }): Promise<void> {
        const normalized = this.assertManagedPath(path);
        if (normalized === "/") {
            throw new Error("Cannot remove root path");
        }

        const parent = await this.resolveDirectoryHandle(
            dirname(normalized),
            false,
        );
        await parent.removeEntry(basename(normalized), {
            recursive: opts?.recursive ?? false,
        });
    }

    async move(from: string, to: string): Promise<void> {
        const source = this.assertManagedPath(from);
        const destination = this.assertManagedPath(to);
        const entry = await this.resolveEntry(source);
        if (entry.kind === "directory") {
            await this.copyDirectory(source, destination);
            await this.remove(source, { recursive: true });
            return;
        }

        const bytes = await this.readBytes(source);
        await this.writeBytes(destination, bytes);
        await this.remove(source);
    }

    async createTempFile(prefix: string, suffix?: string): Promise<string> {
        const filePath = `${this.roots.tempRoot}/${prefix}${Date.now()}${suffix ?? ""}`;
        await this.writeBytes(filePath, new Uint8Array(0));
        return filePath;
    }

    private assertManagedPath(path: string): string {
        const normalized = normalizePath(path);
        const managedRoots = [
            this.roots.appDataRoot,
            this.roots.projectsRoot,
            this.roots.tempRoot,
            this.roots.cacheRoot,
            this.roots.logsRoot,
            this.roots.databaseRoot,
        ].map(normalizePath);

        if (normalized === "/") return normalized;
        if (
            !managedRoots.some(
                (root) =>
                    normalized === root || normalized.startsWith(`${root}/`),
            )
        ) {
            throw new Error(`Path is outside managed storage roots: ${path}`);
        }
        return normalized;
    }

    private async getRoot(): Promise<FileSystemDirectoryHandle> {
        return navigator.storage.getDirectory();
    }

    private async resolveEntry(path: string): Promise<FileSystemHandle> {
        const normalized = normalizePath(path);
        if (normalized === "/") {
            return await this.getRoot();
        }

        const parent = await this.resolveDirectoryHandle(
            dirname(normalized),
            false,
        );
        const name = basename(normalized);
        try {
            return await parent.getFileHandle(name, { create: false });
        } catch {}
        try {
            return await parent.getDirectoryHandle(name, { create: false });
        } catch {
            throw new DOMException(
                `Missing entry: ${normalized}`,
                "NotFoundError",
            );
        }
    }

    private async resolveDirectoryHandle(
        path: string,
        recursive: boolean,
        create = false,
    ): Promise<FileSystemDirectoryHandle> {
        const normalized = normalizePath(path);
        let dir = await this.getRoot();
        if (normalized === "/") return dir;

        const parts = splitPath(normalized);
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, {
                create: create && recursive,
            });
        }
        return dir;
    }

    private async resolveFileHandle(
        path: string,
        create: boolean,
    ): Promise<FileSystemFileHandle> {
        const normalized = normalizePath(path);
        const parent = await this.resolveDirectoryHandle(
            dirname(normalized),
            true,
            create,
        );
        return parent.getFileHandle(basename(normalized), { create });
    }

    private async copyDirectory(from: string, to: string): Promise<void> {
        // Directory moves are copy+delete in OPFS because there is no native
        // rename API for whole directory trees across handles.
        await this.mkdir(to, { recursive: true });
        for (const entry of await this.list(from)) {
            const nextTarget = `${to}/${entry.name}`;
            if (entry.kind === "directory") {
                await this.copyDirectory(entry.path, nextTarget);
            } else {
                await this.writeBytes(
                    nextTarget,
                    await this.readBytes(entry.path),
                );
            }
        }
    }
}
