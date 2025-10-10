export interface IFileWriter {
    writeFile(filePath: string, contents: string): Promise<void>;
}
