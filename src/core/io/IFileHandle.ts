import {IPathHandle} from "@/core/io/IPathHandle.ts";

export interface IFileHandle extends IPathHandle {
    getFile(options?: FileSystemGetFileOptions): Promise<File>;

    createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;

    [Symbol.asyncDispose](): Promise<void>;
}