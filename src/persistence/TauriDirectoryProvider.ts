import type { IDirectoryProvider, ResourceMetadata } from "../../src-core/persistence/DirectoryProvider.ts";
import {join, homeDir, appDataDir, appLocalDataDir} from "@tauri-apps/api/path";
import { mkdir, open } from "@tauri-apps/plugin-fs";
import { platform } from '@tauri-apps/plugin-os';
import {TauriDirectoryHandle} from "@/persistence/handlers/TauriDirectoryHandle.ts";
import {TauriFileHandle} from "@/persistence/handlers/TauriFileHandle.ts";

// @ts-ignore
export class TauriDirectoryProvider implements IDirectoryProvider {

    private static async getUserHome(osName: string): Promise<string> {
        if (["ios", "android", "macos"].includes(osName)) {
            return await appDataDir();
        } else {
            return await homeDir();
        }
    }

    private constructor(private appName: string, private userHome: string) {
    }

    static async create(appName: string): Promise<TauriDirectoryProvider> {
        const osName = platform();
        console.log(`Directory Provider for: ${osName}`);
        const userHome = await this.getUserHome(osName);
        console.log(`User home: ${userHome}`);
        return new TauriDirectoryProvider(appName, userHome);
    }

    async getHomeDirectory(): Promise<TauriDirectoryHandle> {
        console.log(`Home directory: ${this.userHome}`);
        return new TauriDirectoryHandle(this.userHome);
    }

    async getUserDataDirectory(appendedPath?: string): Promise<TauriDirectoryHandle> {
        let root = this.userHome;
        const osName = platform()
        if (!["ios", "android"].includes(osName)) {
            root = await join(root, this.appName);
        }

        const path = appendedPath ? await join(root, appendedPath) : root;
        await mkdir(await path, { recursive: true });
        console.log(`User data directory: ${path}`);
        return new TauriDirectoryHandle(path);
    }

    async getAppDataDirectory(appendedPath?: string): Promise<TauriDirectoryHandle> {
        const path = appendedPath ? await join(await appLocalDataDir(), appendedPath) : await appLocalDataDir();
        await mkdir(await path, { recursive: true });
        console.log(`App data directory: ${path}`);
        return new TauriDirectoryHandle(await path);
    }

    async getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string
    ): Promise<TauriDirectoryHandle> {
        const targetCreator = target?.creator ?? ".";
        const baseDir = await this.getUserDataDirectory();
        const path = join(
            baseDir.path,
            this.appName,
            targetCreator,
            source.creator,
            `${source.language.slug}_${source.identifier}`,
            `v${target?.version ?? "-none"}`,
            target?.language?.slug ?? "no_language",
            bookSlug
        );
        await mkdir(await path, { recursive: true });
        console.log(`Project directory: ${path}`);
        return new TauriDirectoryHandle(await path);
    }

    // ---------------- File utilities ----------------

    async newFileWriter(filePath: string): Promise<WritableStreamDefaultWriter<any>> {
        console.log("creating file writer for: " + filePath)
        const file = new TauriFileHandle(filePath);
        const stream = await file.createWritable();
        console.log("file writer created: " + filePath)
        debugger
        const writer = stream.getWriter();
        console.log("file writer ready: " + filePath)
        return writer;
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
        await open(path);
    }

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
