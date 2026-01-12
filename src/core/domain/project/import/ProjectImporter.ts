import { ProjectDirectoryImporter } from "@/core/domain/project/import/ProjectDirectoryImporter.ts";
import { ProjectFileImporter } from "@/core/domain/project/import/ProjectFileImporter.ts";
import { WacsRepoImporter } from "@/core/domain/project/import/WacsRepoImporter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";

/**
 * Discriminated union describing supported import sources.
 */
export type ImportSource =
    | { type: "fromZipFile"; fileHandle: IFileHandle }
    | { type: "fromDir"; dirHandle: IDirectoryHandle }
    | { type: "fromGitRepo"; url: string };

/**
 * ProjectImporter
 *
 * Single-entry orchestrator that accepts an `ImportSource` discriminated union
 * and delegates to the appropriate concrete importer implementation. Returns
 * the path of the imported directory on success.
 *
 * Note: Post-import database indexing is handled by ProjectIndexer in the app layer.
 */
export class ProjectImporter {
    private readonly wacsImporter: WacsRepoImporter;
    private readonly fileImporter: ProjectFileImporter;
    private readonly directoryImporter: ProjectDirectoryImporter;

    constructor(directoryProvider: IDirectoryProvider) {
        this.wacsImporter = new WacsRepoImporter(directoryProvider);
        this.fileImporter = new ProjectFileImporter(directoryProvider);
        this.directoryImporter = new ProjectDirectoryImporter(
            directoryProvider,
        );
    }

    /**
     * Single import entry point. Accepts a discriminated `ImportSource` and
     * delegates to the proper importer. Returns the path of the imported directory
     * on success, or null on failure.
     *
     * Note: This method only handles the import operation. Database indexing
     * should be performed by calling ProjectIndexer.indexProject() with the
     * returned path.
     */
    public async import(source: ImportSource): Promise<string | null> {
        let importedDir: string | null = null;
        try {
            switch (source.type) {
                case "fromGitRepo":
                    importedDir = await this.wacsImporter.import(source.url);
                    break;

                case "fromZipFile":
                    importedDir = await this.fileImporter.importFile(
                        source.fileHandle,
                    );
                    break;

                case "fromDir":
                    importedDir = await this.directoryImporter.importDirectory(
                        source.dirHandle,
                    );
                    break;

                default:
                    throw new Error("Unsupported import source");
            }

            return importedDir;
        } catch (err) {
            console.error("[ProjectImporter] import failed:", err);
            return null;
        }
    }
}
