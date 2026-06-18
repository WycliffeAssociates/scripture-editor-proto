import { ZipImportPipeline } from "@/core/domain/project/import/ZipImportPipeline.ts";
import {
  emitImportProgress,
  ImportProgressPhase,
  type ImportProgressReporter,
} from "@/core/library/ImportService.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import { basenameStoragePath } from "@/core/persistence/pathUtils.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Import a staged archive file that already lives in app-accessible storage.
 *
 * Desktop native flows can hand us a real filesystem path selected by the OS
 * dialog. This wrapper keeps callers path-based until the moment the shared zip
 * pipeline actually needs bytes.
 */
export class ProjectFileImporter {
  private readonly zipPipeline: ZipImportPipeline;

  constructor(fileSystem: FileSystem, roots: StorageRoots) {
    this.zipPipeline = new ZipImportPipeline(fileSystem, roots);
  }

  public async importFile(
    zipFilePath: string,
    onProgress?: ImportProgressReporter,
    archiveName?: string,
  ): Promise<string> {
    // The unzip pipeline works from bytes. This small adapter exists so the
    // rest of the import stack can stay storage-path based.
    //
    // `archiveName` is the real upload filename when the caller staged the zip
    // under a throwaway temp name; otherwise the staged path's basename is the
    // real name already (native imports).
    const resolvedArchiveName = archiveName ?? basenameStoragePath(zipFilePath);
    await emitImportProgress(
      onProgress,
      ImportProgressPhase.READ_SOURCE,
      `Reading staged archive ${resolvedArchiveName}...`,
    );
    const data = await this.zipPipeline.fileSystem.readBytes(zipFilePath);

    return this.zipPipeline.importFromZipData({
      archiveName: resolvedArchiveName,
      data,
      stagedZipPath: zipFilePath,
      onProgress,
    });
  }
}
