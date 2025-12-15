import { upsertFile, upsertLanguage, upsertProject } from "@/app/db/api.ts";
import { db } from "@/app/db/db.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { ProjectDirectoryImporter } from "@/core/domain/project/import/ProjectDirectoryImporter.ts";
import { ProjectFileImporter } from "@/core/domain/project/import/ProjectFileImporter.ts";
import { WacsRepoImporter } from "@/core/domain/project/import/WacsRepoImporter.ts";
import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IDirectoryProvider } from "@/core/persistence/DirectoryProvider.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";
import { tryParseProjectForDb } from "@/core/persistence/ProjectRepository.ts";

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
 * Single-entry orchestrator that accepts an `ImportSource` discriminated union,
 * delegates to the appropriate concrete importer implementation, and then runs
 * a centralized post-processing hook. This allows new postprocessing (e.g.
 * updating a sqlite metadata view) to be executed exactly once after any kind
 * of import.
 */
export class ProjectImporter {
    private readonly wacsImporter: WacsRepoImporter;
    private readonly fileImporter: ProjectFileImporter;
    private readonly directoryImporter: ProjectDirectoryImporter;
    private readonly projectRepository: IProjectRepository;
    private readonly md5Service: IMd5Service;

    constructor(
        directoryProvider: IDirectoryProvider,
        projectRepository: IProjectRepository,
        md5Service: IMd5Service,
    ) {
        this.wacsImporter = new WacsRepoImporter(directoryProvider);
        this.fileImporter = new ProjectFileImporter(directoryProvider);
        this.directoryImporter = new ProjectDirectoryImporter(
            directoryProvider,
        );
        this.projectRepository = projectRepository;
        this.md5Service = md5Service;
    }

    /**
     * Single import entry point. Accepts a discriminated `ImportSource` and
     * delegates to the proper importer. After a successful import this method
     * invokes the centralized `postImportHook`.
     */
    public async import(source: ImportSource): Promise<boolean> {
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

            if (!importedDir) return false;

            // Centralized postprocessing hook (runs regardless of source).
            try {
                await this.postImportHook(importedDir);
            } catch (e) {
                // Postprocessing errors should not mark the import as failed, but should be visible.
                console.warn(" [ProjectImporter] postImportHook failed:", e);
            }

            return true;
        } catch (err) {
            console.error("[ProjectImporter] import failed:", err);
            return false;
        }
    }

    /**
     * Centralized post-import processing.
     *
     * This implementation:
     *  - loads the imported project via the provided repository
     *  - runs a single DB transaction that:
     *      * upserts the language row
     *      * upserts the project row (associating language_id)
     *      * inserts / upserts each file row with resolved path_on_disk
     *
     * Notes:
     *  - This function assumes `loadedProject.files[*].path` is absolute.
     *  - Uses `db.transaction` wrapper provided by the Turso-like client.
     */
    private async postImportHook(importedDir: string): Promise<void> {
        // Load project via repository
        const projectPath = importedDir.split("/").at(-1);
        if (!projectPath) {
            console.warn(
                "[ProjectImporter] postImportHook: no project path found for",
                importedDir,
            );
            return;
        }
        const loadedProject = await this.projectRepository.loadProject(
            projectPath,
            this.md5Service,
        );

        if (!loadedProject) {
            console.warn(
                "[ProjectImporter] postImportHook: no project returned from repository for",
                importedDir,
            );
            return;
        }

        // Validate the loaded project shape before writing to DB
        const [parsedProject, parseError] = tryParseProjectForDb(loadedProject);
        if (!parsedProject) {
            console.warn(
                "[ProjectImporter] postImportHook: validation failed for project at",
                importedDir,
                "error:",
                parseError,
            );
            return;
        }

        // Parsed, validated values (no optional chaining below)
        const projectIdentifier = parsedProject.metadata.id;
        const projectName = parsedProject.metadata.name;
        const projectDirPath = importedDir;

        const langIdentifier = parsedProject.metadata.language.id;
        const langTitle = parsedProject.metadata.language.name;
        const langDirection = (parsedProject.metadata.language.direction ??
            "ltr") as "ltr" | "rtl";

        // Transaction: upsert language, upsert project, upsert files
        await db.transaction(
            "rw",
            db.languages,
            db.projects,
            db.files,
            async () => {
                // Upsert language (returns language row with numeric id)
                const languageRow = await upsertLanguage(
                    langIdentifier,
                    langTitle,
                    langDirection,
                );
                const languageId = languageRow?.id ?? null;

                // Upsert project row (keyed by project_dir)
                const projectRow = await upsertProject(projectDirPath, {
                    identifier: projectIdentifier,
                    title: projectName,
                    languageId: languageId,
                    version: null,
                });

                if (!projectRow) {
                    throw new Error(
                        "[ProjectImporter] postImportHook: failed to upsert project row",
                    );
                }

                const projectId =
                    projectRow.id ??
                    (() => {
                        throw new Error(
                            "[ProjectImporter] postImportHook: project row missing id after upsert",
                        );
                    })();

                // Upsert each file. If a file fails, log and continue (tolerant strategy).
                for (const f of parsedProject.files) {
                    const pathOnDisk = f.path;
                    const identifier = f.bookCode ?? null;
                    const title = f.title ?? null;
                    const sortOrder =
                        typeof f.sort === "number" ? f.sort : null;
                    const fileExt = (() => {
                        const idx = pathOnDisk.lastIndexOf(".");
                        return idx >= 0 ? pathOnDisk.substring(idx) : null;
                    })();

                    try {
                        await upsertFile(projectId, {
                            identifier,
                            title,
                            sortOrder,
                            relativePath: null,
                            pathOnDisk,
                            fileExtension: fileExt,
                        });
                    } catch (fileErr) {
                        // log file-level error but continue processing other files
                        console.warn(
                            "[ProjectImporter] postImportHook: failed upserting file",
                            pathOnDisk,
                            fileErr,
                        );
                    }
                }

                console.log(
                    "[ProjectImporter] postImportHook: indexing complete for",
                    importedDir,
                );
            },
        );
    }
}
