import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import type {
    IDirectoryProvider,
    ResourceMetadata,
} from "@/core/persistence/DirectoryProvider";
import { WebDirectoryHandle } from "@/web/io/WebDirectoryHandle.ts";
import { WebFileHandle } from "@/web/io/WebFileHandle.ts";

export class WebDirectoryProvider implements IDirectoryProvider {
    private constructor(private root: FileSystemDirectoryHandle) {}

    static async create(): Promise<WebDirectoryProvider> {
        const root = await navigator.storage.getDirectory(); // OPFS root
        return new WebDirectoryProvider(root);
    }

    async getAppPublicDirectory(
        appendedPath?: string,
    ): Promise<IDirectoryHandle> {
        const dir = await this.ensurePath(
            appendedPath ? ["userData", appendedPath] : ["userData"],
        );
        return dir;
    }

    async getAppPrivateDirectory(
        appendedPath?: string,
    ): Promise<IDirectoryHandle> {
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
        return new WebDirectoryHandle(
            dir,
            currentPath,
            this.getHandle.bind(this),
        );
    }

    async getHandle(path: string): Promise<IPathHandle> {
        const parts = path.split("/").filter(Boolean);
        const name = parts.pop();
        if (!name)
            return new WebDirectoryHandle(
                this.root,
                "/",
                this.getHandle.bind(this),
            );

        let dir: FileSystemDirectoryHandle = this.root;
        // let currentPath = "";
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: false });
            // currentPath += `/${part}`;
        }

        try {
            const fileHandle = await dir.getFileHandle(name);
            return new WebFileHandle(
                fileHandle,
                path,
                this.getHandle.bind(this),
            );
        } catch {
            const dirHandle = await dir.getDirectoryHandle(name);
            return new WebDirectoryHandle(
                dirHandle,
                path,
                this.getHandle.bind(this),
            );
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

    async newFileWriter(filePath: string) {
        const fileHandle = await this.getHandle(filePath);
        const file = fileHandle.asFileHandle();
        if (!file) throw new Error(`Path is not a file: ${filePath}`);
        return file.createWriter();
    }

    async newFileReader(filePath: string) {
        const fileHandle = await this.getHandle(filePath);
        const file = fileHandle.asFileHandle();
        if (!file) throw new Error(`Path is not a file: ${filePath}`);
        return file.getFile();
    }

    async createTempFile(
        prefix: string,
        suffix?: string,
    ): Promise<IFileHandle> {
        const dir = await this.ensurePath(["temp"]);
        const name = `${prefix}${suffix ?? ""}`;
        const handle = await dir.getFileHandle(name, { create: true });
        const tmpDir = await this.tempDirectory;
        const tmpFilePath = `${tmpDir.path}/${name}`;
        return new WebFileHandle(
            handle,
            tmpFilePath,
            this.getHandle.bind(this),
        );
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
    get logsDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["logs"]);
    }
    get cacheDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["cache"]);
    }
    get tempDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["temp"]);
    }
    get projectsDirectory(): Promise<IDirectoryHandle> {
        return this.ensureDirHandle(["projects"]);
    }

    // --- Helpers ---
    private async ensureDirHandle(parts: string[]): Promise<IDirectoryHandle> {
        const dir = await this.ensurePath(parts);
        return dir;
    }
    private async ensurePath(parts: string[]): Promise<IDirectoryHandle> {
        let dir: FileSystemDirectoryHandle = this.root;
        let path = "";
        for (const part of parts) {
            try {
                dir = await dir.getDirectoryHandle(part, {create: true});
            } catch (e) {
                console.log(e);
                console.log("Error trying to make a directory handle from parts:", parts)
            }
            path += `/${part}`;
        }
        return new WebDirectoryHandle(dir, path, this.getHandle.bind(this));
    }

    //   private async getFileByPath(
    //     path: string,
    //     opts?: {create?: boolean}
    //   ): Promise<IFileHandle> {
    //     const parts = path.split("/").filter(Boolean);
    //     const fileName = parts.pop();
    //     if (!fileName) throw new Error("Invalid file path");
    //     let dir = this.root;
    //     for (const part of parts)
    //       dir = await dir.getDirectoryHandle(part, {create: opts?.create});
    //     const file = await dir.getFileHandle(fileName, opts);
    //     return new WebFileHandle(file, path, this.getHandle.bind(this));
    //   }

    resolveHandle(path: string): Promise<IPathHandle> {
        return this.getHandle(path);
    }
}
