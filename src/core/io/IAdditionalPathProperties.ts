import {IDirectoryHandle, IFileHandle} from "@/core/persistence/DirectoryProvider.ts";

export interface IAdditionalPathProperties {
    readonly path: string;
    readonly isDir: boolean;
    readonly isFile: boolean;

    isSameEntry(other: FileSystemHandle): Promise<boolean>;

    getParent(): Promise<IDirectoryHandle>;

    asFileHandle(): IFileHandle | null;

    asDirectoryHandle(): IDirectoryHandle | null;
}