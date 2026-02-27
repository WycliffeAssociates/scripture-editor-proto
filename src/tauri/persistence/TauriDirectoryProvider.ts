import {
    appDataDir,
    appLocalDataDir,
    homeDir,
    join,
} from "@tauri-apps/api/path";
import { mkdir, open, remove } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import type {
    IDirectoryProvider,
    ResourceMetadata,
} from "@/core/persistence/DirectoryProvider.ts";
import { TauriDirectoryHandle } from "@/tauri/io/TauriDirectoryHandle.ts";
import { TauriFileHandle } from "@/tauri/io/TauriFileHandle.ts";

export class TauriDirectoryProvider implements IDirectoryProvider {
    private static async getUserHome(osName: string): Promise<string> {
        if (["ios", "android", "macos"].includes(osName)) {
            return await appDataDir();
        } else {
            return await homeDir();
        }
    }

    private constructor(
        private appName: string,
        private userHome: string,
    ) {}

    static async create(appName: string): Promise<TauriDirectoryProvider> {
        const osName = platform();
        // biome rule, this in a static context can be misleading. the static context is the class, not the instance
        const userHome = await TauriDirectoryProvider.getUserHome(osName);
        return new TauriDirectoryProvider(appName, userHome);
    }

    async getHomeDirectory(): Promise<IDirectoryHandle> {
        return new TauriDirectoryHandle(
            this.userHome,
            this.getHandle.bind(this),
        );
    }

    async getAppPublicDirectory(
        appendedPath?: string,
    ): Promise<IDirectoryHandle> {
        let root = this.userHome;
        const osName = platform();
        if (!["ios", "android"].includes(osName)) {
            root = await join(root, this.appName);
        }

        const path = appendedPath ? await join(root, appendedPath) : root;
        await mkdir(path, { recursive: true });
        return new TauriDirectoryHandle(path, this.getHandle.bind(this));
    }

    async getAppPrivateDirectory(
        appendedPath?: string,
    ): Promise<IDirectoryHandle> {
        const path = appendedPath
            ? await join(await appLocalDataDir(), appendedPath)
            : await appLocalDataDir();
        await mkdir(path, { recursive: true });
        return new TauriDirectoryHandle(path, this.getHandle.bind(this));
    }

    async getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string,
    ): Promise<IDirectoryHandle> {
        const targetCreator = target?.creator ?? ".";
        const baseDir = await this.getAppPublicDirectory();
        const path = await join(
            baseDir.path,
            targetCreator,
            source.creator,
            `${source.language.slug}_${source.identifier}`,
            `v${target?.version ?? "-none"}`,
            target?.language?.slug ?? "no_language",
            bookSlug,
        );
        await mkdir(path, { recursive: true });
        return new TauriDirectoryHandle(path, this.getHandle.bind(this));
    }

    async getDirectoryHandle(
        path: string,
        opts?: { create?: boolean },
    ): Promise<IDirectoryHandle> {
        if (opts?.create) await mkdir(path, { recursive: true });
        return new TauriDirectoryHandle(path, this.getHandle.bind(this));
    }

    async getHandle(path: string): Promise<IPathHandle> {
        const fileHandle = new TauriFileHandle(path, this.getHandle.bind(this));
        try {
            await fileHandle.getFile();
            return fileHandle;
        } catch (e) {
            console.error(e);
            const dirHandle = new TauriDirectoryHandle(
                path,
                this.getHandle.bind(this),
            );
            try {
                await dirHandle.entries().next(); // Attempt to read directory to check existence
                return dirHandle;
            } catch (e) {
                console.error(e);
                throw new Error(
                    `Path does not exist or is not accessible: ${path}`,
                );
            }
        }
    }

    // ---------------- File utilities ----------------

    async newFileWriter(
        filePath: string,
        // biome-ignore lint/suspicious/noExplicitAny: <mimics web api>
    ): Promise<WritableStreamDefaultWriter<any>> {
        const fileHandle = await this.getHandle(filePath);
        const file = fileHandle.asFileHandle();
        if (!file) throw new Error(`Path is not a file: ${filePath}`);
        return (await file.createWritable()).getWriter();
    }

    async newFileReader(filePath: string): Promise<File> {
        const fileHandle = await this.getHandle(filePath);
        const file = fileHandle.asFileHandle();
        if (!file) throw new Error(`Path is not a file: ${filePath}`);
        return file.getFile();
    }

    async createTempFile(
        prefix: string,
        suffix?: string,
    ): Promise<IFileHandle> {
        const path = await join(
            this.userHome,
            this.appName,
            "temp",
            `${prefix}${suffix ?? ""}`,
        );
        await mkdir(await join(this.userHome, this.appName, "temp"), {
            recursive: true,
        });
        return new TauriFileHandle(path, this.getHandle.bind(this));
    }

    async cleanTempDirectory(): Promise<void> {
        const tempDir = await this.getAppPrivateDirectory("temp");
        for await (const [name] of tempDir.entries()) {
            await tempDir.removeEntry(name, { recursive: true });
        }
    }
    async removeDirectory(
        path: string,
        opts: {
            recursive?: boolean;
        },
    ): Promise<void> {
        await remove(path, opts);
    }
    async openInFileManager(path: string): Promise<void> {
        await open(path);
    }

    get databaseDirectory(): Promise<IDirectoryHandle> {
        return this.getAppPrivateDirectory("database");
    }

    get projectsDirectory(): Promise<IDirectoryHandle> {
        return this.getAppPublicDirectory("projects");
    }

    get logsDirectory(): Promise<IDirectoryHandle> {
        return this.getAppPrivateDirectory("logs");
    }

    get cacheDirectory(): Promise<IDirectoryHandle> {
        return this.getAppPrivateDirectory("cache");
    }

    get tempDirectory(): Promise<IDirectoryHandle> {
        return this.getAppPrivateDirectory("temp");
    }

    resolveHandle(path: string): Promise<IPathHandle> {
        return this.getHandle(path);
    }
}
