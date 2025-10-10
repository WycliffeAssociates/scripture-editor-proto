import { IDirectoryProvider } from "../src-core/persistence/DirectoryProvider.ts";
import { IFileWriter } from "../src-core/domain/project/IFileWriter.ts";
// import { FileSystemFileHandle } from "@tauri-apps/plugin-fs"; // This import should not be here for generic FileWriter

export class FileWriter implements IFileWriter {
    constructor(private directoryProvider: IDirectoryProvider, private baseDir: FileSystemDirectoryHandle) {}

    async writeFile(filePath: string, contents: string): Promise<void> {
        const fileHandle = await this.baseDir.getFileHandle(filePath, { create: true });
        const writer = await fileHandle.createWritable();
        await writer.write(contents);
        await writer.close();
    }
}
