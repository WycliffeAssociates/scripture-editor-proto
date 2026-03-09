import { Buffer } from "buffer";

type FsErrorCode =
    | "ENOENT"
    | "EEXIST"
    | "ENOTDIR"
    | "EISDIR"
    | "EPERM"
    | "ENOTEMPTY";

type FsError = Error & { code: FsErrorCode };

type Entry =
    | { kind: "file"; handle: FileSystemFileHandle }
    | { kind: "directory"; handle: FileSystemDirectoryHandle };

type GitStats = {
    atime: Date;
    atimeMs: number;
    birthtime: Date;
    birthtimeMs: number;
    blksize: number;
    blocks: number;
    ctime: Date;
    ctimeMs: number;
    dev: number;
    gid: number;
    ino: number;
    mode: number;
    mtime: Date;
    mtimeMs: number;
    nlink: number;
    rdev: number;
    size: number;
    uid: number;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
};

function createFsError(
    code: FsErrorCode,
    path: string,
    detail?: string,
): FsError {
    const message = detail
        ? `${code}: ${detail}, '${path}'`
        : `${code}: No such file or directory, '${path}'`;
    const error = new Error(message) as FsError;
    error.code = code;
    return error;
}

function normalizePath(path: string): string {
    if (!path || path === ".") return "/";
    const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
    const parts = withLeadingSlash.split("/");
    const stack: string[] = [];
    for (const part of parts) {
        if (!part || part === ".") {
            continue;
        }
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

function toBytes(
    data: BufferSource | Blob | string | Uint8Array,
    encoding?: unknown,
): Uint8Array {
    if (typeof data === "string") {
        if (encoding && encoding !== "utf8" && encoding !== "utf-8") {
            throw new Error(`Unsupported encoding: ${String(encoding)}`);
        }
        return new TextEncoder().encode(data);
    }
    if (data instanceof Blob) {
        throw new Error("Blob writes are not supported by OpfsGitFs");
    }
    if (data instanceof Uint8Array) {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return new Uint8Array(0);
}

function isEncodingOption(options: unknown): options is string {
    return typeof options === "string";
}

function readEncoding(options: unknown): string | undefined {
    if (isEncodingOption(options)) {
        return options;
    }
    if (
        options &&
        typeof options === "object" &&
        "encoding" in options &&
        typeof options.encoding === "string"
    ) {
        return options.encoding;
    }
    return undefined;
}

function isRecursiveOption(options: unknown): boolean {
    return !!(
        options &&
        typeof options === "object" &&
        "recursive" in options &&
        options.recursive === true
    );
}

function createStats(args: {
    kind: "file" | "directory";
    size: number;
    mtime: Date;
}): GitStats {
    const mode = args.kind === "directory" ? 0o040755 : 0o100644;
    return {
        atime: args.mtime,
        atimeMs: args.mtime.getTime(),
        birthtime: args.mtime,
        birthtimeMs: args.mtime.getTime(),
        blksize: 4096,
        blocks: Math.max(1, Math.ceil(args.size / 512)),
        ctime: args.mtime,
        ctimeMs: args.mtime.getTime(),
        dev: 0,
        gid: 0,
        ino: 0,
        mode,
        mtime: args.mtime,
        mtimeMs: args.mtime.getTime(),
        nlink: 1,
        rdev: 0,
        size: args.size,
        uid: 0,
        isDirectory: () => args.kind === "directory",
        isFile: () => args.kind === "file",
        isSymbolicLink: () => false,
    };
}

/**
 * Minimal OPFS-backed fs client for isomorphic-git.
 *
 * This intentionally implements only the subset of Node fs that the app and
 * isomorphic-git rely on. It keeps browser file IO on native OPFS handles so
 * git and editor writes share one storage model.
 */
export class OpfsGitFs {
    readonly fs = {
        promises: {
            lstat: this.lstat.bind(this),
            mkdir: this.mkdir.bind(this),
            readFile: this.readFile.bind(this),
            readlink: this.readlink.bind(this),
            readdir: this.readdir.bind(this),
            rm: this.rm.bind(this),
            rmdir: this.rmdir.bind(this),
            stat: this.stat.bind(this),
            symlink: this.symlink.bind(this),
            unlink: this.unlink.bind(this),
            writeFile: this.writeFile.bind(this),
        },
    };

    private rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

    async ensureReady(): Promise<void> {
        const globalRef = globalThis as typeof globalThis & {
            Buffer?: typeof Buffer;
        };
        // isomorphic-git expects Buffer on the browser global when bundled.
        if (!globalRef.Buffer) {
            globalRef.Buffer = Buffer;
        }
        await this.getRoot();
    }

    private async getRoot(): Promise<FileSystemDirectoryHandle> {
        if (!this.rootPromise) {
            this.rootPromise = navigator.storage.getDirectory();
        }
        return this.rootPromise;
    }

    private async resolveParent(
        path: string,
        create: boolean,
    ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
        const normalized = normalizePath(path);
        const parts = splitPath(normalized);
        const name = parts.pop();
        if (!name) {
            throw createFsError("EPERM", normalized, "Operation not permitted");
        }

        let dir = await this.getRoot();
        for (const part of parts) {
            try {
                dir = await dir.getDirectoryHandle(part, { create });
            } catch (error) {
                if (!create) {
                    throw createFsError("ENOENT", normalized);
                }
                throw error;
            }
        }
        return { dir, name };
    }

    private async resolveEntry(path: string): Promise<Entry> {
        const normalized = normalizePath(path);
        if (normalized === "/") {
            return { kind: "directory", handle: await this.getRoot() };
        }

        const { dir, name } = await this.resolveParent(normalized, false);
        try {
            return {
                kind: "file",
                handle: await dir.getFileHandle(name, { create: false }),
            };
        } catch {}

        try {
            return {
                kind: "directory",
                handle: await dir.getDirectoryHandle(name, { create: false }),
            };
        } catch {}

        throw createFsError("ENOENT", normalized);
    }

    async stat(path: string): Promise<GitStats> {
        const entry = await this.resolveEntry(path);
        if (entry.kind === "directory") {
            return createStats({
                kind: "directory",
                size: 0,
                mtime: new Date(0),
            });
        }

        const file = await entry.handle.getFile();
        return createStats({
            kind: "file",
            size: file.size,
            mtime: new Date(file.lastModified),
        });
    }

    async lstat(path: string): Promise<GitStats> {
        return this.stat(path);
    }

    async readFile(
        path: string,
        options?: unknown,
    ): Promise<Uint8Array | string> {
        const entry = await this.resolveEntry(path);
        if (entry.kind !== "file") {
            throw createFsError(
                "EISDIR",
                normalizePath(path),
                "Illegal operation on a directory",
            );
        }

        const file = await entry.handle.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const encoding = readEncoding(options);
        if (!encoding) {
            return bytes;
        }
        if (encoding !== "utf8" && encoding !== "utf-8") {
            throw new Error(`Unsupported encoding: ${encoding}`);
        }
        return new TextDecoder().decode(bytes);
    }

    async writeFile(
        path: string,
        data: BufferSource | Blob | string | Uint8Array,
        options?: unknown,
    ): Promise<void> {
        const normalized = normalizePath(path);
        const { dir, name } = await this.resolveParent(normalized, true);
        const fileHandle = await dir.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable({
            keepExistingData: false,
        });
        await writable.write(
            toBytes(
                data,
                readEncoding(options),
            ) as unknown as FileSystemWriteChunkType,
        );
        await writable.close();
    }

    async readdir(path: string): Promise<string[]> {
        const entry = await this.resolveEntry(path);
        if (entry.kind !== "directory") {
            throw createFsError(
                "ENOTDIR",
                normalizePath(path),
                "Not a directory",
            );
        }

        const names: string[] = [];
        for await (const [name] of entry.handle.entries()) {
            names.push(name);
        }
        return names;
    }

    async readlink(path: string): Promise<never> {
        throw createFsError("ENOENT", normalizePath(path));
    }

    async symlink(): Promise<never> {
        throw new Error("Symlinks are not supported by OPFS");
    }

    async mkdir(path: string, options?: unknown): Promise<void> {
        const normalized = normalizePath(path);
        if (normalized === "/") {
            return;
        }

        const recursive = isRecursiveOption(options);
        const parts = splitPath(normalized);
        const leaf = parts.pop();
        if (!leaf) {
            return;
        }

        if (recursive) {
            let dir = await this.getRoot();
            for (const part of [...parts, leaf]) {
                dir = await dir.getDirectoryHandle(part, { create: true });
            }
            return;
        }

        let parent = await this.getRoot();
        for (const part of parts) {
            try {
                parent = await parent.getDirectoryHandle(part, {
                    create: false,
                });
            } catch {
                throw createFsError("ENOENT", normalized);
            }
        }

        try {
            await parent.getDirectoryHandle(leaf, { create: false });
            throw createFsError("EEXIST", normalized, "File exists");
        } catch (error) {
            if ((error as Partial<FsError>).code === "EEXIST") {
                throw error;
            }
        }

        await parent.getDirectoryHandle(leaf, { create: true });
    }

    async unlink(path: string): Promise<void> {
        const normalized = normalizePath(path);
        const entry = await this.resolveEntry(normalized);
        if (entry.kind !== "file") {
            throw createFsError(
                "EISDIR",
                normalized,
                "Illegal operation on a directory",
            );
        }

        const { dir, name } = await this.resolveParent(normalized, false);
        await dir.removeEntry(name);
    }

    async rmdir(path: string, options?: unknown): Promise<void> {
        const normalized = normalizePath(path);
        if (normalized === "/") {
            throw createFsError("EPERM", normalized, "Operation not permitted");
        }
        const entry = await this.resolveEntry(normalized);
        if (entry.kind !== "directory") {
            throw createFsError("ENOTDIR", normalized, "Not a directory");
        }

        const { dir, name } = await this.resolveParent(normalized, false);
        try {
            await dir.removeEntry(name, {
                recursive: isRecursiveOption(options),
            });
        } catch {
            throw createFsError("ENOTEMPTY", normalized, "Directory not empty");
        }
    }

    async rm(path: string, options?: unknown): Promise<void> {
        const normalized = normalizePath(path);
        if (normalized === "/") {
            throw createFsError("EPERM", normalized, "Operation not permitted");
        }
        const entry = await this.resolveEntry(normalized);
        const { dir, name } = await this.resolveParent(normalized, false);
        await dir.removeEntry(name, {
            recursive: entry.kind === "directory" || isRecursiveOption(options),
        });
    }
}
