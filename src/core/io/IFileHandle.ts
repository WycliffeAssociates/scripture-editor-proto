import {IPathHandle} from "@/core/io/IPathHandle.ts";

interface _IFileHandle extends IPathHandle {
    getFile(options?: FileSystemGetFileOptions): Promise<File>;

    createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;

    [Symbol.asyncDispose](): Promise<void>;
}

export type IFileHandle = _IFileHandle & FileSystemFileHandle;