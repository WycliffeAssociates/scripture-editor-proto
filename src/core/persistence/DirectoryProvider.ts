import {IPathHandle} from "@/core/io/IPathHandle.ts";
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";

export interface IDirectoryProvider {
    // Directory access
    getUserDataDirectory(appendedPath?: string): Promise<IDirectoryHandle>;
    getAppDataDirectory(appendedPath?: string): Promise<IDirectoryHandle>;

    getDirectoryHandle(path: string): Promise<IDirectoryHandle>;

    getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string
    ): Promise<IDirectoryHandle>;

    // File utilities
    newFileWriter(filePath: string): Promise<WritableStreamDefaultWriter<any>>;
    newFileReader(filePath: string): Promise<File>;

    createTempFile(prefix: string, suffix?: string): Promise<IFileHandle>;
    cleanTempDirectory(): Promise<void>;

    openInFileManager(path: string): Promise<void>;

    // Predefined directories
    readonly databaseDirectory: Promise<IDirectoryHandle>;
    readonly logsDirectory: Promise<IDirectoryHandle>;
    readonly cacheDirectory: Promise<IDirectoryHandle>;
    readonly tempDirectory: Promise<IDirectoryHandle>;

    getHandle(path: string): Promise<IPathHandle>;
    resolveHandle(path: string): Promise<IPathHandle>;
}

// Example domain models
export interface ResourceMetadata {
    creator: string;
    identifier: string;
    language: { slug: string };
    version: number;
    type?: string;
}