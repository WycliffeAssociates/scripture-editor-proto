/**
 * @interface IFileWriter
 * @description Defines the contract for writing file content to a specified path.
 *              This abstraction allows the Project object to save changes without knowing
 *              the underlying persistence mechanism.
 */
export interface IFileWriter {
    /**
     * @method writeFile
     * @description Writes the given content to the file at the specified path.
     *              If the file does not exist, it should be created.
     * @param filePath - The path to the file, relative to the project's root directory.
     * @param contents - The string content to write to the file.
     * @returns A Promise that resolves when the file has been successfully written.
     */
    writeFile(filePath: string, contents: string): Promise<void>;
}