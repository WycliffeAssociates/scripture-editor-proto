import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as tauriOpen } from "@tauri-apps/plugin-dialog";
import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import type {
    ImportFolderSource,
    ImportProgressUpdate,
    ImportProjectOptions,
    ImportService,
    ImportSourceResult,
    ImportZipSource,
    NativeImportSelectionOptions,
} from "@/core/library/ImportService.ts";
import {
    createImportProgressUpdate,
    ImportProgressPhase,
} from "@/core/library/ImportService.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";
import type { StorageRoots } from "@/core/persistence/StorageRoots.ts";
import type { ProjectsService } from "@/core/persistence/WorkspaceService.ts";

const NATIVE_DIRECTORY_IMPORT_PROGRESS_EVENT =
    "native-directory-import-progress";

/**
 * Normalize Tauri dialog return values into the single-path shape the rest of
 * the import adapter expects.
 */
function normalizeSelection(
    selection: string | string[] | null,
): string | null {
    if (selection == null) return null;
    return Array.isArray(selection) ? (selection[0] ?? null) : selection;
}

/**
 * Desktop import adapter.
 *
 * Unlike web import, desktop can keep folder/zip handling fully native. This
 * adapter therefore focuses on orchestration: select a native path, invoke the
 * Rust import/finalization commands, stream progress back to the UI, then hand
 * the finished managed path to the indexing/import service.
 */
export class TauriImportService implements ImportService {
    constructor(
        private readonly roots: StorageRoots,
        private readonly projectsService: ProjectsService,
        private readonly fileSystem: FileSystem,
    ) {}

    /**
     * Open a native directory picker and return the chosen source path.
     */
    async pickDirectory(
        options?: NativeImportSelectionOptions,
    ): Promise<string | null> {
        const selection = await tauriOpen({
            directory: true,
            multiple: false,
            title: options?.title,
        });
        return normalizeSelection(selection);
    }

    /**
     * Open a native zip picker and return the chosen source path.
     */
    async pickZip(
        options?: NativeImportSelectionOptions,
    ): Promise<string | null> {
        const selection = await tauriOpen({
            directory: false,
            multiple: false,
            title: options?.title,
            filters: [{ name: "Zip", extensions: ["zip"] }],
        });
        return normalizeSelection(selection);
    }

    /**
     * Run the Rust-side "finalize import" step after native copy/extract.
     *
     * This is where desktop finishes type-specific storage shaping such as TN
     * packing after the raw bytes have already been materialized in managed
     * storage.
     */
    private async finalizeImportedResource(
        resourcePath: string,
        progressEvent: string,
        options?: ImportProjectOptions,
    ): Promise<void> {
        await invoke("finalize_imported_resource", {
            resourcePath,
            progressEvent,
        }).catch(async (error) => {
            await options?.onProgress?.(
                createImportProgressUpdate(
                    ImportProgressPhase.FAILED,
                    error instanceof Error ? error.message : String(error),
                ),
            );
            throw error;
        });
    }

    /**
     * Import a native directory path into managed storage without routing file
     * contents through the webview.
     */
    async importFolder(
        source: ImportFolderSource,
        options?: ImportProjectOptions,
    ): Promise<ImportSourceResult> {
        if (source.kind !== "path") {
            throw new Error(
                "Tauri import service only supports path-based folder imports.",
            );
        }

        const progressEvent = `${NATIVE_DIRECTORY_IMPORT_PROGRESS_EVENT}:${crypto.randomUUID()}`;
        let importedPath: string | null = null;
        const unlisten = await listen<ImportProgressUpdate>(
            progressEvent,
            async (event) => {
                await options?.onProgress?.(event.payload);
            },
        );

        try {
            importedPath = await invoke<string>(
                "import_copy_directory_to_managed_storage",
                {
                    sourcePath: source.path,
                    projectsRoot: this.roots.projectsRoot,
                    progressEvent,
                },
            );
            await this.finalizeImportedResource(
                importedPath,
                progressEvent,
                options,
            );

            return await this.projectsService.importProject(
                {
                    type: "fromPreparedDir",
                    directoryPath: importedPath,
                },
                options,
            );
        } catch (error) {
            if (importedPath) {
                try {
                    await this.fileSystem.remove(importedPath, {
                        recursive: true,
                    });
                } catch (cleanupError) {
                    console.error(
                        "Failed to clean up partially imported native directory",
                        cleanupError,
                    );
                }
            }
            throw error;
        } finally {
            unlisten();
        }
    }

    /**
     * Import a native archive path into managed storage and finalize it there.
     */
    async importZip(
        source: ImportZipSource,
        options?: ImportProjectOptions,
    ): Promise<ImportSourceResult> {
        if (source.kind !== "path") {
            throw new Error(
                "Tauri import service only supports path-based zip imports.",
            );
        }

        const progressEvent = `${NATIVE_DIRECTORY_IMPORT_PROGRESS_EVENT}:${crypto.randomUUID()}`;
        let importedPath: string | null = null;
        const unlisten = await listen<ImportProgressUpdate>(
            progressEvent,
            async (event) => {
                await options?.onProgress?.(event.payload);
            },
        );

        try {
            await options?.onProgress?.(
                createImportProgressUpdate(
                    ImportProgressPhase.READ_SOURCE,
                    `Reading staged archive ${source.path.split(/[\\/]/u).at(-1) ?? source.path}...`,
                ),
            );
            importedPath = await invoke<string>(
                "import_extract_zip_to_managed_storage",
                {
                    archivePath: source.path,
                    projectsRoot: this.roots.projectsRoot,
                    tempRoot: this.roots.tempRoot,
                    progressEvent,
                },
            );
            await this.finalizeImportedResource(
                importedPath,
                progressEvent,
                options,
            );

            return await this.projectsService.importProject(
                {
                    type: "fromPreparedDir",
                    directoryPath: importedPath,
                },
                options,
            );
        } catch (error) {
            if (importedPath) {
                try {
                    await this.fileSystem.remove(importedPath, {
                        recursive: true,
                    });
                } catch (cleanupError) {
                    console.error(
                        "Failed to clean up partially imported native archive",
                        cleanupError,
                    );
                }
            }
            throw error;
        } finally {
            await unlisten();
        }
    }

    /**
     * Download a remote archive natively, then reuse the same finalization path
     * as local archive import.
     */
    async importRemoteZip(
        source: ImportSource,
        options?: ImportProjectOptions,
    ): Promise<ImportSourceResult> {
        if (source.type !== "fromGitRepo") {
            throw new Error(
                `Native remote import only supports remote archive sources, received ${source.type}.`,
            );
        }

        const progressEvent = `${NATIVE_DIRECTORY_IMPORT_PROGRESS_EVENT}:${crypto.randomUUID()}`;
        let importedPath: string | null = null;
        const unlisten = await listen<ImportProgressUpdate>(
            progressEvent,
            async (event) => {
                await options?.onProgress?.(event.payload);
            },
        );

        try {
            importedPath = await invoke<string>(
                "import_download_remote_archive_to_managed_storage",
                {
                    url: source.url,
                    projectsRoot: this.roots.projectsRoot,
                    tempRoot: this.roots.tempRoot,
                    progressEvent,
                },
            );
            await this.finalizeImportedResource(
                importedPath,
                progressEvent,
                options,
            );

            return await this.projectsService.importProject(
                {
                    type: "fromPreparedDir",
                    directoryPath: importedPath,
                },
                options,
            );
        } catch (error) {
            if (importedPath) {
                try {
                    await this.fileSystem.remove(importedPath, {
                        recursive: true,
                    });
                } catch (cleanupError) {
                    console.error(
                        "Failed to clean up partially imported native remote resource",
                        cleanupError,
                    );
                }
            }
            throw error;
        } finally {
            await unlisten();
        }
    }
}
