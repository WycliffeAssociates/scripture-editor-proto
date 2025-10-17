// Custom Interfaces
import {IDirectoryHandle} from "@/core/io/IDirectoryHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";
import {IAdditionalPathProperties} from "@/core/io/IAdditionalPathProperties.ts";

export interface _IPathHandle extends FileSystemHandle {
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

export type IPathHandle = _IPathHandle & IAdditionalPathProperties