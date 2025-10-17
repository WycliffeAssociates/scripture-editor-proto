import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";

export interface IAdditionalPathProperties {
    readonly path: string;
    readonly isDir: boolean;
    readonly isFile: boolean;

    isSameEntry(other: FileSystemHandle): Promise<boolean>;

    getParent(): Promise<IDirectoryHandle>;

    asFileHandle(): IFileHandle | null;

    asDirectoryHandle(): IDirectoryHandle | null;
}