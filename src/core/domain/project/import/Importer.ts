import type { IDirectoryHandle } from "@/core/io/IDirectoryHandle.ts";
import type { IFileHandle } from "@/core/io/IFileHandle.ts";
import type { IPathHandle } from "@/core/io/IPathHandle.ts";

/**
 * Backwards-compatible minimal Importer interface.
 *
 * Many existing importers and call-sites in the codebase currently reference
 * this simple interface which exposes a single `import(path: string)` method.
 *
 * Leave this in place so existing implementations that only implement this
 * shape continue to type-check until they are migrated.
 */
export interface Importer {
    /**
     * Import something identified by a string `path`.
     * Historically this has been used for URLs, temporary paths, or other
     * ad-hoc identifiers depending on the concrete importer implementation.
     *
     * Return the path of the imported project on success, null on failure.
     */
    import(path: string): Promise<string | null>;
}

/**
 * A richer, explicit ProjectImporter interface intended as the long-term
 * replacement for `Importer`.
 *
 * It centralizes import entry points so consumers (and implementations)
 * have a single surface to call and so that common post-processing
 * (e.g. creating/updating metadata views, sqlite indices, etc.) can be
 * performed in one place after any kind of import completes.
 *
 * Implementers MAY implement only a subset of these methods. Callers should
 * pick the most specific method available. To remain backwards-compatible,
 * `import(path: string)` is still present and should map to one of the
 * more explicit methods for new implementations.
 */
export interface ProjectImporter {
    /**
     * Backwards-compatible import method. Implementations of the newer
     * interface should map this to an appropriate concrete method
     * (for example, interpret the string as a URL and delegate to
     * `importFromWacs`, or treat it as a temp-file name and call
     * `importFromFile`).
     */
    import(path: string): Promise<boolean>;

    /**
     * Import a project from a remote WACS-style URL (zip archive).
     * Typical callers: UI "download repo" flows.
     */
    importFromWacs(url: string): Promise<boolean>;

    /**
     * Import a project from a staged local ZIP file represented as an
     * `IFileHandle`. Typical callers: file picker -> staged temp file.
     */
    importFromFile(fileHandle: IFileHandle): Promise<boolean>;

    /**
     * Import a project from an already-unzipped directory handle.
     * Typical callers: directory picker flows where the user selected
     * a project folder on disk (or a temporary staging folder).
     */
    importFromDirectory(dirHandle: IDirectoryHandle): Promise<boolean>;

    /**
     * Import from a generic path handle (either file or directory).
     * Implementations can inspect the handle and dispatch to the
     * appropriate copying/extraction logic.
     */
    importFromPathHandle(pathHandle: IPathHandle): Promise<boolean>;
}
