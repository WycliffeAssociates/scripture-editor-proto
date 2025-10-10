import type {
    IDirectoryProvider,
    ResourceMetadata,
    WebFileHandleExtended,
} from "@/core/data/persistence/DirectoryProvider";
import { WebDirectoryHandleWrapper } from "./webDirectoryHandle";

export class WebDirectoryProvider implements IDirectoryProvider {
    private constructor(private root: FileSystemDirectoryHandle) {}

    static async create(): Promise<WebDirectoryProvider> {
        const root = await navigator.storage.getDirectory(); // OPFS root
        return new WebDirectoryProvider(root);
    }

    async getUserDataDirectory(appendedPath?: string) {
        const dir = await this.ensurePath(
            appendedPath ? ["userData", appendedPath] : ["userData"],
        );
        return dir;
    }

    async getAppDataDirectory(appendedPath?: string) {
        const dir = await this.ensurePath(
            appendedPath ? ["appData", appendedPath] : ["appData"],
        );
        return dir;
    }

    async getProjectDirectory(
        source: ResourceMetadata,
        target: ResourceMetadata | null,
        bookSlug: string,
    ) {
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
    ) {
        return this.getProjectDirectory(source, target, bookSlug);
    }

    async getSourceContainerDirectory(metadata: ResourceMetadata) {
        const dir = await this.ensurePath(["containers", metadata.creator]);
        return dir;
    }

    async getDerivedContainerDirectory(
        metadata: ResourceMetadata,
        source: ResourceMetadata,
    ) {
        const dir = await this.ensurePath([
            "derived",
            metadata.creator,
            source.identifier,
        ]);
        return dir;
    }

    async newFileWriter(filePath: string) {
        const fileHandle = await this.getFileByPath(filePath, { create: true });
        const stream = await fileHandle.createWritable();
        return stream.getWriter();
    }

    async newFileReader(filePath: string) {
        const fileHandle = await this.getFileByPath(filePath);
        return fileHandle.getFile();
    }

    async createTempFile(prefix: string, suffix?: string) {
        const dir = await this.ensurePath(["temp"]);
        const name = `${prefix}${suffix ?? ""}`;
        const handle = await dir.getFileHandle(name, { create: true });
        const tmpDir = await this.tempDirectory;
        const tmpFilePath = `${tmpDir}/${name}`;
        return new WebFileHandle(handle, tmpFilePath);
    }

    async cleanTempDirectory() {
        const tempDir = await this.ensurePath(["temp"]);
        for await (const [name] of tempDir.entries()) {
            await tempDir.removeEntry(name, { recursive: true });
        }
    }

    async openInFileManager(_path: string): Promise<void> {
        alert("File system browsing is not supported in browser mode.");
    }

    // --- Predefined directories (lazy) ---
    get databaseDirectory() {
        return this.ensureDirHandle(["database"]);
    }
    get resourceContainerDirectory() {
        return this.ensureDirHandle(["rc"]);
    }
    get internalSourceRCDirectory() {
        return this.ensureDirHandle(["rc", "src"]);
    }
    get userProfileImageDirectory() {
        return this.ensureDirHandle(["users", "images"]);
    }
    get versificationDirectory() {
        return this.ensureDirHandle(["versification"]);
    }
    get logsDirectory() {
        return this.ensureDirHandle(["logs"]);
    }
    get cacheDirectory() {
        return this.ensureDirHandle(["cache"]);
    }
    get tempDirectory() {
        return this.ensureDirHandle(["temp"]);
    }

    // --- Helpers ---
    private async ensureDirHandle(
        parts: string[],
    ): Promise<FileSystemDirectoryHandle> {
        const dir = await this.ensurePath(parts);
        return dir;
    }
    private async ensurePath(
        parts: string[],
    ): Promise<WebDirectoryHandleWrapper> {
        let dir = this.root;
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
    ): Promise<WebFileHandle> {
        const parts = path.split("/").filter(Boolean);
        const fileName = parts.pop();
        if (!fileName) throw new Error("Invalid file path");
        let dir = this.root;
        for (const part of parts)
            dir = await dir.getDirectoryHandle(part, { create: opts?.create });
        const file = await dir.getFileHandle(fileName, opts);
        return new WebFileHandle(file, path);
    }
}

// Tiny wrapper to provide write all in one go
export class WebFileHandle
    extends FileSystemFileHandle
    implements WebFileHandleExtended
{
    kind: "file" = "file";
    path: string;
    constructor(
        public handle: FileSystemFileHandle,
        path: string,
    ) {
        super();
        this.path = path;
    }
    async write(
        data: FileSystemWriteChunkType,
        options?: { keepExistingData?: boolean },
    ) {
        const writable = await this.handle.createWritable({
            keepExistingData: options?.keepExistingData ?? false,
        });
        await writable.write(data);
        await writable.close();
    }
}
