import type { Importer } from "@/core/domain/project/import/Importer.ts";
import {
    createImportProgressUpdate,
    ImportProgressPhase,
    type ImportProgressReporter,
} from "@/core/library/ImportService.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import {
    basenameStoragePath,
    joinStoragePath,
} from "@/core/persistence/pathUtils.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

/**
 * Import a directory that already exists on the local filesystem into managed
 * app storage.
 *
 * This class belongs to the "materialize onto disk" phase of the pipeline. It
 * does not interpret metadata or build runtime objects; it only copies bytes
 * into the library root while reporting enough progress for long folder imports.
 */
export class ProjectDirectoryImporter implements Importer {
    constructor(
        private readonly fileSystem: FileSystem,
        private readonly roots: StorageRoots,
    ) {}

    public async import(path: string): Promise<string> {
        return this.importDirectory(path);
    }

    public async importDirectory(
        sourceDirPath: string,
        onProgress?: ImportProgressReporter,
    ): Promise<string> {
        const projectName = basenameStoragePath(sourceDirPath);
        const finalProjectPath =
            await this.resolveProjectDirectory(projectName);
        await this.fileSystem.mkdir(finalProjectPath, { recursive: true });
        const totalFiles = await this.countFiles(sourceDirPath);
        await onProgress?.(
            createImportProgressUpdate(
                ImportProgressPhase.COPY_CONTENT,
                `Copying source directory into app storage (0/${totalFiles})...`,
                {
                    current: 0,
                    total: totalFiles,
                },
            ),
        );
        await this.copyDirectoryContents(sourceDirPath, finalProjectPath, {
            totalFiles,
            onProgress,
        });
        return finalProjectPath;
    }

    private async resolveProjectDirectory(
        initialName: string,
    ): Promise<string> {
        // Re-importing the same source should create a sibling library item
        // rather than overwriting an existing managed directory.
        let counter = 0;
        let uniqueProjectDirName = initialName;
        let candidate = joinStoragePath(
            this.roots.projectsRoot,
            uniqueProjectDirName,
        );

        while (await this.fileSystem.exists(candidate)) {
            counter++;
            uniqueProjectDirName = `${initialName} (${counter})`;
            candidate = joinStoragePath(
                this.roots.projectsRoot,
                uniqueProjectDirName,
            );
        }

        return candidate;
    }

    private async copyDirectoryContents(
        sourceDirPath: string,
        destinationDirPath: string,
        progress?: {
            totalFiles: number;
            copiedFiles?: number;
            onProgress?: ImportProgressReporter;
        },
    ): Promise<void> {
        // Import intentionally strips VCS internals. Managed storage is for app
        // content, not for mirroring arbitrary repository internals.
        for (const entry of await this.fileSystem.list(sourceDirPath)) {
            if (entry.name === ".git") {
                continue;
            }

            const destinationPath = joinStoragePath(
                destinationDirPath,
                entry.name,
            );

            if (entry.kind === "directory") {
                await this.fileSystem.mkdir(destinationPath, {
                    recursive: true,
                });
                await this.copyDirectoryContents(
                    entry.path,
                    destinationPath,
                    progress,
                );
                continue;
            }

            await this.fileSystem.writeBytes(
                destinationPath,
                await this.fileSystem.readBytes(entry.path),
            );
            if (progress) {
                progress.copiedFiles = (progress.copiedFiles ?? 0) + 1;
                if (
                    progress.copiedFiles === progress.totalFiles ||
                    progress.copiedFiles % 50 === 0
                ) {
                    await progress.onProgress?.(
                        createImportProgressUpdate(
                            ImportProgressPhase.COPY_CONTENT,
                            `Copying source directory into app storage (${progress.copiedFiles}/${progress.totalFiles})...`,
                            {
                                current: progress.copiedFiles,
                                total: progress.totalFiles,
                            },
                        ),
                    );
                }
            }
        }
    }

    private async countFiles(sourceDirPath: string): Promise<number> {
        // Progress is based on leaf-file copies rather than directory creation so
        // the UI reflects the work users actually wait on.
        let total = 0;
        for (const entry of await this.fileSystem.list(sourceDirPath)) {
            if (entry.name === ".git") {
                continue;
            }

            if (entry.kind === "file") {
                total += 1;
                continue;
            }

            total += await this.countFiles(entry.path);
        }
        return total;
    }
}
