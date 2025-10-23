import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type { IFileWriter } from "@/core/persistence/IFileWriter.ts";

/**
 * @class FileWriter
 * @implements {IFileWriter}
 * @description Concrete implementation of IFileWriter that writes files relative to a base directory
 *              using the provided IDirectoryProvider and FileSystemDirectoryHandle.
 */
export class FileWriter implements IFileWriter {
    private baseDir: FileSystemDirectoryHandle;

    /**
     * @constructor
     * @description Creates an instance of FileWriter.
     * @param directoryProvider - The IDirectoryProvider instance to access file system operations.
     * @param baseDir - The FileSystemDirectoryHandle representing the base directory for file operations.
     */
    constructor(
        directoryProvider: IDirectoryProvider,
        baseDir: FileSystemDirectoryHandle,
    ) {
        this.directoryProvider = directoryProvider;
        this.baseDir = baseDir;
    }

    /**
     * @method writeFile
     * @description Writes the given content to the file at the specified path, relative to the base directory.
     *              If the file does not exist, it will be created.
     * @param filePath - The path to the file, relative to the `baseDir`.
     * @param contents - The string content to write to the file.
     * @returns A Promise that resolves when the file has been successfully written.
     */
    async writeFile(filePath: string, contents: string): Promise<void> {
        const fileHandle = await this.baseDir.getFileHandle(filePath, {
            create: true,
        });
        const writer = await fileHandle.createWritable();
        await writer.write(contents);
        await writer.close();
    }
}
