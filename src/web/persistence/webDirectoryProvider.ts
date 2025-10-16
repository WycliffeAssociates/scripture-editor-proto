import type {
    IDirectoryProvider,
    ResourceMetadata,
} from "@/core/persistence/DirectoryProvider";
import { WebDirectoryHandleWrapper } from "../io/WebDirectoryHandle.ts";
import {IPathHandle} from "@/core/io/IPathHandle.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";
import {WebFileHandleWrapper} from "@/web/io/WebFileHandleWrapper.ts";
// import {WebFileHandleExtended} from "@/web/io/WebFileHandleExtended.ts"; // Removed as it's now part of core interfaces

export class WebDirectoryProvider implements IDirectoryProvider {
    private constructor(private root: FileSystemDirectoryHandle) {}

    static async create(): Promise<WebDirectoryProvider> {
        const root = await navigator.storage.getDirectory(); // OPFS root
        return new WebDirectoryProvider(root);
    }

    async getUserDataDirectory(appendedPath?: string): Promise<IDirectoryHandle> {
        const dir = await this.ensurePath(
            appendedPath ? ["userData", appendedPath] : ["userData"],
        );
        return dir;
    }

    async getAppDataDirectory(appendedPath?: string): Promise<IDirectoryHandle> {
        const dir = await this.ensurePath(
            appendedPath ? ["appData", appendedPath] : ["appData"],
        );
        return dir;
    }

    async getDirectoryHandle(path: string): Promise<IDirectoryHandle> {
        const parts = path.split("/").filter(Boolean);
        let dir: FileSystemDirectoryHandle = this.root;
        let currentPath = "";
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: true });
            currentPath += `/${part}`;
        }
        return new WebDirectoryHandleWrapper(dir, currentPath);
    }

    async getHandle(path: string): Promise<IPathHandle> {
        const parts = path.split("/").filter(Boolean);
        const name = parts.pop();
        if (!name) return new WebDirectoryHandleWrapper(this.root, "/");

        let dir: FileSystemDirectoryHandle = this.root;
        let currentPath = "";
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: false });
            currentPath += `/${part}`;
        }

        try {
            const fileHandle = await dir.getFileHandle(name);
            return new WebFileHandleWrapper(fileHandle, path);
        } catch {
            const dirHandle = await dir.getDirectoryHandle(name);
            return new WebDirectoryHandleWrapper(dirHandle, path);
        }
    }

    async getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string,
    ): Promise<IDirectoryHandle> {
        const parts = [
            "projects",
            source.creator,
            `${source.language.slug}_${source.identifier}`,
            `v${target?.version ?? "-none"}`,
            target?.language?.slug ?? "no_language",
            bookSlug,
        ];
        const dir = await this.ensurePath(parts);
        return dir;
    }

    async getProjectSourceDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string,
    ): Promise<IDirectoryHandle> {
        return this.getProjectDirectory(source, target, bookSlug);
    }

    async getSourceContainerDirectory(metadata: ResourceMetadata): Promise<IDirectoryHandle> {
        const dir = await this.ensurePath(["containers", metadata.creator]);
        return dir;
    }

    async getDerivedContainerDirectory(
        metadata: ResourceMetadata,
        source: ResourceMetadata,
    ): Promise<IDirectoryHandle> {
        const dir = await this.ensurePath([ 
            "derived",
            metadata.creator,
            source.identifier,
        ]);
        return dir;
    }

    async newFileWriter(filePath: string) {
        const fileHandle = await this.getHandle(filePath);
        const file = fileHandle.asFileHandle();
        if (!file) throw new Error("Path is not a file: " + filePath);
        const stream = await file.createWritable();
        return stream.getWriter();
    }

    async newFileReader(filePath: string) {
        const fileHandle = await this.getHandle(filePath);
        const file = fileHandle.asFileHandle();
        if (!file) throw new Error("Path is not a file: " + filePath);
        return file.getFile();
    }

    async createTempFile(prefix: string, suffix?: string): Promise<IFileHandle> {
        const dir = await this.ensurePath(["temp"]);
        const name = `${prefix}${suffix ?? ""}`;
        const handle = await dir.getFileHandle(name, { create: true });
        const tmpDir = await this.tempDirectory;
        const tmpFilePath = `${tmpDir.path}/${name}`;
        return new WebFileHandleWrapper(handle, tmpFilePath);
    }

    async cleanTempDirectory(): Promise<void> {
        const tempDir = await this.ensurePath(["temp"]);
        for await (const [name] of tempDir.entries()) {
            await tempDir.removeEntry(name, { recursive: true });
        }
    }

    async openInFileManager(_path: string): Promise<void> {
        alert("File system browsing is not supported in browser mode.");
    }

    // --- Predefined directories (lazy) ---
    get databaseDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["database"]);
    }
    get resourceContainerDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["rc"]);
    }
    get internalSourceRCDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["rc", "src"]);
    }
    get userProfileImageDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["users", "images"]);
    }
    get versificationDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["versification"]);
    }
    get logsDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["logs"]);
    }
    get cacheDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["cache"]);
    }
    get tempDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["temp"]);
    }

    // --- Helpers ---
    private async ensureDirHandle(parts: string[],): Promise<IDirectoryHandle> {
        const dir = await this.ensurePath(parts);
        return dir;
    }
    private async ensurePath(parts: string[],): Promise<IDirectoryHandle> {
        let dir: FileSystemDirectoryHandle = this.root;
        let path = "";
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: true });
            path += `/${part}`;
        }
        return new WebDirectoryHandleWrapper(dir, path);
    }

    private async getFileByPath(
        path: string,
        opts?: { create?: boolean },
    ): Promise<IFileHandle> {
        const parts = path.split("/").filter(Boolean);
        const fileName = parts.pop();
        if (!fileName) throw new Error("Invalid file path");
        let dir = this.root;
        for (const part of parts)
            dir = await dir.getDirectoryHandle(part, { create: opts?.create });
        const file = await dir.getFileHandle(fileName, opts);
        return new WebFileHandleWrapper(file, path);
    }
}
