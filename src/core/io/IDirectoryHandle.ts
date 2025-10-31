import type {IFileHandle} from "@/core/io/IFileHandle.ts";
import type {IPathHandle} from "@/core/io/IPathHandle.ts";

export interface _IDirectoryHandle extends IPathHandle {
  getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions
  ): Promise<IDirectoryHandle>;

  getFileHandle(
    name: string,
    options?: FileSystemGetFileOptions
  ): Promise<IFileHandle>;

  removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;

  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;

  [Symbol.asyncIterator](): FileSystemDirectoryHandleAsyncIterator<
    [string, IPathHandle]
  >;

  entries(): FileSystemDirectoryHandleAsyncIterator<[string, IPathHandle]>;

  keys(): FileSystemDirectoryHandleAsyncIterator<string>;

  values(): FileSystemDirectoryHandleAsyncIterator<IPathHandle>;

  [Symbol.asyncDispose](): Promise<void>;
}

export type IDirectoryHandle = _IDirectoryHandle & FileSystemDirectoryHandle;
