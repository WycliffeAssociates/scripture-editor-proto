import type { TranslationNotesItem } from "@/core/library/items/TranslationNotesItem.ts";
import type { UsfmScriptureItem } from "@/core/library/items/UsfmScriptureItem.ts";
import type {
    AnchorNavigationCapability,
    LibraryItemCapabilities,
    RemoteSyncCapability,
} from "@/core/library/LibraryItemCapabilities.ts";

export type * from "@/core/library/items/TranslationNotesItem.ts";
export type * from "@/core/library/items/UsfmScriptureItem.ts";
export type * from "@/core/library/LibraryItemCapabilities.ts";
export type * from "@/core/library/LibraryItemType.ts";

/**
 * Canonical app-facing loaded noun.
 *
 * The import pipeline writes managed disk shape by type. The load pipeline then
 * returns a typed noun from that managed path. UI should narrow once by
 * `item.type`, then call noun-specific verbs directly.
 */
export type LibraryItem = UsfmScriptureItem | TranslationNotesItem;

/**
 * Narrow a generic loaded item to the editable scripture noun.
 */
export function isUsfmScriptureItem(
    item: LibraryItem,
): item is UsfmScriptureItem {
    return item.type === "usfmScripture";
}

/**
 * Narrow a generic loaded item to the Translation Notes noun.
 */
export function isTranslationNotesItem(
    item: LibraryItem,
): item is TranslationNotesItem {
    return item.type === "translationNotes";
}

/**
 * Editable is an affordance layered onto a typed noun. Today only scripture items
 * expose it, but the guard is phrased in capability terms so future editors can
 * opt in without changing the top-level library seam.
 */
export function isEditableItem(item: LibraryItem): item is UsfmScriptureItem & {
    capabilities: LibraryItemCapabilities & { editableWith: "usfmScripture" };
} {
    return item.capabilities.editableWith === "usfmScripture";
}

/**
 * Predicate for items that can fetch/apply upstream updates from a remembered
 * remote source.
 */
export function isRemoteSyncCapable(item: LibraryItem): item is LibraryItem & {
    capabilities: LibraryItemCapabilities & {
        remoteSync: RemoteSyncCapability;
    };
} {
    return item.capabilities.remoteSync?.kind === "remoteSync";
}

/**
 * Predicate for items that can resolve a scripture anchor into one or more
 * browseable reference documents.
 */
export function isAnchorNavigationCapable(
    item: LibraryItem,
): item is LibraryItem & {
    capabilities: LibraryItemCapabilities & {
        anchorNavigation: AnchorNavigationCapability;
    };
} {
    return item.capabilities.anchorNavigation?.kind === "anchorNavigation";
}
