import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileWriter } from "@/core/io/IFileWriter.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";

/**
 * @class FileWriter
 * @implements {IFileWriter}
 * @description Concrete implementation of IFileWriter that writes files relative to a base directory
 *              using the provided IDirectoryProvider and FileSystemDirectoryHandle.
 */
export class FileWriter implements IFileWriter {
    private directoryProvider: IDirectoryProvider;
    private baseDir: IDirectoryHandle; // Change to IDirectoryHandle

    /**
     * @constructor
     * @description Creates an instance of FileWriter.
     * @param directoryProvider - The IDirectoryProvider instance to access file system operations.
     * @param baseDir - The IDirectoryHandle representing the base directory for file operations.
     */
    constructor(
        directoryProvider: IDirectoryProvider,
        baseDir: IDirectoryHandle,
    ) {
        this.directoryProvider = directoryProvider;
        this.baseDir = baseDir;
    }

    /**
     * @method writeFile
     * @description Writes the given content to the file at the specified path, relative to the `baseDir`.
     *              If the file does not exist, it will be created.
     * @param filePath - The path to the file, relative to the `baseDir`.
     * @param contents - The string content to write to the file.
     * @returns A Promise that resolves when the file has been successfully written.
     */
    async writeFile(filePath: string, contents: string): Promise<void> {
        const fileHandle = await this.directoryProvider.getHandle(
            `${this.baseDir.path}/${filePath}`,
        );
        const file = fileHandle.asFileHandle();
        if (!file) throw new Error(`Path ${filePath} is not a file.`);
        const writer = await file.createWritable();
        await writer.write(contents);
        await writer.close();
    }
}
