import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type { ProjectListItem } from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * High-level phases surfaced by the import pipeline.
 *
 * Import is the storage-shaping phase of the architecture. It reads incoming
 * bytes or native paths, branches by app-facing type, and writes the final
 * managed on-disk shape.
 */
export const ImportProgressPhase = {
    SELECT_SOURCE: "select-source",
    READ_SOURCE: "read-source",
    COPY_CONTENT: "copy-content",
    EXTRACT_ARCHIVE: "extract-archive",
    RESHAPE_RESOURCE: "reshape-resource",
    INSPECT_RESOURCE: "inspect-resource",
    INDEX_RESOURCE: "index-resource",
    COMPLETE: "complete",
    FAILED: "failed",
} as const;

export type ImportProgressPhase =
    (typeof ImportProgressPhase)[keyof typeof ImportProgressPhase];

/**
 * User-facing progress payload emitted while import is still shaping storage.
 *
 * These messages intentionally describe pipeline phases the user can
 * understand: selecting input, reading bytes, copying, reshaping, indexing.
 * Once import completes, callers transition to the separate load/open phase.
 */
export type ImportProgressUpdate = {
    phase: ImportProgressPhase;
    message: string;
    current?: number;
    total?: number;
    itemType?: IndexedLibraryItemType;
};

export type ImportProgressReporter = (
    update: ImportProgressUpdate,
) => void | Promise<void>;

/**
 * Stable result returned by import after managed storage has been written.
 *
 * Import does not return a live runtime noun. The load phase is responsible for
 * turning a managed path into a typed item.
 */
export type ImportProjectResult = {
    project: ProjectListItem;
    gitReady: boolean;
    isEditableProject: boolean;
    warning?: string;
};

export type ImportProjectOptions = {
    onProgress?: ImportProgressReporter;
};

/**
 * Native picker hints for desktop-only source selection.
 *
 * Web ignores these because source selection is browser-driven there.
 */
export type NativeImportSelectionOptions = {
    title?: string;
};

/**
 * Source already represented by a native path on the local machine.
 *
 * Desktop import prefers this shape because it lets Rust/Tauri own the heavy
 * file work without pushing bytes back through the webview.
 */
export type ImportPathSource = {
    kind: "path";
    path: string;
};

/**
 * Source represented by a browser directory selection.
 *
 * Web import receives a `FileList`, classifies metadata while those files are
 * still in memory, then writes the final managed disk shape.
 */
export type ImportBrowserDirectorySource = {
    kind: "files";
    folderName: string;
    files: FileList;
};

/**
 * Source represented by a single browser-provided archive file.
 */
export type ImportBrowserFileSource = {
    kind: "file";
    file: File;
};

export type ImportFolderSource =
    | ImportPathSource
    | ImportBrowserDirectorySource;
export type ImportZipSource = ImportPathSource | ImportBrowserFileSource;

export type ImportSourceResult = ImportProjectResult;
export type ImportResult = ImportProjectResult;
export type ImportOptions = ImportProjectOptions;

/**
 * Small helper so every import implementation emits a consistent payload shape.
 *
 * This exists because import is surfaced in multiple platform adapters and UI
 * entrypoints; keeping the payload builder shared avoids drift in the progress
 * contract.
 */
export function createImportProgressUpdate(
    phase: ImportProgressPhase,
    message: string,
    details?: Omit<ImportProgressUpdate, "phase" | "message">,
): ImportProgressUpdate {
    return {
        phase,
        message,
        ...details,
    };
}

export async function emitImportProgress(
    onProgress: ImportProgressReporter | undefined,
    phase: ImportProgressPhase,
    message: string,
    details?: Omit<ImportProgressUpdate, "phase" | "message">,
): Promise<void> {
    await onProgress?.(createImportProgressUpdate(phase, message, details));
}

/**
 * Convenience predicate for callers that need to know when import can stop
 * showing a progress affordance.
 */
export function isTerminalImportProgressPhase(
    phase: ImportProgressPhase,
): boolean {
    return (
        phase === ImportProgressPhase.COMPLETE ||
        phase === ImportProgressPhase.FAILED
    );
}

/**
 * Platform-specific import interface.
 *
 * Implementations on web and desktop may acquire bytes differently, but both
 * must honor the same architectural contract: branch while the source is still
 * incoming, write managed disk shape, and return stable metadata.
 */
export interface ImportService {
    /**
     * Ask the host platform to select a directory, if that platform supports
     * native path picking.
     */
    pickDirectory?(
        options?: NativeImportSelectionOptions,
    ): Promise<string | null>;
    /**
     * Ask the host platform to select a zip file, if that platform supports
     * native path picking.
     */
    pickZip?(options?: NativeImportSelectionOptions): Promise<string | null>;

    /**
     * Import a directory-like source into managed storage.
     *
     * This is the point where import must branch by app-facing type and write
     * final disk shape, not merely copy bytes blindly.
     */
    importFolder(
        source: ImportFolderSource,
        options?: ImportProjectOptions,
    ): Promise<ImportSourceResult>;
    /**
     * Import an archive-like source into managed storage.
     */
    importZip(
        source: ImportZipSource,
        options?: ImportProjectOptions,
    ): Promise<ImportSourceResult>;
    /**
     * Import a remote archive source into managed storage.
     *
     * The remote fetch/download still belongs to import because the caller has
     * not crossed into the load phase yet.
     */
    importRemoteZip(
        source: ImportSource,
        options?: ImportProjectOptions,
    ): Promise<ImportSourceResult>;
}
