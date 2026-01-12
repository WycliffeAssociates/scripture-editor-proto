import { upsertFile, upsertLanguage, upsertProject } from "@/app/db/api.ts";
import { db } from "@/app/db/db.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";
import { tryParseProjectForDb } from "@/core/persistence/ProjectRepository.ts";

/**
 * ProjectIndexer
 *
 * Service that handles database indexing logic for imported projects.
 * This service loads a project from disk, parses metadata, and updates
 * the application database (IndexedDB via Dexie).
 *
 * Responsibilities:
 * - Load project from disk via IProjectRepository
 * - Validate project structure using tryParseProjectForDb
 * - Execute database transaction to upsert language, project, and file records
 */
export class ProjectIndexer {
    constructor(
        private readonly projectRepository: IProjectRepository,
        private readonly md5Service: IMd5Service,
    ) {}

    /**
     * Loads project from disk, parses metadata, and updates DB.
     *
     * This method:
     * 1. Extracts project path from the provided directory path
     * 2. Loads the project via the repository
     * 3. Validates the project structure
     * 4. Executes a transaction to upsert language, project, and file records
     *
     * @param projectDirPath - The full path to the imported project directory
     * @returns Promise that resolves when indexing is complete
     */
    public async indexProject(projectDirPath: string): Promise<void> {
        // Extract project identifier from directory path
        const projectPath = projectDirPath.split("/").at(-1);
        if (!projectPath) {
            console.warn(
                "[ProjectIndexer] indexProject: no project path found for",
                projectDirPath,
            );
            return;
        }

        // Load project via repository
        const loadedProject = await this.projectRepository.loadProject(
            projectPath,
            this.md5Service,
        );

        if (!loadedProject) {
            console.warn(
                "[ProjectIndexer] indexProject: no project returned from repository for",
                projectDirPath,
            );
            return;
        }

        // Validate the loaded project shape before writing to DB
        const [parsedProject, parseError] = tryParseProjectForDb(loadedProject);
        if (!parsedProject) {
            console.warn(
                "[ProjectIndexer] indexProject: validation failed for project at",
                projectDirPath,
                "error:",
                parseError,
            );
            return;
        }

        // Parsed, validated values (no optional chaining below)
        const projectIdentifier = parsedProject.metadata.id;
        const projectName = parsedProject.metadata.name;

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
                        "[ProjectIndexer] indexProject: failed to upsert project row",
                    );
                }

                const projectId =
                    projectRow.id ??
                    (() => {
                        throw new Error(
                            "[ProjectIndexer] indexProject: project row missing id after upsert",
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
                            "[ProjectIndexer] indexProject: failed upserting file",
                            pathOnDisk,
                            fileErr,
                        );
                    }
                }

                console.log(
                    "[ProjectIndexer] indexProject: indexing complete for",
                    projectDirPath,
                );
            },
        );
    }
}
