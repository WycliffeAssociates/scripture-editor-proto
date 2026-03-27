import type { LibraryItem } from "@/core/library/LibraryItem.ts";
import type { FileSystem } from "@/core/persistence/FileSystem.ts";

/**
 * Minimal loader input once import has already written managed storage.
 *
 * Loader callers should already know "this path lives in managed storage and is
 * worth attempting to open". They should not be passing browser `File`s,
 * remote URLs, or temp extraction state here; those belong to import.
 */
export interface IItemLoaderArgs {
    fs: FileSystem;
    managedPath: string;
    displayName: string;
}

/**
 * Path-in, typed-noun-out loader contract.
 *
 * Implementations should follow this pipeline:
 * 1. detect container format from managed disk
 * 2. parse container metadata
 * 3. resolve app-facing `type`
 * 4. build the typed noun returned to the app
 *
 * That means a loader explains "what is already on disk?" It should not do any
 * import-time reshaping, temp staging, or UI-specific branching.
 */
export interface IItemLoader {
    openItem(args: IItemLoaderArgs): Promise<LibraryItem | null>;
}
