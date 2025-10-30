// Custom Interfaces
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";

export interface IPathHandle extends FileSystemHandle {
    readonly kind: "directory" | "file";
    readonly name: string;
    readonly path: string;
    readonly isDir: boolean;
    readonly isFile: boolean;

    isSameEntry(other: IPathHandle): Promise<boolean>;

    getParent(): Promise<IDirectoryHandle>;

    asFileHandle(): IFileHandle | null;

    asDirectoryHandle(): IDirectoryHandle | null;

    getAbsolutePath(): Promise<string>;
}
