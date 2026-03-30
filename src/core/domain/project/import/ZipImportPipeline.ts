import { type Unzipped, unzip } from "fflate";
import { SCRIPTURE_BURRITO_METADATA_FILENAME } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import {
    createImportProgressUpdate,
    ImportProgressPhase,
    type ImportProgressReporter,
} from "@/core/library/ImportService.ts";
import type {
    FileSystem,
    FileSystemEntry,
} from "@/core/persistence/FileSystem.ts";
import {
    joinStoragePath,
    stripFileExtension,
} from "@/core/persistence/pathUtils.ts";
import { shouldStripPortableProjectPath } from "@/core/persistence/portableProjectSanitization.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";

type ExtractionResult = {
    tempDirPath: string;
    extractedTopLevelItem: FileSystemEntry;
    topLevelEntryName: string;
    extractedFileCount: number;
};

/**
 * Shared archive pipeline used by both local zip imports and downloaded remote
 * archives.
 *
 * This is still import-phase code: it extracts bytes into temporary storage,
 * chooses the real top-level directory, and copies that directory into managed
 * app storage. Type-specific reshaping happens later once the item has been
 * classified.
 */
export class ZipImportPipeline {
    constructor(
        public readonly fileSystem: FileSystem,
        private readonly roots: StorageRoots,
    ) {}

    async importFromZipData(args: {
        archiveName: string;
        data: Uint8Array;
        stagedZipPath?: string;
        onProgress?: ImportProgressReporter;
    }): Promise<string> {
        let tempExtractionDirPath: string | null = null;

        try {
            const extractionResult = await this.extractZipToTemp({
                archiveName: args.archiveName,
                data: args.data,
                onProgress: args.onProgress,
            });
            tempExtractionDirPath = extractionResult.tempDirPath;

            const finalProjectPath = await this.resolveProjectDirectory(
                extractionResult.topLevelEntryName,
            );

            await args.onProgress?.(
                createImportProgressUpdate(
                    ImportProgressPhase.COPY_CONTENT,
                    `Copying extracted archive into app storage (0/${extractionResult.extractedFileCount})...`,
                    {
                        current: 0,
                        total: extractionResult.extractedFileCount,
                    },
                ),
            );
            await this.copyContentToFinalDestination(
                extractionResult.extractedTopLevelItem,
                finalProjectPath,
                {
                    totalFiles: extractionResult.extractedFileCount,
                    onProgress: args.onProgress,
                },
            );

            return finalProjectPath;
        } finally {
            // Zip import stages temp data while extraction is in flight. Cleanup
            // happens even on failure so repeated imports do not leak artifacts.
            await this.cleanup(
                tempExtractionDirPath,
                args.stagedZipPath ?? null,
            );
        }
    }

    private async extractZipToTemp(args: {
        archiveName: string;
        data: Uint8Array;
        onProgress?: ImportProgressReporter;
    }): Promise<ExtractionResult> {
        const tempExtractionDirPath = joinStoragePath(
            this.roots.tempRoot,
            `${stripFileExtension(args.archiveName)}-extract-${Date.now()}`,
        );
        await this.fileSystem.mkdir(tempExtractionDirPath, { recursive: true });

        const loadedZip = await new Promise<Unzipped>((resolve, reject) => {
            unzip(args.data, {}, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        const zipEntries = Object.keys(loadedZip).filter(
            (fileName) =>
                !shouldStripPortableProjectPath(fileName) &&
                !(
                    fileName.endsWith("/") &&
                    fileName.split("/").filter(Boolean).length === 0
                ),
        );
        await args.onProgress?.(
            createImportProgressUpdate(
                ImportProgressPhase.EXTRACT_ARCHIVE,
                `Extracting archive contents (0/${zipEntries.length})...`,
                {
                    current: 0,
                    total: zipEntries.length,
                },
            ),
        );

        let extractedEntries = 0;

        for (const fileName of Object.keys(loadedZip)) {
            if (shouldStripPortableProjectPath(fileName)) {
                continue;
            }

            if (
                fileName.endsWith("/") &&
                fileName.split("/").filter(Boolean).length === 0
            ) {
                continue;
            }

            const entryPathParts = fileName.split("/").filter(Boolean);
            const entryName = entryPathParts.pop();
            if (!entryName) continue;

            const targetPath = joinStoragePath(
                tempExtractionDirPath,
                ...entryPathParts,
                entryName,
            );

            if (fileName.endsWith("/")) {
                await this.fileSystem.mkdir(targetPath, { recursive: true });
                extractedEntries += 1;
                if (
                    extractedEntries === zipEntries.length ||
                    extractedEntries % 50 === 0
                ) {
                    await args.onProgress?.(
                        createImportProgressUpdate(
                            ImportProgressPhase.EXTRACT_ARCHIVE,
                            `Extracting archive contents (${extractedEntries}/${zipEntries.length})...`,
                            {
                                current: extractedEntries,
                                total: zipEntries.length,
                            },
                        ),
                    );
                }
                continue;
            }

            await this.fileSystem.writeBytes(targetPath, loadedZip[fileName]);
            extractedEntries += 1;
            if (
                extractedEntries === zipEntries.length ||
                extractedEntries % 50 === 0
            ) {
                await args.onProgress?.(
                    createImportProgressUpdate(
                        ImportProgressPhase.EXTRACT_ARCHIVE,
                        `Extracting archive contents (${extractedEntries}/${zipEntries.length})...`,
                        {
                            current: extractedEntries,
                            total: zipEntries.length,
                        },
                    ),
                );
            }
        }

        const topLevelEntries = await this.fileSystem.list(
            tempExtractionDirPath,
        );
        if (topLevelEntries.length === 0) {
            throw new Error("No content extracted from zip.");
        }

        const selectedTopLevel =
            await this.selectTopLevelEntry(topLevelEntries);

        return {
            tempDirPath: tempExtractionDirPath,
            extractedTopLevelItem: selectedTopLevel,
            topLevelEntryName: selectedTopLevel.name,
            extractedFileCount: await this.countFiles(selectedTopLevel),
        };
    }

    private async selectTopLevelEntry(
        entries: FileSystemEntry[],
    ): Promise<FileSystemEntry> {
        if (entries.length === 1) {
            return entries[0];
        }

        // Some archives contain multiple top-level folders. Prefer the one that
        // actually looks like a recognized container so later loaders see the
        // intended root.
        for (const entry of entries) {
            if (entry.kind !== "directory") continue;
            const hasMetadata = await this.fileSystem.exists(
                joinStoragePath(
                    entry.path,
                    SCRIPTURE_BURRITO_METADATA_FILENAME,
                ),
            );
            const hasManifest = await this.fileSystem.exists(
                joinStoragePath(entry.path, "manifest.yaml"),
            );
            if (hasMetadata || hasManifest) {
                return entry;
            }
        }

        return entries[0];
    }

    private async resolveProjectDirectory(
        initialName: string,
    ): Promise<string> {
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

        await this.fileSystem.mkdir(candidate, { recursive: true });
        return candidate;
    }

    private async copyContentToFinalDestination(
        sourceEntry: FileSystemEntry,
        destinationDirPath: string,
        progress?: {
            totalFiles: number;
            copiedFiles?: number;
            onProgress?: ImportProgressReporter;
        },
    ): Promise<void> {
        // Once extraction picks the root entry, the remaining copy step should
        // behave the same whether that root is a directory or a single file.
        if (sourceEntry.kind === "directory") {
            await this.copyDirectoryContents(
                sourceEntry.path,
                destinationDirPath,
                progress,
            );
            return;
        }

        await this.fileSystem.writeBytes(
            joinStoragePath(destinationDirPath, sourceEntry.name),
            await this.fileSystem.readBytes(sourceEntry.path),
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
                        `Copying extracted archive into app storage (${progress.copiedFiles}/${progress.totalFiles})...`,
                        {
                            current: progress.copiedFiles,
                            total: progress.totalFiles,
                        },
                    ),
                );
            }
        }
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
        for (const entry of await this.fileSystem.list(sourceDirPath)) {
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
                            `Copying extracted archive into app storage (${progress.copiedFiles}/${progress.totalFiles})...`,
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

    private async countFiles(entry: FileSystemEntry): Promise<number> {
        // Progress should reflect leaf-file copies, not directory creation.
        if (entry.kind === "file") {
            return 1;
        }

        let total = 0;
        for (const child of await this.fileSystem.list(entry.path)) {
            total += await this.countFiles(child);
        }
        return total;
    }

    private async cleanup(
        tempExtractionDirPath: string | null,
        stagedZipPath: string | null,
    ): Promise<void> {
        // Best-effort cleanup. Import success should not depend on whether temp
        // deletion succeeds after the final content is already written.
        if (tempExtractionDirPath) {
            try {
                await this.fileSystem.remove(tempExtractionDirPath, {
                    recursive: true,
                });
            } catch (error) {
                console.error("Error cleaning up temp extraction dir:", error);
            }
        }

        if (stagedZipPath) {
            try {
                await this.fileSystem.remove(stagedZipPath, {
                    recursive: false,
                });
            } catch (error) {
                console.error("Error cleaning up staged zip file:", error);
            }
        }
    }
}
