import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { loadedProjectToParsedFiles } from "@/app/domain/api/loadedProjectToParsedFiles.ts";
import type {
    ProjectWarmCacheBlob,
    ProjectWarmCacheProvider,
} from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

function cloneBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy;
}

function toUint8Array(
    value: string | ArrayBuffer | Uint8Array | Blob,
): Promise<Uint8Array<ArrayBuffer>> | Uint8Array<ArrayBuffer> {
    if (typeof value === "string") {
        return new TextEncoder().encode(value);
    }
    if (value instanceof Blob) {
        return value.arrayBuffer().then((buffer) => new Uint8Array(buffer));
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    return cloneBytes(value);
}

type InMemoryNode = InMemoryDirectoryHandle | InMemoryFileHandle;

export class InMemoryFileHandle implements Partial<IFileHandle> {
    kind: "file" = "file";
    isDir = false;
    isFile = true;

    constructor(
        public readonly name: string,
        public readonly path: string,
        private readonly readBytes: () => Uint8Array<ArrayBuffer>,
        private readonly writeBytes: (bytes: Uint8Array<ArrayBuffer>) => void,
        private readonly getParentDir: () => InMemoryDirectoryHandle,
    ) {}

    async getFile(): Promise<File> {
        const bytes = cloneBytes(this.readBytes());
        return new File([bytes.buffer], this.name);
    }

    async createWritable(): Promise<FileSystemWritableFileStream> {
        let buffer = cloneBytes(this.readBytes());
        return {
            write: async (data: FileSystemWriteChunkType) => {
                const maybeOp = data as { type?: string; data?: unknown };
                if (maybeOp.type === "write" && maybeOp.data) {
                    buffer = await toUint8Array(
                        maybeOp.data as
                            | string
                            | Blob
                            | ArrayBuffer
                            | Uint8Array,
                    );
                    return;
                }
                buffer = await toUint8Array(
                    data as string | ArrayBuffer | Uint8Array | Blob,
                );
            },
            close: async () => {
                this.writeBytes(buffer);
            },
            abort: async () => {},
            getWriter: () =>
                ({
                    write: async (
                        data: string | ArrayBuffer | Uint8Array | Blob,
                    ) => {
                        buffer = await toUint8Array(data);
                    },
                    close: async () => {
                        this.writeBytes(buffer);
                    },
                    abort: async () => {},
                }) as unknown as WritableStreamDefaultWriter,
        } as unknown as FileSystemWritableFileStream;
    }

    async createWriter(): Promise<WritableStreamDefaultWriter> {
        return (await this.createWritable()).getWriter();
    }

    async getParent(): Promise<IDirectoryHandle> {
        return this.getParentDir() as unknown as IDirectoryHandle;
    }

    asFileHandle(): IFileHandle | null {
        return this as unknown as IFileHandle;
    }

    asDirectoryHandle(): IDirectoryHandle | null {
        return null;
    }

    async getAbsolutePath(): Promise<string> {
        return this.path;
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return (other as IPathHandle & { path?: string }).path === this.path;
    }

    async [Symbol.asyncDispose](): Promise<void> {}
}

export class InMemoryDirectoryHandle implements Partial<IDirectoryHandle> {
    kind: "directory" = "directory";
    isDir = true;
    isFile = false;
    private readonly children = new Map<string, InMemoryNode>();

    constructor(
        public readonly name: string,
        public readonly path: string,
        private readonly parent?: InMemoryDirectoryHandle,
    ) {}

    private splitParts(name: string): string[] {
        return name.split("/").filter(Boolean);
    }

    private joinPath(childName: string): string {
        return this.path === "/"
            ? `/${childName}`
            : `${this.path}/${childName}`;
    }

    seedFile(name: string, contents: string) {
        const parts = this.splitParts(name);
        const fileName = parts.pop();
        if (!fileName) return;
        let current: InMemoryDirectoryHandle = this;
        for (const part of parts) {
            const existing = current.children.get(part);
            if (existing instanceof InMemoryDirectoryHandle) {
                current = existing;
                continue;
            }
            const next = new InMemoryDirectoryHandle(
                part,
                current.joinPath(part),
                current,
            );
            current.children.set(part, next);
            current = next;
        }
        let bytes = cloneBytes(new TextEncoder().encode(contents));
        const handle = new InMemoryFileHandle(
            fileName,
            current.joinPath(fileName),
            () => bytes,
            (nextBytes) => {
                bytes = nextBytes;
            },
            () => current,
        );
        current.children.set(fileName, handle);
    }

    async getDirectoryHandle(
        name: string,
        options?: FileSystemGetDirectoryOptions,
    ): Promise<IDirectoryHandle> {
        const parts = this.splitParts(name);
        let current: InMemoryDirectoryHandle = this;
        for (const part of parts) {
            const existing = current.children.get(part);
            if (existing) {
                if (!(existing instanceof InMemoryDirectoryHandle)) {
                    throw new Error(`Path segment ${part} is not a directory.`);
                }
                current = existing;
                continue;
            }
            if (!options?.create) {
                throw new Error(`Directory not found: ${name}`);
            }
            const next = new InMemoryDirectoryHandle(
                part,
                current.joinPath(part),
                current,
            );
            current.children.set(part, next);
            current = next;
        }
        return current as unknown as IDirectoryHandle;
    }

    async getFileHandle(
        name: string,
        options?: FileSystemGetFileOptions,
    ): Promise<IFileHandle> {
        const parts = this.splitParts(name);
        const fileName = parts.pop();
        if (!fileName) {
            throw new Error("Invalid file name");
        }
        let current: InMemoryDirectoryHandle = this;
        if (parts.length > 0) {
            current = (await this.getDirectoryHandle(parts.join("/"), {
                create: options?.create,
            })) as unknown as InMemoryDirectoryHandle;
        }
        const existing = current.children.get(fileName);
        if (existing) {
            if (!(existing instanceof InMemoryFileHandle)) {
                throw new Error(`Path segment ${fileName} is not a file.`);
            }
            return existing as unknown as IFileHandle;
        }
        if (!options?.create) {
            throw new Error(`File not found: ${name}`);
        }
        let bytes = new Uint8Array(0);
        const handle = new InMemoryFileHandle(
            fileName,
            current.joinPath(fileName),
            () => bytes,
            (nextBytes) => {
                bytes = nextBytes;
            },
            () => current,
        );
        current.children.set(fileName, handle);
        return handle as unknown as IFileHandle;
    }

    async removeEntry(
        name: string,
        _options?: FileSystemRemoveOptions,
    ): Promise<void> {
        const parts = this.splitParts(name);
        const entryName = parts.pop();
        if (!entryName) return;
        let current: InMemoryDirectoryHandle = this;
        if (parts.length > 0) {
            current = (await this.getDirectoryHandle(
                parts.join("/"),
            )) as unknown as InMemoryDirectoryHandle;
        }
        current.children.delete(entryName);
    }

    async getParent(): Promise<IDirectoryHandle> {
        return (this.parent ?? this) as unknown as IDirectoryHandle;
    }

    asFileHandle(): IFileHandle | null {
        return null;
    }

    asDirectoryHandle(): IDirectoryHandle | null {
        return this as unknown as IDirectoryHandle;
    }

    async getAbsolutePath(): Promise<string> {
        return this.path;
    }

    async isSameEntry(other: FileSystemHandle): Promise<boolean> {
        return (other as IPathHandle & { path?: string }).path === this.path;
    }

    async resolve(
        possibleDescendant: FileSystemHandle,
    ): Promise<string[] | null> {
        const descendantPath = (
            possibleDescendant as IPathHandle & { path?: string }
        ).path;
        if (!descendantPath?.startsWith(`${this.path}/`)) return null;
        return descendantPath
            .slice(this.path.length + 1)
            .split("/")
            .filter(Boolean);
    }

    async *entries(): FileSystemDirectoryHandleAsyncIterator<
        [string, IPathHandle]
    > {
        for (const [name, child] of this.children.entries()) {
            yield [name, child as unknown as IPathHandle];
        }
    }

    async *keys(): FileSystemDirectoryHandleAsyncIterator<string> {
        for (const [name] of this.children.entries()) {
            yield name;
        }
    }

    async *values(): FileSystemDirectoryHandleAsyncIterator<IPathHandle> {
        for (const child of this.children.values()) {
            yield child as unknown as IPathHandle;
        }
    }

    async containsFile(name: string): Promise<boolean> {
        return this.children.get(name) instanceof InMemoryFileHandle;
    }

    async containsDir(name: string): Promise<boolean> {
        return this.children.get(name) instanceof InMemoryDirectoryHandle;
    }

    [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<
        [string, IPathHandle]
    > {
        return this.entries();
    }

    async [Symbol.asyncDispose](): Promise<void> {}
}

export class InMemoryWarmCacheProvider implements ProjectWarmCacheProvider {
    blob: ProjectWarmCacheBlob | null = null;
    writes = 0;

    private cloneBlob<T>(value: T): T {
        return JSON.parse(JSON.stringify(value)) as T;
    }

    async read(_projectPath: string): Promise<ProjectWarmCacheBlob | null> {
        return this.blob ? this.cloneBlob(this.blob) : null;
    }
    async write(
        _projectPath: string,
        blob: ProjectWarmCacheBlob,
    ): Promise<void> {
        this.blob = this.cloneBlob(blob);
        this.writes += 1;
    }
    async clear(_projectPath: string): Promise<void> {
        this.blob = null;
    }
}

export function createInMemoryDirectoryProvider(): {
    directoryProvider: IDirectoryProvider;
    cacheDirectory: InMemoryDirectoryHandle;
} {
    const cacheDirectory = new InMemoryDirectoryHandle("cache", "/cache");
    return {
        directoryProvider: {
            cacheDirectory: Promise.resolve(
                cacheDirectory as unknown as IDirectoryHandle,
            ),
        } as IDirectoryProvider,
        cacheDirectory,
    };
}

export function createInMemoryProject(args: {
    rootPath?: string;
    files: Record<string, string>;
}): Project {
    const rootPath = args.rootPath ?? "/project";
    const projectDir = new InMemoryDirectoryHandle("project", rootPath);
    const entries = Object.entries(args.files).sort(([left], [right]) =>
        left.localeCompare(right),
    );
    for (const [relativePath, contents] of entries) {
        projectDir.seedFile(relativePath, contents);
    }
    return {
        id: "project-id",
        name: "Project",
        files: entries.map(([relativePath], index) => {
            const match = relativePath.match(/([A-Z]{3})/u);
            const bookCode = match?.[1] ?? `B${index}`;
            return {
                path: `${rootPath}/${relativePath}`,
                title: bookCode,
                bookCode,
                prevBookId: null,
                nextBookId: null,
                sort: index,
            };
        }),
        metadata: {
            id: "project-id",
            name: "Project",
            language: {
                id: "en",
                name: "English",
                direction: "ltr",
            },
        },
        projectDir: projectDir as unknown as IDirectoryHandle,
        fileWriter: null as never,
        addBook: async () => {},
        getBook: async (bookCode: string) => {
            const entry = entries.find(([relativePath]) =>
                relativePath.includes(bookCode),
            );
            if (!entry) return null;
            const handle = await projectDir.getFileHandle(entry[0]);
            return (await handle.getFile()).text();
        },
    };
}

export async function loadParsedWorkingFiles(
    project: Project,
): Promise<ParsedFile[]> {
    const { parsedFiles } = await loadedProjectToParsedFiles({
        loadedProject: project,
        editorMode: "regular",
    });
    return parsedFiles;
}
