# Typed Item Refactor From Open Epics

## Table of Contents
- [Problem](#problem)
- [Graph Read](#graph-read)
- [Goals](#goals)
- [Non-Goals](#non-goals)
- [Open Epics In Scope](#open-epics-in-scope)
- [Current Touchpoints](#current-touchpoints)
- [Proposed File Tree](#proposed-file-tree)
- [Main Types and Interfaces](#main-types-and-interfaces)
- [Primary Flows](#primary-flows)
- [Function Stubs](#function-stubs)
- [Dexie Reflection Rules](#dexie-reflection-rules)
- [Testing Shape](#testing-shape)
- [Risks and Open Questions](#risks-and-open-questions)
- [Suggested Implementation Slices](#suggested-implementation-slices)

## Problem
The repo is in a transitional state between an older `BaseResource / Project` model and a newer typed-item architecture.

What the application wants is simpler than the current seams suggest:
- disk stores files
- import decides managed on-disk shape from metadata
- loaders read managed paths and return typed app-facing objects
- UI branches once by `type`
- capabilities answer affordances such as editability or remote sync

The current code still exposes mixed-era seams such as:
- `ProjectsService` as the top-level app seam
- `IProjectLoader.openProject()` vs `openResource()`
- `LoadedBaseResource` with ad hoc partial capabilities
- `resourceKind` alongside `projectType`

The six open epics are the cleanup path from that transitional state to the intended architecture.

## Graph Read
Current `bv` state on March 25, 2026:
- `bv --robot-triage` shows `scripture-editor-proto-2-0fx` as the single actionable root bead.
- `bv --robot-plan` shows one active track only.
- The graph is intentionally bottlenecked on the contract decision.

Interpretation:
1. The system should not start with service/UI churn.
2. The typed-item contract bead is the choke point because every later loader, service, index, and UI bead depends on the naming and union shape.
3. This pseudocode should be read as guidance for all six epics, but especially for the `0fx -> cdb -> u4h / ipv / gsv` opening sequence.

## Goals
- Collapse app-facing classification into one `type` discriminant.
- Keep `containerFormat` as storage metadata only.
- Keep import and load as different phases with different responsibilities.
- Make loader outputs type-specific enough that UI code does not broad-branch internally.
- Make Dexie reflect disk truth without becoming a second file system.
- Preserve current scripture editing behavior while making TN a first-class typed runtime.
- Keep the new ADR as the single active architecture source of truth.

## Non-Goals
- Do not redesign route structure in this wave.
- Do not invent a universal `read()` / `write()` content interface.
- Do not make TN editable yet.
- Do not duplicate note bodies or scripture content into Dexie.
- Do not support imports without proper RC or Burrito metadata.

## Open Epics In Scope
1. `scripture-editor-proto-2-tuf`
   Clarify typed loaded-item core model and capability boundaries.
   - Closes when: `0fx` + `cdb` + `0o3` complete
2. `scripture-editor-proto-2-3j7`
   Clarify import as metadata-first storage shaping.
   - Closes when: `ipv` + `u2r` + `gsv` complete
3. `scripture-editor-proto-2-fat`
   Make loaders path-in and typed-contract-out.
   - Closes when: `u4h` + `dpz` + `lg5` complete
4. `scripture-editor-proto-2-d39`
   Replace scripture-era service framing with a library seam.
   - Closes when: `l0u` + `dmx` + `da8` complete
5. `scripture-editor-proto-2-26j`
   Cut the UI over to typed items and capability-driven affordances.
   - Closes when: `oss` + `11t` + `x6r` complete
6. `scripture-editor-proto-2-kxi`
   Verify, harden, and clean up the typed-item architecture.
   - Closes when: `6tn` + `12t` complete

## Full Dependency Graph

The graph forms a DAG with multi-parent joins. Key parallelization opportunities:

```
ROOT: 0fx (single actionable, robot-triage P0)
 │
 ├──> cdb ──────────────────────────────────────────────────┐
 │    │                                                     │
 │    ├──> u4h ──> dpz ──> lg5 ────────────────────────────┴─> fat epic
 │    │                                  (loader track)           │
 │    ├──> ipv ──> u2r ──┐                                      │
 │    │  (import track)  │                                      │
 │    └──> 0o3 ──────────┴────────────────────────────────────> tuf epic
 │         (ADR doc)                                              │
 │                                                               │
 ├──> gsv ───────────────────────────────────────────────────────┤
 │                                                             │
 └──> l0u (waits for u4h AND gsv AND 0fx) ──> dmx ──> da8 ────> d39 epic
                                                       (service track)
                                                              │
                                                              └─> oss ──> 11t ──> x6r ──> 26j epic
                                                              (UI track)

kxi epic (verify/harden): depends on all implementation epics closed
  └─> 6tn (regression coverage - no dep on prior slices, runs final)
  └─> 12t (transitional adapter cleanup - waits for 6tn)
```

Note: `gsv` has two parents (`u2r` and `cdb`) - it unblocks when BOTH `u2r` completes AND `cdb` is done. `l0u` has three parents (`u4h`, `gsv`, `0fx`) - it unblocks only when all three complete.

## Current Touchpoints
These are the main seams the pseudocode is organizing around:

```text
src/core/persistence/BaseResource.ts
src/core/persistence/LoadedBaseResource.ts
src/core/persistence/BaseResourceCapabilities.ts
src/core/persistence/ProjectsService.ts
src/core/persistence/ImportService.ts

src/core/domain/project/IProjectLoader.ts
src/core/domain/project/ProjectLoader.ts
src/core/domain/project/ResourceContainerProjectLoader.ts
src/core/domain/project/ScriptureBurritoProjectLoader.ts

src/core/persistence/TranslationNotes.ts

src/app/persistence/DefaultProjectsService.ts
src/app/ui/hooks/useReferenceProject.tsx
src/app/ui/components/blocks/ReferenceEditor.tsx

src/app/domain/reference/translationNotes.ts
src/app/ui/hooks/useSave.tsx

src/app/persistence/DexieProjectIndex.ts
src/core/persistence/ProjectIndex.ts

product-docs/specs/base-resource-project-architecture.md
```

Current fault lines:
- `ProjectsService` is already broader than its name.
- `IProjectLoader` still exposes separate `openProject()` and `openResource()` worlds.
- `LoadedBaseResource` is a transitional shape.
- TN runtime still has app-layer logic that wants raw markdown rendering, not custom parsed sections.
- Burrito and RC loaders still carry duplicated higher-level object assembly.

## Proposed File Tree
This should be read as the target shape and naming direction, not just loose boundary hints.

```text
src/core/library/
  LibraryItem.ts
  LibraryItemCapabilities.ts
  LibraryItemType.ts
  ProjectIndex.ts
  ImportService.ts
  items/
    UsfmScriptureItem.ts
    TranslationNotesItem.ts
  stores/
    PackedTranslationNotesRepository.ts

src/core/loading/
  IItemLoader.ts
  ItemLoader.ts
  container/
    loadResourceContainer.ts
    loadScriptureBurrito.ts
  builders/
    buildUsfmScriptureItem.ts
    buildTranslationNotesItem.ts

src/app/library/
  LibraryService.ts
  DefaultLibraryService.ts
  internal/
    import.ts
    reconcile.ts
    sync.ts

src/app/persistence/
  DexieProjectIndex.ts

src/app/scripture/
  openEditableScripture.ts
  useEditableScriptureItem.ts

src/app/reference/
  useReferenceItem.ts
  translationNotes.ts

src/app/ui/components/blocks/
  ReferenceEditor.tsx
  reference/
    ScriptureReferencePane.tsx
    TranslationNotesReferencePane.tsx
```

Notes:
- `Project.ts` may remain temporarily as the scripture-specific editable contract, but the clean target is to make scripture one kind of library item rather than the top-level noun.
- `ProjectsService.ts` should be treated as a migration alias at most; the target seam is `LibraryService`.
- `core/library/items/` exists because `UsfmScripture` and `TranslationNotes` are kinds of library items, not peers of every library-wide contract.
- `PackedTranslationNotesRepository.ts` is intentionally specific: it is the boundary for packed TN persistence/runtime reads, not a generic markdown store.
- `app/library/` stays noun-oriented at the top level. Verb-heavy orchestration helpers, if split out, should live under `internal/` rather than defining the architecture.
- `DexieProjectIndex.ts` remains an app implementation of the core `ProjectIndex` contract.

## Main Types and Interfaces

### 1. App-facing discriminant

```ts
type LibraryItemType =
  | "usfmScripture"
  | "translationNotes";
```

This is the primary app-facing classification seam.

### 2. Low-level storage metadata

```ts
type ContainerFormat =
  | "resource-container"
  | "scripture-burrito";
```

This is not a UI branching seam. If import cannot establish one of these from metadata, import fails.

### 3. Typed item union

```ts
type LibraryItemBase = {
  id: string;
  displayName: string;
  managedPath: string;
  containerFormat: ContainerFormat;
  language: {
    code: string;
    name: string;
    direction: "ltr" | "rtl";
  };
  capabilities: LibraryItemCapabilities;
};

type UsfmScriptureItem = LibraryItemBase & {
  type: "usfmScripture";
  readWorkspace(): Promise<ScriptureWorkspaceSnapshot>;
  readBook(bookCode: string): Promise<ScriptureBook | null>;
  saveBook?(bookCode: string, contents: string): Promise<void>;
  addBook?(bookCode: string): Promise<void>;
};

type TranslationNotesItem = LibraryItemBase & {
  type: "translationNotes";
  listBookCodes(): Promise<readonly string[]>;
  readBook(bookCode: string): Promise<PackedTranslationNotesBook | null>;
  readChapter(
    bookCode: string,
    chapterNumber: number,
  ): Promise<Record<string, string> | null>;
};

type LibraryItem = UsfmScriptureItem | TranslationNotesItem;
```

Notes:
- `TranslationNotesItem` should return raw markdown strings at the verse layer.
- Rendering concerns stay out of the runtime contract.
- The current `LoadedBaseResource` is effectively a migration waypoint toward this union.

### 4. Capabilities

```ts
type SupportedEditor = "usfmScripture";

type LibraryItemCapabilities = {
  editableWith?: SupportedEditor;
  remoteSync?: RemoteSyncCapability;
  anchorNavigation?: AnchorNavigationCapability;
};

interface RemoteSyncCapability {
  kind: "remoteSync";
  source: {
    kind: "git" | "url" | "unknown";
    identifier: string;
    ref?: string;
  };
  applyUpdate(): Promise<void>;
}

interface AnchorNavigationCapability {
  kind: "anchorNavigation";
}
```

Rule:
- `type` determines the app-facing contract.
- `capabilities` determine what the app may do with that contract.
- there should be one source of truth in code for what is editable by type
- top-level library APIs stay generic; type-specific verbs live on the typed item nouns

### 5. Import result

```ts
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

Import returns metadata about what was written, not a live loaded runtime object.

### 6. Index row shape

```ts
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

Rule:
- store enough for listing and filtering
- never store note bodies or scripture contents
- homepage decisions should derive from `type` and `isEditable`, not ad hoc grouping logic

## Primary Flows

### 1. Import flow

1. UI chooses source.
2. `ImportService.importFolder()` / `importZip()` / `importRemoteZip()`
3. import reads metadata before final write shape is committed
4. import resolves `type`
5. import writes managed shape:
   - `usfmScripture` => preserve source shape
   - `translationNotes` => pack to per-book JSON and preserve root/support files
6. import returns `ImportResult`
7. library/index layer records normalized facts

Why this boundary exists:
- import decides storage strategy while bytes are still incoming
- loader should not have to “re-decide” storage shape

```ts
async function importIntoLibrary(source: ImportSource): Promise<ImportResult> {
  const metadata = await inspectIncomingSource(source);
  const type = resolveItemType(metadata);

  if (type === "usfmScripture") {
    const managedPath = await writeScriptureSourceAsIs(source);
    await maybeScaffoldGit(managedPath, metadata);
    return summarizeImport(managedPath, type);
  }

  if (type === "translationNotes") {
    const managedPath = await writePackedTranslationNotes(source, metadata);
    return summarizeImport(managedPath, type);
  }

  throw new Error("Unsupported import type");
}
```

### 2. Loader flow

1. service resolves managed path
2. loader reads on-disk metadata
3. loader resolves `type`
4. loader returns the typed runtime contract
5. service/UI branch once by `type`

Note:
- if caller entered from index-backed navigation, `type` may already be known
- loader still verifies on-disk truth when it opens the item

```ts
async function openLibraryItem(path: string): Promise<LibraryItem | null> {
  const metadata = await readManagedMetadata(path);
  const type = resolveItemType(metadata);

  switch (type) {
    case "usfmScripture":
      return buildUsfmScriptureItem(path, metadata);
    case "translationNotes":
      return buildTranslationNotesItem(path, metadata);
    default:
      return null;
  }
}
```

### 3. Home/current-project listing flow

1. service asks index for library items
2. service filters or groups using normalized indexed facts
3. home page renders:
   - library items
   - current projects = items with editable capability

Note:
- current projects is a view, not a domain type

```ts
async function listCurrentProjects(): Promise<IndexedLibraryItem[]> {
  const items = await projectIndex.listAll();
  return items.filter((item) => item.isEditable);
}
```

### 4. Scripture editor flow

1. route already guarantees a scripture-editing surface
2. route or scripture app module opens a generic library item
3. scripture app module narrows to `type === "usfmScripture"`
4. editor uses scripture-specific operations only
5. save path never checks for TN

```ts
async function openEditableScripture(
  library: LibraryService,
  itemRef: string,
): Promise<UsfmScriptureItem | null> {
  const item = await library.openItem(itemRef);
  if (!item || item.type !== "usfmScripture") return null;
  if (item.capabilities.editableWith !== "usfmScripture") return null;
  return item;
}
```

This is effectively the `projectToParsedFiles` side of the architecture, just sitting behind the scripture typed contract rather than a generic resource path.

### 5. Reference panel flow

1. service opens item
2. panel switches on `type`
3. scripture pane uses scripture runtime
4. TN pane uses raw markdown chapter data and renders via markdown renderer

This is the cleanest proof point for the architecture.

```ts
function ReferenceEditor({ item }: { item: LibraryItem }) {
  switch (item.type) {
    case "usfmScripture":
      return <ScriptureReferencePane item={item} />;
    case "translationNotes":
      return <TranslationNotesReferencePane item={item} />;
  }
}
```

```ts
async function useTnLibraryItemChapter(
  item: TranslationNotesItem,
  bookCode: string,
  chapterNumber: number,
) {
  const verses = await item.readChapter(bookCode, chapterNumber);
  return verses; // raw markdown strings keyed by verse
}
```

TN rendering note:
- a dedicated TN hook is the right place to hold TN-specific query/load behavior
- the renderer should consume raw markdown content, likely via `react-markdown`

### 6. Remote sync flow

The sync strategy depends on item type and import/origin history.

#### Scripture with git remote

```ts
async function applyScriptureRemoteSync(
  item: UsfmScriptureItem,
): Promise<void> {
  assert(item.capabilities.remoteSync?.source.kind === "git");

  // assume clean branch for current scope
  // git checkout working branch
  // git pull from configured remote/ref
  // reload item metadata if needed
  // rebuild index facts if display/editability changed
}
```

#### Translation notes with remote URL/archive

```ts
async function applyTranslationNotesRemoteSync(
  item: TranslationNotesItem,
): Promise<void> {
  const remote = item.capabilities.remoteSync?.source;
  assert(remote);

  // download current remote payload
  // import into temp managed location
  // repack to per-book JSON
  // atomically replace current managed path
  // rebuild index row from disk truth
}
```

Why this stays in service/app orchestration:
- sync behavior is a library concern
- loaders only interpret managed state

## Function Stubs

```ts
interface LibraryService {
  listLibraryItems(): Promise<IndexedLibraryItem[]>;
  listCurrentProjects(): Promise<IndexedLibraryItem[]>;
  openItem(itemRef: string): Promise<LibraryItem | null>;
  importFolder(
    source: string,
    options?: ImportOptions,
  ): Promise<ImportResult>;
  importZip(
    source: string,
    options?: ImportOptions,
  ): Promise<ImportResult>;
  importRemoteZip(
    source: ImportSource,
    options?: ImportOptions,
  ): Promise<ImportResult>;
  reconcileIndex(): Promise<void>;
}
```

```ts
async function buildTranslationNotesItem(
  path: string,
  metadata: ManagedItemMetadata,
): Promise<TranslationNotesItem> {
  // verify packed TN files exist
  // expose listBookCodes()
  // expose readBook()
  // expose readChapter()
  // attach remoteSync capability only if origin metadata exists
}
```

```ts
async function buildUsfmScriptureItem(
  path: string,
  metadata: ManagedItemMetadata,
): Promise<UsfmScriptureItem> {
  // map current Project behavior into scripture item contract
  // keep existing save/add/lint/history flows behind scripture-specific methods
  // attach editableWith: "usfmScripture"
}
```

```ts
// src/app/scripture/openEditableScripture.ts
async function requireEditableScriptureItem(
  library: LibraryService,
  itemRef: string,
): Promise<UsfmScriptureItem> {
  const item = await openEditableScripture(library, itemRef);
  if (!item) throw new Error("Expected editable scripture item");
  return item;
}
```

```ts
async function buildIndexRowFromManagedPath(
  path: string,
): Promise<IndexedLibraryItem | null> {
  // read minimal metadata
  // resolve type
  // derive isEditable / hasRemoteSync
  // never read full note bodies
  // never mirror on-disk subtrees into Dexie
}
```

## Dexie Reflection Rules
The index should reflect disk truth without duplicating it.

Keep in Dexie:
- managed path
- display name
- type
- container format
- language metadata
- editable affordance
- remote affordance

Do not keep in Dexie:
- TN chapter/verse bodies
- scripture book contents
- copied root/support file contents
- fake reconstructed file trees

Reconcile model:

```ts
async function reconcileIndex(): Promise<void> {
  // list managed roots on disk
  // remove stale rows whose paths are gone
  // for existing paths, rebuild normalized indexed facts from disk truth
}
```

The index is a fast catalog, not a shadow file system.

## Testing Shape

### Unit
- type discriminant helpers
- capability guards
- import branching
- TN packing and raw markdown chapter reads
- RC/SB loader equivalence for the same logical resource

### Service / integration
- library listing and editable filtering
- open item / open editable scripture item
- scripture git sync
- TN remote replace-and-repack
- Dexie reflect-but-don't-duplicate rules

### UI vertical slice
- scripture edit route narrows once and uses scripture-only API
- reference panel switches once by `type`
- TN pane renders raw markdown via markdown renderer
- home page current-project subset derives from indexed editable facts

Testing rule:
- do not test implementation detail helpers when the architectural boundary is the actual thing that matters
- prove each boundary contract independently, then prove one or two real end-to-end slices

## Risks and Open Questions

### Risks
- `Project` remains a useful temporary scripture-specific contract, but can keep dragging old vocabulary back in.
- `ProjectsService` to `LibraryService` migration may need adapters to keep churn manageable.
- `LoadedBaseResource` is currently a transitional shape and may become misleading if left too long.
- Route structure may still encode old nouns even after contracts are cleaned up.
- App modules may accidentally reintroduce scripture-specific methods onto the top-level library seam if the noun/verb hierarchy is not enforced.

### Open questions
- Keep `Project.ts` as the scripture-specific type name for one wave, or rename immediately?
- Keep `ProjectsService.ts` as an adapter alias during migration, or rename the top-level interface outright?

### Already-settled decisions
- the March 23 `BaseResource / Project` ADR is historical, not co-equal guidance
- `resourceKind` should collapse into app-facing `type`
- `containerFormat` is low-level metadata only
- TN runtime should expose raw markdown, not parsed section objects
- RC and Burrito should share higher-level item construction helpers
- scripture should just be scripture, not a separate `projectType`
- import without proper RC or Burrito metadata should fail

## Suggested Implementation Slices

> **Note:** Slices 1-5 form a DAG with multi-parent joins, not a strict sequence. `0fx` is the single root (robot-triage P0). After `0fx`, tracks proceed in parallel: `cdb → 0o3` (core/ADR), `cdb → u4h → dpz → lg5` (loader), and `cdb → ipv → u2r → gsv` (import/index). The `gsv` task unblocks when BOTH `u2r` completes AND `cdb` is done. `l0u` unblocks only when `u4h`, `gsv`, AND `0fx` all complete. Slice 5 (UI) waits for service and loader. Slice 6 (hardening) is the final wave after all implementation epics close.

### Slice 1: contract choke point
- `0fx` (root - single actionable, all tracks depend on this)
- `cdb` (depends on `0fx`)
- `0o3` (ADR doc - depends on `cdb` AND `0fx`)

**Delivery order:** `0fx` → `cdb` → `0o3` (strict sequence within slice)
**Closes:** `tuf` epic

**Deliverable:**
- one typed-item vocabulary
- one capability model
- one governing ADR

### Slice 2: import and index boundary
- `ipv` (depends on `cdb` AND `0fx`)
- `u2r` (depends on `ipv`)
- `gsv` (depends on `u2r` AND `cdb`) **← multi-parent join**

**Delivery order:** `ipv` → `u2r` → `gsv` (strict sequence within slice)
**Note:** `gsv` waits for `u2r` chain AND `cdb` to complete before it can close `3j7` epic.
**Closes:** `3j7` epic

**Deliverable:**
- import is storage-shaping only
- index stores normalized catalog facts only

### Slice 3: loader seam
- `u4h` (depends on `cdb`)
- `dpz` (depends on `u4h`)
- `lg5` (depends on `dpz`)

**Delivery order:** `u4h` → `dpz` → `lg5` (strict sequence within slice)
**Closes:** `fat` epic

**Deliverable:**
- path-in, typed-contract-out loaders
- shared RC/SB assembly
- TN raw-markdown runtime

### Slice 4: library service seam
- `l0u` (depends on `u4h` AND `gsv` AND `0fx`) **← three-parent join**
- `dmx` (depends on `l0u`)
- `da8` (depends on `dmx`)

**Delivery order:** `l0u` → `dmx` → `da8` (strict sequence within slice)
**Note:** `l0u` cannot start until `u4h` (loader), `gsv` (index), AND `0fx` (root) all complete.
**Closes:** `d39` epic

**Deliverable:**
- library-oriented orchestration
- editable subset derived from capabilities
- type-specific sync orchestration under the right seam
- no scripture-specific open method on the top-level library interface

### Slice 5: UI cutover
- `oss` (depends on `0fx`, `l0u`, `lg5`)
- `11t` (depends on `oss`)
- `x6r` (depends on `11t`)

**Delivery order:** `oss` → `11t` → `x6r` (strict sequence within slice)
**Note:** `oss` waits for `l0u` (service) AND `lg5` (loader) to land first.
**Closes:** `26j` epic

**Deliverable:**
- reference panel switches once by type
- scripture edit path uses only scripture contract
- home and picker views consume indexed type/capability facts

### Slice 6: hardening
- `6tn` (regression coverage - no dep on prior slices, runs final wave)
- `12t` (transitional adapter cleanup - waits for `6tn`)

**Delivery order:** `6tn` → `12t` (strict sequence)
**Note:** Both beads run after all implementation epics close. Closes `kxi` epic.

**Deliverable:**
- regression coverage across all seams
- final terminology cleanup
- older ADR fully retired as active guidance
