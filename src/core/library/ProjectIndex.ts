import type { LibraryItem } from "@/core/library/LibraryItem.ts";
import type { ContainerFormat } from "@/core/library/LibraryItemCapabilities.ts";
import type { IndexedLibraryItemType } from "@/core/library/LibraryItemType.ts";
import type {
    ScriptureWorkspace,
    ScriptureWorkspaceListItem,
} from "@/core/persistence/ScriptureWorkspace.ts";

/**
 * UI-facing grouping for indexed library items.
 *
 * The index reflects normalized facts discovered from disk. It does not
 * duplicate file trees or content bodies.
 */
export type ResourceLibraryGroup =
    | "scripture"
    | "translation-notes"
    | "translation-words"
    | "other";

/**
 * Normalized catalog facts stored by the index layer.
 *
 * These rows mirror on-disk truth just enough for listing and filtering. Full
 * content still comes from the load pipeline.
 */
export type ResourceLibraryItem = ScriptureWorkspaceListItem & {
    type: IndexedLibraryItemType;
    containerFormat: ContainerFormat;
    isEditable: boolean;
    hasRemoteSync: boolean;
    libraryGroup: ResourceLibraryGroup;
};

/**
 * Predicate for the "current projects" view.
 *
 * Editable scripture remains a capability-driven subset of the broader library
 * rather than a separate top-level domain.
 */
export function isEditableScriptureProjectLibraryItem(
    item: Pick<ResourceLibraryItem, "type" | "isEditable">,
): boolean {
    return item.type === "usfmScripture" && item.isEditable;
}

/**
 * Index contract for the library catalog.
 *
 * Implementations such as Dexie store normalized facts derived from managed
 * disk state. The index is a fast catalog over managed files, not a second file
 * system and not a content store.
 */
export interface ProjectIndex {
    listProjects(): Promise<ScriptureWorkspaceListItem[]>;
    listLibraryItems(): Promise<ResourceLibraryItem[]>;
    getProjectByPath(
        projectPath: string,
    ): Promise<ScriptureWorkspaceListItem | null>;
    getLibraryItemByPath(
        projectPath: string,
    ): Promise<ResourceLibraryItem | null>;
    indexItem(item: LibraryItem | ScriptureWorkspace): Promise<void>;
    renameDisplayName(projectPath: string, displayName: string): Promise<void>;
    deleteProject(projectPath: string): Promise<void>;
}
