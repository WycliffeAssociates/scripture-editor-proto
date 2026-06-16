import type { Importer } from "@/core/domain/project/import/Importer.ts";
import { ZipImportPipeline } from "@/core/domain/project/import/ZipImportPipeline.ts";
import {
  emitImportProgress,
  ImportProgressPhase,
  type ImportProgressReporter,
} from "@/core/library/ImportService.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Import a remote archive URL by downloading it and then reusing the shared zip
 * pipeline.
 *
 * Despite the historic "repo" name, this class no longer assumes git semantics.
 * At this seam a remote source is just a downloadable archive that eventually
 * becomes a managed directory in app storage.
 */
export class WacsRepoImporter implements Importer {
  private readonly zipPipeline: ZipImportPipeline;

  constructor(fileSystem: FileSystem, roots: StorageRoots) {
    this.zipPipeline = new ZipImportPipeline(fileSystem, roots);
  }

  public async import(
    url: string,
    onProgress?: ImportProgressReporter,
  ): Promise<string> {
    await emitImportProgress(
      onProgress,
      ImportProgressPhase.READ_SOURCE,
      `Downloading remote archive ${url}...`,
    );
    const { data, filename } = await this.downloadData(url);
    return await this.zipPipeline.importFromZipData({
      archiveName: filename,
      data,
      onProgress,
    });
  }

  public async downloadData(
    url: string,
  ): Promise<{ data: Uint8Array; filename: string }> {
    // Remote import still funnels through the zip pipeline so local and
    // remote archive handling converge once the bytes have been fetched.
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(
        `Download failed with status: ${res.status} ${res.statusText}`,
      );
    }

    const data = new Uint8Array(await res.arrayBuffer());
    const filename = url.split("/").slice(-1)[0] || "download.zip";
    return { data, filename };
  }
}
