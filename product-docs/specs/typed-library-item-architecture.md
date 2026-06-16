# Typed Library Item Architecture

Status: Accepted
Date: 2026-03-25
Supersedes: `product-docs/specs/base-resource-project-architecture.md` (2026-03-23)

## Context

The app needs to support multiple resource types beyond editable scripture workspaces. The previous `BaseResource / Project` two-layer model established a useful read-only boundary, but the terminology and contract shapes have since been clarified through implementation. This ADR captures the resulting architecture as the single governing source of truth.

The core mistake to avoid is making every local resource look like a scripture project. `LibraryItem` is the generic typed contract; scripture is one kind of library item, not the top-level noun.

## Decision

### The Four Layers

The system is organized into four distinct layers:

1. **Managed files** — Raw on-disk storage in app-controlled directories.
2. **Import** — Reads incoming source metadata, decides storage strategy, writes managed shape. Returns stable metadata.
3. **Loader** — Reads managed paths, returns typed `LibraryItem` runtime objects.
4. **App / Library UI** — Uses `LibraryItem` directly; branches by `type`; derives affordances from `capabilities`.

### LibraryItem as the Canonical Typed Contract

`LibraryItem` is the primary app-facing contract for all addressable local content.

```typescript
type LibraryItemType = "usfmScripture" | "translationNotes";

type LibraryItem = UsfmScriptureItem | TranslationNotesItem;

type LibraryItemBase = {
  id: string;
  displayName: string;
  managedPath: string;
  containerFormat: ContainerFormat;
  language: { code: string; name: string; direction: "ltr" | "rtl" };
  capabilities: LibraryItemCapabilities;
};
```

### ContainerFormat Is Storage Metadata Only

`ContainerFormat` describes how an item is packed on disk. It is **not** a UI branching seam.

```typescript
type ContainerFormat = "resource-container" | "scripture-burrito";
```

Import fails if it cannot establish one of these formats from source metadata. Loaders use this to select the appropriate parsing strategy.

### `type` Is the Sole UI Branching Discriminant

All UI branching, filtering, and display logic uses `item.type`:

```typescript
switch (item.type) {
    case "usfmScripture":
        return <ScriptureEditor item={item} />;
    case "translationNotes":
        return <TranslationNotesPane item={item} />;
}
```

Do NOT branch on `containerFormat` in UI code.

### Capabilities Determine App Behavior

`capabilities` describe what the app may do with an item. They are computed from disk metadata and item kind, not user-configurable.

```typescript
type LibraryItemCapabilities = {
  editableWith?: "usfmScripture";
  remoteSync?: RemoteSyncCapability;
  anchorNavigation?: AnchorNavigationCapability;
};
```

The `isEditableItem()` guard checks `capabilities.editableWith === "usfmScripture"`.

## Examples

### Scripture project

An editable USFM workspace such as `en_ulb`:

- `type`: `"usfmScripture"`
- `containerFormat`: `"scripture-burrito"` or `"resource-container"`
- `capabilities.editableWith`: `"usfmScripture"`
- `capabilities.remoteSync`: present if git remote is configured

This is the only shape that should flow through the main scripture editing workspace.

### Translation Notes

An `en_tn_condensed` resource:

- `type`: `"translationNotes"`
- `containerFormat`: `"resource-container"` or packed per-book JSON
- `capabilities.editableWith`: absent
- `capabilities.anchorNavigation`: present (resolves scripture references)
- `capabilities.remoteSync`: present if origin metadata exists

TN is the first shipped non-scripture renderer. The reference panel reads it, resolves anchors, and displays notes. The main workspace must not treat it as editable scripture.

## Import Flow

Import is **storage-shaping only**. It decides the on-disk layout from incoming source metadata, then returns stable metadata for indexing.

```typescript
type ImportResult = {
  item: {
    id: string;
    displayName: string;
    managedPath: string;
    type: LibraryItemType;
  };
  isEditableProject: boolean;
  gitReady: boolean;
  warning?: string;
};
```

Import does NOT return a live `LibraryItem` runtime object.

### Import Decision Table

| Source metadata           | `type`               | Storage shape                           |
| ------------------------- | -------------------- | --------------------------------------- |
| USFM + Bible subject      | `"usfmScripture"`    | Preserve source; scaffold git if needed |
| Translation Notes markers | `"translationNotes"` | Pack to per-book JSON                   |

Import fails if source cannot be classified as one of the two supported types.

## Loader Flow

Loaders are **path-in, typed-item-out**. They read on-disk metadata and return `LibraryItem` runtime objects.

```
managed path → loader → LibraryItem
```

The `ItemLoader` orchestrator detects container format and delegates to the appropriate format-specific loader.

```typescript
interface IItemLoader {
  openItem(args: {
    fs: FileSystem;
    managedPath: string;
    displayName: string;
  }): Promise<LibraryItem | null>;
}
```

Loaders verify on-disk truth when opening items, even when `type` is already known from an index row.

## Index / Dexie Layer

Dexie stores **normalized catalog facts** — enough for listing and filtering. It does NOT store content bodies or duplicate on-disk structure.

```typescript
type IndexedLibraryItem = {
  managedPath: string;
  displayName: string;
  type: LibraryItemType;
  containerFormat: ContainerFormat;
  isEditable: boolean;
  hasRemoteSync: boolean;
  languageCode: string;
  languageName: string;
};
```

`isEditable` is **computed from capabilities** — it is not a separate flag with its own logic.

### What Dexie Stores

- managed path, display name, type, container format
- language metadata
- computed affordances (`isEditable`, `hasRemoteSync`)

### What Dexie Does NOT Store

- TN chapter/verse bodies
- scripture book contents
- copied root/support file contents
- reconstructed file trees

### Reconcile Model

```typescript
async function reconcileIndex(): Promise<void> {
  // list managed roots on disk
  // remove stale rows whose paths are gone
  // for existing paths, rebuild normalized indexed facts from disk truth
}
```

The index is a fast catalog, not a shadow file system.

## LibraryService

`LibraryService` is the Dexie-first read layer. It does not load content — it returns catalog rows and delegates to loaders for content.

```typescript
interface LibraryService {
  getItem(ref: string): Promise<LibraryItem | null>;
  getItems(): Promise<IndexedLibraryItem[]>;
  getItemsByType(type: LibraryItemType): Promise<IndexedLibraryItem[]>;
}
```

`listCurrentProjects()` is a filter on `getItems()`, not a separate domain type:

```typescript
const editableItems = (await library.getItems()).filter(
  (item) => item.isEditable,
);
```

## Non-goals

This architecture does not include:

- TN as an editable resource
- a TW renderer
- a reference-resource update UI
- remote update application for read-only resources
- generic writable resources outside scripture projects
- multi-resource stacked reference panel

## Consequences

- New read-only resource types fit into `LibraryItem` without pretending to be scripture projects.
- Scripture-specific editing behavior stays isolated behind `UsfmScriptureItem` verbs.
- The reference panel can grow independently of the main editor.
- `containerFormat` does not leak into UI branching logic.

## Migration Stance

Existing `ProjectsService` callers migrate toward `LibraryService` through adapters rather than broadening the old interface in place.

Practical rules:

- if a feature needs book/chapter editing, use `UsfmScriptureItem`
- if a feature only needs to read or browse content, start from `LibraryItem`
- if a feature needs scripture lookup but not editing, add a capability instead of widening the base interface

## Code Pointers

Core contracts:

- `src/core/library/LibraryItem.ts` — `LibraryItem`, `LibraryItemType`, `LibraryItemCapabilities`
- `src/core/loading/IItemLoader.ts` — loader interface
- `src/core/loading/ItemLoader.ts` — orchestrator
- `src/core/library/ImportService.ts` — import result type
- `src/core/library/ProjectIndex.ts` — index row shape
- `src/app/library/LibraryService.ts` — Dexie-first service
- `src/core/domain/project/ResourceContainerProjectLoader.ts` — format-specific parsing
- `src/core/domain/project/ScriptureBurritoProjectLoader.ts` — format-specific parsing

Removed (migration complete):

- `src/core/domain/project/baseResourceLoading.ts` — absorbed into loader stack
- `src/core/persistence/BaseResource.ts` — historical, deleted
- `src/core/persistence/LoadedBaseResource.ts` — transitional waypoint, deleted
