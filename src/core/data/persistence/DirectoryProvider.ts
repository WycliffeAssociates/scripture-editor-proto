// IDirectoryProvider.ts

export interface IDirectoryProvider {
    // Directory access
    getUserDataDirectory(
        appendedPath?: string,
    ): Promise<FileSystemDirectoryHandle>;
    getAppDataDirectory(
        appendedPath?: string,
    ): Promise<FileSystemDirectoryHandle>;

    getDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle>;

    getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string,
    ): Promise<FileSystemDirectoryHandle>;

    getProjectSourceDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string,
    ): Promise<FileSystemDirectoryHandle>;

    getSourceContainerDirectory(
        metadata: ResourceMetadata,
    ): Promise<FileSystemDirectoryHandle>;
    getDerivedContainerDirectory(
        metadata: ResourceMetadata,
        source: ResourceMetadata,
    ): Promise<FileSystemDirectoryHandle>;

  // File utilities
  newFileWriter(filePath: string): Promise<WritableStreamDefaultWriter>;
  newFileReader(filePath: string): Promise<File>;

    createTempFile(
        prefix: string,
        suffix?: string,
    ): Promise<FileSystemFileHandle>;
    cleanTempDirectory(): Promise<void>;

    openInFileManager(path: string): Promise<void>;

    // Predefined directories
    readonly databaseDirectory: Promise<FileSystemDirectoryHandle>;
    readonly resourceContainerDirectory: Promise<FileSystemDirectoryHandle>;
    readonly internalSourceRCDirectory: Promise<FileSystemDirectoryHandle>;
    readonly userProfileImageDirectory: Promise<FileSystemDirectoryHandle>;
    readonly versificationDirectory: Promise<FileSystemDirectoryHandle>;
    readonly logsDirectory: Promise<FileSystemDirectoryHandle>;
    readonly cacheDirectory: Promise<FileSystemDirectoryHandle>;
    readonly tempDirectory: Promise<FileSystemDirectoryHandle>;
}

export interface WebFileHandleExtended extends FileSystemFileHandle {
    path: string;
    write(
        data: FileSystemWriteChunkType,
        options?: { keepExistingData?: boolean },
    ): Promise<void>;
}

// Example domain models
export interface ResourceMetadata {
    creator: string;
    identifier: string;
    language: { slug: string };
    version: number;
    type?: string;
}
