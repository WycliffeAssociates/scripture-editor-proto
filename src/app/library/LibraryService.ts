import type { ImportSource } from "@/core/domain/project/import/ProjectImporter.ts";
import type {
    ImportFolderSource,
    ImportOptions,
    ImportResult,
    ImportZipSource,
} from "@/core/library/ImportService.ts";
import type { LibraryItem } from "@/core/library/LibraryItem.ts";
import type { ContainerFormat } from "@/core/library/LibraryItemCapabilities.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type { ResourceLibraryItem } from "@/core/library/ProjectIndex.ts";

/**
 * Normalized library row returned by the app-level library seam.
 *
 * This is a catalog view over managed disk content. Full content still comes
 * from the load phase via `openItem`. The point of this row is to let list
 * screens answer "what exists?" and "what affordances should we show?" without
 * reloading every item body from disk.
 */
export type IndexedLibraryItem = {
    managedPath: string;
    displayName: string;
    type: IndexedLibraryItemType;
    containerFormat: ContainerFormat;
    isEditable: boolean;
    hasRemoteSync: boolean;
    languageCode: string;
    languageName: string;
};

/**
 * Generic top-level app seam for the local library.
 *
 * This layer orchestrates listing, opening, importing, and reconciling managed
 * items. It stays generic. Type-specific narrowing belongs in `app/scripture`
 * or `app/reference`, and type-specific verbs belong on the loaded noun.
 */
export interface LibraryService {
    /**
     * Return the full library catalog as lightweight rows.
     */
    listLibraryItems(): Promise<IndexedLibraryItem[]>;
    /**
     * Return the subset that the current UI should treat as editable/current
     * workspaces.
     */
    listCurrentProjects(): Promise<IndexedLibraryItem[]>;
    /**
     * Reopen one managed path as a typed noun.
     *
     * Callers should narrow once on `item.type`, then hand the noun to
     * type-specific hooks/components instead of branching throughout the UI.
     */
    openItem(itemRef: string): Promise<LibraryItem | null>;
    importFolder(
        source: ImportFolderSource,
        options?: ImportOptions,
    ): Promise<ImportResult>;
    importZip(
        source: ImportZipSource,
        options?: ImportOptions,
    ): Promise<ImportResult>;
    importRemoteZip(
        source: ImportSource,
        options?: ImportOptions,
    ): Promise<ImportResult>;
    reconcileIndex(): Promise<void>;
}

/**
 * Convert persisted index facts into the generic library-row shape used by
 * app-level listing screens.
 *
 * This intentionally derives app-facing `type` and affordances from normalized
 * disk facts rather than duplicating richer loader/runtime objects in Dexie.
 */
export function toIndexedLibraryItem(
    item: ResourceLibraryItem,
): IndexedLibraryItem | null {
    return {
        managedPath: item.projectPath,
        displayName: item.displayName,
        type: item.type,
        containerFormat: item.containerFormat,
        isEditable: item.isEditable,
        hasRemoteSync: item.hasRemoteSync,
        languageCode: item.languageCode,
        languageName: item.languageName,
    };
}
