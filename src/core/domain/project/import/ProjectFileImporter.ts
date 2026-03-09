import { ZipImportPipeline } from "@/core/domain/project/import/ZipImportPipeline.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";

export class ProjectFileImporter {
    private readonly zipPipeline: ZipImportPipeline;

    constructor(directoryProvider: IDirectoryProvider) {
        this.zipPipeline = new ZipImportPipeline(directoryProvider);
    }

    public async importFile(zipFileHandle: IFileHandle): Promise<string> {
        const data = await zipFileHandle
            .getFile()
            .then((f: File) => f.arrayBuffer());

        return this.zipPipeline.importFromZipData({
            archiveName: zipFileHandle.name,
            data,
            stagedZipHandle: zipFileHandle,
        });
    }
}
