import {IFileHandle} from "@/core/io/IFileHandle.ts";

export interface WebFileHandleExtended extends IFileHandle {
    write(data: FileSystemWriteChunkType, options?: { keepExistingData?: boolean }): Promise<void>;
}