import type { FileSystem, FileSystemEntry } from "@/core/persistence/FileSystem.ts";

function normalizePath(path: string): string {
    const normalized = path.replace(/\/+/gu, "/");
    if (!normalized.startsWith("/")) return `/${normalized}`;
    return normalized;
}

function dirname(path: string): string {
    const normalized = normalizePath(path);
    if (normalized === "/") return "/";
    const parts = normalized.split("/").filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "/";
}

function basename(path: string): string {
    const normalized = normalizePath(path);
    const parts = normalized.split("/").filter(Boolean);
    return parts.at(-1) ?? "";
}

function ensureParentDirectories(
    directories: Set<string>,
    path: string,
): void {
    let current = dirname(path);
    while (current !== "/") {
        directories.add(current);
        current = dirname(current);
    }
    directories.add("/");
}

export class InMemoryFileSystem implements FileSystem {
    readonly files = new Map<string, string | Uint8Array>();
    readonly directories = new Set<string>(["/"]);
    private tempCounter = 0;

    constructor(initialFiles: Record<string, string | Uint8Array> = {}) {
        for (const [path, content] of Object.entries(initialFiles)) {
            const normalized = normalizePath(path);
            this.files.set(normalized, content);
            ensureParentDirectories(this.directories, normalized);
        }
    }

    async readText(path: string): Promise<string> {
        const normalized = normalizePath(path);
        const value = this.files.get(normalized);
        if (typeof value === "string") return value;
        if (value instanceof Uint8Array) {
            return new TextDecoder().decode(value);
        }
        throw new Error(`File not found: ${normalized}`);
    }

    async readBytes(path: string): Promise<Uint8Array> {
        const normalized = normalizePath(path);
        const value = this.files.get(normalized);
        if (value instanceof Uint8Array) return value;
        if (typeof value === "string") return new TextEncoder().encode(value);
        throw new Error(`File not found: ${normalized}`);
    }

    async writeText(path: string, content: string): Promise<void> {
        const normalized = normalizePath(path);
        ensureParentDirectories(this.directories, normalized);
        this.files.set(normalized, content);
    }

    async atomicWriteText(path: string, content: string): Promise<void> {
        // In-memory writes are already a single map set — atomic by nature.
        await this.writeText(path, content);
    }

    async writeBytes(path: string, content: Uint8Array): Promise<void> {
        const normalized = normalizePath(path);
        ensureParentDirectories(this.directories, normalized);
        this.files.set(normalized, content);
    }

    async exists(path: string): Promise<boolean> {
        const normalized = normalizePath(path);
        return (
            this.files.has(normalized) || this.directories.has(normalized)
        );
    }

    async list(path: string): Promise<FileSystemEntry[]> {
        const normalized = normalizePath(path);
        const entries = new Map<string, FileSystemEntry>();

        for (const dir of this.directories) {
            if (dir === normalized) continue;
            if (dirname(dir) !== normalized) continue;
            entries.set(dir, {
                name: basename(dir),
                path: dir,
                kind: "directory",
            });
        }

        for (const filePath of this.files.keys()) {
            if (dirname(filePath) !== normalized) continue;
            entries.set(filePath, {
                name: basename(filePath),
                path: filePath,
                kind: "file",
            });
        }

        return [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
    }

    async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
        const normalized = normalizePath(path);
        if (opts?.recursive) {
            ensureParentDirectories(this.directories, normalized);
        }
        this.directories.add(normalized);
    }

    async remove(path: string, opts?: { recursive?: boolean }): Promise<void> {
        const normalized = normalizePath(path);
        if (this.files.delete(normalized)) return;
        if (!this.directories.has(normalized)) return;

        if (!opts?.recursive) {
            const hasChildren =
                [...this.files.keys()].some(
                    (candidate) => dirname(candidate) === normalized,
                ) ||
                [...this.directories].some(
                    (candidate) =>
                        candidate !== normalized &&
                        dirname(candidate) === normalized,
                );
            if (hasChildren) {
                throw new Error(`Directory not empty: ${normalized}`);
            }
        }

        for (const filePath of [...this.files.keys()]) {
            if (
                filePath === normalized ||
                filePath.startsWith(`${normalized}/`)
            ) {
                this.files.delete(filePath);
            }
        }
        for (const dir of [...this.directories]) {
            if (dir === normalized || dir.startsWith(`${normalized}/`)) {
                this.directories.delete(dir);
            }
        }
        this.directories.add("/");
    }

    async move(from: string, to: string): Promise<void> {
        const source = normalizePath(from);
        const destination = normalizePath(to);

        if (this.files.has(source)) {
            const content = this.files.get(source);
            this.files.delete(source);
            ensureParentDirectories(this.directories, destination);
            this.files.set(destination, content as string | Uint8Array);
            return;
        }

        if (!this.directories.has(source)) {
            throw new Error(`Path not found: ${source}`);
        }

        const dirs = [...this.directories].filter(
            (dir) => dir === source || dir.startsWith(`${source}/`),
        );
        const files = [...this.files.entries()].filter(
            ([filePath]) =>
                filePath === source || filePath.startsWith(`${source}/`),
        );

        for (const dir of dirs) this.directories.delete(dir);
        for (const [filePath] of files) this.files.delete(filePath);

        for (const dir of dirs) {
            const nextDir = dir.replace(source, destination);
            ensureParentDirectories(this.directories, nextDir);
            this.directories.add(nextDir);
        }
        for (const [filePath, content] of files) {
            const nextPath = filePath.replace(source, destination);
            ensureParentDirectories(this.directories, nextPath);
            this.files.set(nextPath, content);
        }
    }

    async createTempFile(prefix: string, suffix = ""): Promise<string> {
        this.tempCounter += 1;
        const path = normalizePath(
            `/temp/${prefix}-${this.tempCounter}${suffix}`,
        );
        await this.writeBytes(path, new Uint8Array());
        return path;
    }
}
