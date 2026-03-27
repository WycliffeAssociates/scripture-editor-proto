/**
 * App-facing discriminant for loaded library items.
 *
 * `type` is the primary noun seam used by UI and app modules. Import decides
 * storage shape by type, loaders return a typed noun by type, and UI narrows
 * once by type before using noun-specific verbs.
 */
export type LibraryItemType = "usfmScripture" | "translationNotes";

/**
 * Catalog-level type taxonomy stored by the index.
 *
 * The index sometimes needs to represent managed items the current app cannot
 * fully reopen as a richer typed noun yet. Those rows still use the same
 * `type` field, but the catalog broadens the union so list screens can group
 * them without introducing a second app-facing classification axis.
 */
export type IndexedLibraryItemType =
    | LibraryItemType
    | "translationWords"
    | "genericMarkdownCollection"
    | "other"
    | "unknown";
