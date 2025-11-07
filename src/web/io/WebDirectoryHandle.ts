import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import { WebFileHandle } from "@/web/io/WebFileHandle.ts";

type ResolveHandle = (path: string) => Promise<IPathHandle>;

// Utility function to join path segments in a web-compatible way
function webPathJoin(...parts: string[]): string {
    const normalizedParts = parts.map(part => part.split("/")).flat();
    const stack: string[] = [];

    for (const part of normalizedParts) {
        if (!part || part === ".") {
            continue;
        } else if (part === "..") {
            if (stack.length > 0 && stack[stack.length - 1] !== "..") {
                stack.pop();
            } else {
                stack.push(part);
            }
        } else {
            stack.push(part);
        }
    }
    // Ensure absolute path if the original first part was absolute
    const prefix = parts[0].startsWith("/") ? "/" : "";
    return prefix + stack.join("/");
}

// Utility function to resolve a path, similar to Node.js path.resolve
function webPathResolve(...paths: string[]): string {
    let resolvedPath = "";
    let absolute = false;

    for (let i = paths.length - 1; i >= -1; i--) {
        let path = (i >= 0) ? paths[i] : "/";

        if (path.length === 0) {
            continue;
        }

        resolvedPath = path + "/" + resolvedPath;
        absolute = path.charAt(0) === "/";

        if (absolute) {
            break;
        }
    }

    resolvedPath = resolvedPath.split("/\\/").join("/");
    const resolvedParts: string[] = [];

    resolvedPath.split("/").forEach(part => {
        if (part === ".." && resolvedParts.length > 0 && resolvedParts[resolvedParts.length - 1] !== "..") {
            resolvedParts.pop();
        } else if (part !== "." && part !== "") {
            resolvedParts.push(part);
        }
    });

    resolvedPath = resolvedParts.join("/");
    return (absolute ? "/" : "") + resolvedPath;
}

// Utility function to get the basename of a path
function webPathBasename(path: string): string {
    const parts = path.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : "";
}

export class WebDirectoryHandle implements IDirectoryHandle {
    kind: "directory" = "directory";
    name: string;
    readonly path: string;
    readonly handle: FileSystemDirectoryHandle;
    readonly isDir: boolean = true;
    readonly isFile: boolean = false;

    private readonly resolveHandle: ResolveHandle;

    constructor(
        handle: FileSystemDirectoryHandle,
        path: string,
        resolveHandle: ResolveHandle,
    ) {
        this.handle = handle;
        this.path = path;
        this.name = handle.name; // Delegate name from the native handle
        this.resolveHandle = resolveHandle;
    }

    async getDirectoryHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<IDirectoryHandle> {
        const targetAbsolutePath = webPathResolve(this.path, name);
        const targetBasename = webPathBasename(targetAbsolutePath);
        const targetParentAbsolutePath = webPathResolve(targetAbsolutePath, '..');

        const nativeParentHandle = await this._getOrCreateNativeDirectoryHandle(targetParentAbsolutePath, opts?.create || false);

        const childNativeHandle = await nativeParentHandle.getDirectoryHandle(targetBasename, opts);

        return new WebDirectoryHandle(childNativeHandle, targetAbsolutePath, this.resolveHandle);
    }

    async getFileHandle(
        name: string,
        opts?: { create?: boolean },
    ): Promise<IFileHandle> {
        const targetAbsolutePath = webPathResolve(this.path, name);
        const targetBasename = webPathBasename(targetAbsolutePath);
        const targetParentAbsolutePath = webPathResolve(targetAbsolutePath, '..');

        const nativeParentHandle = await this._getOrCreateNativeDirectoryHandle(targetParentAbsolutePath, opts?.create || false);

        const fileNativeHandle = await nativeParentHandle.getFileHandle(targetBasename, opts);

        return new WebFileHandle(fileNativeHandle, targetAbsolutePath, this.resolveHandle);
    }

    async removeEntry(name: string, opts?: { recursive?: boolean }) {
        return this.handle.removeEntry(name, opts);
    }

    async *keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        for await (const [name] of this.entries()) yield name;
    }

    async *values(): FileSystemDirectoryHandleAsyncIterator<IPathHandle> {
        for await (const [, handle] of this.entries()) yield handle;
    }

    async *entries(): FileSystemDirectoryHandleAsyncIterator<
        [string, IPathHandle]
    > {
        for await (const [name, handle] of this.handle.entries()) {
            const entryPath = webPathJoin(this.path, name);
            if (handle.kind === "directory") {
                yield [
                    name,
                    new WebDirectoryHandle(
                        handle as FileSystemDirectoryHandle,
                        entryPath,
                        this.resolveHandle,
                    ),
                ];
            } else {
                yield [
                    name,
                    new WebFileHandle(
                        handle as FileSystemFileHandle,
                        entryPath,
                        this.resolveHandle,
                    ),
                ];
            }
        }
    }

    async getParent(): Promise<IDirectoryHandle> {
        const parentPath = webPathJoin(this.path, "..");
        if (parentPath === "") {
            return (await this.resolveHandle("/")) as IDirectoryHandle;
        }
        return (await this.resolveHandle(parentPath)) as IDirectoryHandle;
    }

    asFileHandle(): IFileHandle | null {
        return null;
    }

    asDirectoryHandle(): IDirectoryHandle | null {
        return this;
    }

    async getAbsolutePath(): Promise<string> {
        return this.path;
    }

    // Implement FileSystemHandle properties and methods by delegating to this.handle
    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return this.handle.isSameEntry(other);
    }

    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
        return this.handle.resolve(possibleDescendant);
    }

    [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<
        [string, IPathHandle]
    > {
        return this.entries();
    }

    [Symbol.asyncDispose](): Promise<void> {
        return Promise.resolve(void 0);
    }

    async containsFile(name: string): Promise<boolean> {
        for await (const [entryName, handle] of this.entries()) {
            if (entryName === name && handle.kind === "file") {
                return true;
            }
        }
        return false;
    }

    async containsDir(name: string): Promise<boolean> {
        for await (const [entryName, handle] of this.entries()) {
            if (entryName === name && handle.kind === "directory") {
                return true;
            }
        }
        return false;
    }

    /**
     * @private
     * Helper to get or create a native FileSystemDirectoryHandle by absolute path.
     * It traverses the native handle hierarchy from the root.
     */
    private async _getOrCreateNativeDirectoryHandle(
        absolutePath: string,
        createIfNotFound: boolean,
    ): Promise<FileSystemDirectoryHandle> {
        const parts = absolutePath.split("/").filter(Boolean);
        let currentNativeHandle: FileSystemDirectoryHandle = this.handle;

        // Special case for root path when starting from a non-root handle:
        // We need to get the actual root native handle first if the target path is absolute
        // and our current `this.handle` is not the root.
        if (absolutePath.startsWith("/") && this.path !== "/") {
            const rootIHandle = await this.resolveHandle("/");
            currentNativeHandle = (rootIHandle as WebDirectoryHandle).handle;
        }

        for (const part of parts) {
            try {
                currentNativeHandle = await currentNativeHandle.getDirectoryHandle(part, { create: createIfNotFound });
            } catch (e) {
                if (createIfNotFound) {
                    // If we're trying to create, and it failed, re-throw.
                    throw e;
                } else {
                    // If not creating, and it failed (e.g., dir not found), re-throw.
                    throw e;
                }
            }
        }
        return currentNativeHandle;
    }
}
