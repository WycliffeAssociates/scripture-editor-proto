import { IDirectoryProvider } from "../src-core/persistence/DirectoryProvider.ts";
import { IFileWriter } from "../src-core/domain/project/IFileWriter.ts";
// import { FileSystemFileHandle } from "@tauri-apps/plugin-fs"; // This import should not be here for generic FileWriter

export class FileWriter implements IFileWriter {
    constructor(private directoryProvider: IDirectoryProvider) {}

    async writeFile(filePath: string, contents: string): Promise<void> {
        const fileHandle = await this.directoryProvider.newFileWriter(filePath);
        await fileHandle.write(contents);
        await fileHandle.close();
    }
}
