import {IPathHandle} from "@/core/io/IPathHandle.ts";
import {IFileHandle} from "@/core/io/IFileHandle.ts";

export interface IDirectoryHandle extends IPathHandle {
    getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<IDirectoryHandle>;

    getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<IFileHandle>;

    removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;

    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;

    [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<[string, IPathHandle]>;

    entries(): FileSystemDirectoryHandleAsyncIterator<[string, IPathHandle]>;

    keys(): FileSystemDirectoryHandleAsyncIterator<string>;

    values(): FileSystemDirectoryHandleAsyncIterator<IPathHandle>;

    [Symbol.asyncDispose](): Promise<void>;
}