export interface IDirectoryProvider {
    // Directory access
    getUserDataDirectory(appendedPath?: string): Promise<FileSystemDirectoryHandle>;
    getAppDataDirectory(appendedPath?: string): Promise<FileSystemDirectoryHandle>;

    getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string
    ): Promise<FileSystemDirectoryHandle>;

    // File utilities
    newFileWriter(filePath: string): Promise<WritableStreamDefaultWriter<any>>;
    newFileReader(filePath: string): Promise<File>;

    createTempFile(prefix: string, suffix?: string): Promise<FileSystemFileHandle>;
    cleanTempDirectory(): Promise<void>;

    openInFileManager(path: string): Promise<void>;

    // Predefined directories
    readonly databaseDirectory: Promise<FileSystemDirectoryHandle>;
    readonly logsDirectory: Promise<FileSystemDirectoryHandle>;
    readonly cacheDirectory: Promise<FileSystemDirectoryHandle>;
    readonly tempDirectory: Promise<FileSystemDirectoryHandle>;
}

// Example domain models
export interface ResourceMetadata {
    creator: string;
    identifier: string;
    language: { slug: string };
    version: number;
    type?: string;
}