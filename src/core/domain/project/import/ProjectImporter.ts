import { ProjectDirectoryImporter } from "@/core/domain/project/import/ProjectDirectoryImporter.ts";
import { ProjectFileImporter } from "@/core/domain/project/import/ProjectFileImporter.ts";
import { WacsRepoImporter } from "@/core/domain/project/import/WacsRepoImporter.ts";
import type { ImportProgressReporter } from "@/core/library/ImportService.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Discriminated union describing the low-level import sources this router knows
 * how to materialize into managed app storage.
 */
export type ImportSource =
  | { type: "fromZipFile"; filePath: string }
  | { type: "fromDir"; directoryPath: string }
  | { type: "fromPreparedDir"; directoryPath: string }
  | { type: "fromGitRepo"; url: string };

/**
 * Low-level import router that turns one import source into a managed directory
 * on disk.
 *
 * This class belongs strictly to the import/materialization phase. It stops once
 * the source has been written into app storage. Type-specific reshaping,
 * indexing, and project/resource opening happen later.
 */
export class ProjectImporter {
  private readonly wacsImporter: WacsRepoImporter;
  private readonly fileImporter: ProjectFileImporter;
  private readonly directoryImporter: ProjectDirectoryImporter;

  constructor(fileSystem: FileSystem, roots: StorageRoots) {
    this.wacsImporter = new WacsRepoImporter(fileSystem, roots);
    this.fileImporter = new ProjectFileImporter(fileSystem, roots);
    this.directoryImporter = new ProjectDirectoryImporter(fileSystem, roots);
  }

  public async import(
    source: ImportSource,
    onProgress?: ImportProgressReporter,
  ): Promise<string> {
    switch (source.type) {
      case "fromGitRepo":
        return this.wacsImporter.import(source.url, onProgress);

      case "fromZipFile":
        return this.fileImporter.importFile(source.filePath, onProgress);

      case "fromDir":
        return this.directoryImporter.importDirectory(
          source.directoryPath,
          onProgress,
        );

      case "fromPreparedDir":
        return source.directoryPath;

      default:
        throw new Error("Unsupported import source");
    }
  }
}
