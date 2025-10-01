import type { IDirectoryProvider, ResourceMetadata } from "@core/persistence/DirectoryProvider.ts";
import { join } from "@tauri-apps/api/path";
import { mkdir, open } from "@tauri-apps/plugin-fs";
import { TauriDirectoryHandle, TauriFileHandle } from "./TauriHandles";

export class TauriDirectoryProvider implements IDirectoryProvider {
    constructor(private appName: string, private userHome: string = "/user/home") {}

    async getUserDataDirectory(appendedPath?: string): Promise<TauriDirectoryHandle> {
        const path = appendedPath ? join(this.userHome, this.appName, appendedPath) : join(this.userHome, this.appName);
        await mkdir(await path, { recursive: true });
        return new TauriDirectoryHandle(await path);
    }

    async getAppDataDirectory(appendedPath?: string): Promise<TauriDirectoryHandle> {
        const path = appendedPath ? join(this.userHome, "." + this.appName, appendedPath) : join(this.userHome, "." + this.appName);
        await mkdir(await path, { recursive: true });
        return new TauriDirectoryHandle(await path);
    }

    async getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string
    ): Promise<TauriDirectoryHandle> {
        const targetCreator = target?.creator ?? ".";
        const path = join(
            this.userHome,
            this.appName,
            targetCreator,
            source.creator,
            `${source.language.slug}_${source.identifier}`,
            `v${target?.version ?? "-none"}`,
            target?.language?.slug ?? "no_language",
            bookSlug
        );
        await mkdir(await path, { recursive: true });
        return new TauriDirectoryHandle(await path);
    }

    async getProjectAudioDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string
    ): Promise<TauriDirectoryHandle> {
        const base = await this.getProjectDirectory(source, target, bookSlug);
        const path = join(base.path, ".apps", "orature", "takes");
        await mkdir(await path, { recursive: true });
        return new TauriDirectoryHandle(await path);
    }

    async getProjectSourceDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string
    ): Promise<TauriDirectoryHandle> {
        const base = await this.getProjectDirectory(source, target, bookSlug);
        const path = join(base.path, ".apps", "orature", "source");
        await mkdir(await path, { recursive: true });
        return new TauriDirectoryHandle(await path);
    }

    async getProjectSourceAudioDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string
    ): Promise<TauriDirectoryHandle> {
        const base = await this.getProjectSourceDirectory(source, target, bookSlug);
        const path = join(base.path, "audio");
        await mkdir(await path, { recursive: true });
        return new TauriDirectoryHandle(await path);
    }

    async getSourceContainerDirectory(metadata: ResourceMetadata): Promise<TauriDirectoryHandle> {
        const path = join(
            this.userHome,
            this.appName,
            "src",
            metadata.creator,
            `${metadata.language.slug}_${metadata.identifier}`,
            `v${metadata.version}`
        );
        await mkdir(await path, { recursive: true });
        return new TauriDirectoryHandle(await path);
    }

    async getDerivedContainerDirectory(metadata: ResourceMetadata, source: ResourceMetadata): Promise<TauriDirectoryHandle> {
        const path = join(
            this.userHome,
            this.appName,
            "rc",
            "der",
            metadata.creator,
            source.creator,
            `${source.language.slug}_${source.identifier}`,
            `v${metadata.version}`,
            metadata.language.slug
        );
        await mkdir(await path, { recursive: true });
        return new TauriDirectoryHandle(await path);
    }

    // ---------------- File utilities ----------------

    async newFileWriter(filePath: string): Promise<WritableStreamDefaultWriter<any>> {
        const file = new TauriFileHandle(filePath);
        const stream = await file.createWritable();
        return stream.getWriter?.() as WritableStreamDefaultWriter<any>;
    }

    async newFileReader(filePath: string): Promise<File> {
        const file = new TauriFileHandle(filePath);
        return file.getFile();
    }

    async createTempFile(prefix: string, suffix?: string): Promise<TauriFileHandle> {
        const path = join(this.userHome, this.appName, "temp", `${prefix}${suffix ?? ""}`);
        await mkdir(await join(this.userHome, this.appName, "temp"), { recursive: true });
        return new TauriFileHandle(await path);
    }

    async cleanTempDirectory(): Promise<void> {
        const tempDir = await this.getAppDataDirectory("temp");
        for await (const [name] of tempDir.entries()) {
            await tempDir.removeEntry(name, { recursive: true });
        }
    }

    async openInFileManager(path: string): Promise<void> {
        open(path);
    }

    // ---------------- Predefined directories ----------------

    get databaseDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("database");
    }

    get resourceContainerDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("rc");
    }

    get internalSourceRCDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("rc/src");
    }

    get userProfileImageDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("users/images");
    }

    get userProfileAudioDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("users/audio");
    }

    get audioPluginDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("plugins");
    }

    get versificationDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("versification");
    }

    get logsDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("logs");
    }

    get cacheDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("cache");
    }

    get tempDirectory(): Promise<TauriDirectoryHandle> {
        return this.getAppDataDirectory("temp");
    }
}
