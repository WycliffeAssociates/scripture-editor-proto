import type { Importer } from "@/core/domain/project/import/Importer.ts";
import { ZipImportPipeline } from "@/core/domain/project/import/ZipImportPipeline.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";

export class WacsRepoImporter implements Importer {
    private readonly zipPipeline: ZipImportPipeline;

    constructor(directoryProvider: IDirectoryProvider) {
        this.zipPipeline = new ZipImportPipeline(directoryProvider);
    }

    public async import(url: string): Promise<string> {
        const { data, filename } = await this.downloadData(url);
        return await this.zipPipeline.importFromZipData({
            archiveName: filename,
            data,
        });
    }

    public async downloadData(
        url: string,
    ): Promise<{ data: ArrayBuffer; filename: string }> {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(
                `Download failed with status: ${res.status} ${res.statusText}`,
            );
        }

        const data = await res.arrayBuffer();
        const filename = url.split("/").slice(-1)[0] || "download.zip";
        return { data, filename };
    }
}
