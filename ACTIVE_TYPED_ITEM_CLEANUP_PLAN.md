# Active Typed-Item Cleanup Plan

This file exists so the current execution plan survives compaction while the
tree-normalization refactor is in flight.

## Goal

Make the codebase tell one clear story:

`import (branch by type) -> managed disk shape -> load (accounting for container format) -> typed noun -> UI uses noun verbs`

The resulting tree, names, types, interfaces, and JSDoc should make that story
obvious without needing tribal context.

Cleanup Plan

The goal is a hard-cut architecture where the code tells one story:

import -> managed disk shape -> load -> typed noun -> UI uses noun verbs

No co-equal old model. No “BaseResource but also LibraryItem but also Project” muddle.

1. Target Architecture
Flow
Import

incoming folder / zip / remote zip
read container metadata early
classify by app-facing type
write final managed disk shape for that type
Managed Disk

files only
storage shape may differ by type
containerFormat is low-level metadata only
Load

given a managed path
parse according to container format
return one typed noun
UI

branch once by type
hand typed noun into type-specific hooks/components
use capabilities for affordances, not as the main data model
Core rule
Type is the noun
Capabilities are affordances
Container format is implementation detail
2. Hard-Cut Naming Decisions
These should be treated as final direction.

Keep
LibraryItem
LibraryItemType
LibraryService
ItemLoader
IItemLoader
ContainerFormat
UsfmScriptureItem
TranslationNotesItem
Retire from active architecture
BaseResource
LoadedBaseResource
BaseResourceCapabilities
ProjectsService
DefaultProjectsService
These may survive briefly as shims, but only as explicitly transitional adapters.

3. File Tree Target
src/core/
  library/
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

  loading/
    IItemLoader.ts
    ItemLoader.ts
    container/
      loadResourceContainer.ts
      loadScriptureBurrito.ts
    builders/
      buildUsfmScriptureItem.ts
      buildTranslationNotesItem.ts

  persistence/
    FileSystem.ts
    GitProvider.ts
    StorageRoots.ts
    pathUtils.ts
    gitConstants.ts
    gitVersionUtils.ts

src/app/
  library/
    LibraryService.ts
    DefaultLibraryService.ts
    internal/
      import.ts
      reconcile.ts
      sync.ts

  scripture/
    openEditableScripture.ts
    useEditableScriptureItem.ts

  reference/
    useReferenceItem.ts
    translationNotes.ts
4. Physical Cleanup Work
A. Empty out src/core/persistence/
What stays there:

true persistence/platform abstractions only
What moves:

ProjectIndex.ts -> src/core/library/ProjectIndex.ts
ImportService.ts -> src/core/library/ImportService.ts
TranslationNotes.ts -> src/core/library/stores/PackedTranslationNotesRepository.ts
What gets retired:

BaseResource.ts
LoadedBaseResource.ts
BaseResourceCapabilities.ts
ProjectsService.ts
B. Reshape src/core/domain/project/
Current problem:

container parsing
loader behavior
project promotion
old-model assembly
all mixed together
Target split:

core/loading/container/ for RC/SB parsing
core/loading/builders/ for constructing typed nouns
loader orchestration remains in core/loading/
C. Rename app seam
src/app/services/LibraryService.ts should move to src/app/library/LibraryService.ts
create src/app/library/DefaultLibraryService.ts
move orchestration helpers under src/app/library/internal/
D. Narrow app modules by noun
scripture-specific helpers live under src/app/scripture/
reference-specific helpers live under src/app/reference/
top-level library seam stays generic only
5. Contract Cleanup
LibraryItem
Keep as discriminated union.

UsfmScriptureItem
Should expose scripture verbs only:

readWorkspace()
readBook()
saveBook()
addBook()
TranslationNotesItem
Should expose TN verbs only:

listBookCodes()
readBook()
readChapter()
Capabilities
Only for affordances:

editableWith
remoteSync
anchorNavigation
Not for primary content shape.

6. Import Boundary Cleanup
Import must be storage-shaping only.

Scripture
preserve source shape
scaffold git if appropriate
write final managed layout
TN
preserve container metadata file
copy support/root files
pack per-book JSON
persist remote metadata if applicable
Import returns metadata, not live runtime nouns.

7. Loader Boundary Cleanup
Loader must be:

path in
typed noun out
No:

import-time reshaping
index mutation
git setup
UI-specific logic
ItemLoader should:

detect container format
parse container metadata
resolve app-facing type
build typed noun
8. UI Cleanup Rules
Allowed branching
One switch (item.type) at route/component boundary.

Not allowed
deep branching in hooks
mixed scripture/TN loading logic inside one generic hook
UI reading raw container format
Desired pattern
ReferenceEditor branches once by type
scripture route narrows once, then passes UsfmScriptureItem through
TN pane narrows once, then renders markdown from raw note content
9. Documentation / JSDoc Plan
This should be part of the cleanup, not an afterthought.

Add top-of-file JSDoc to:
LibraryItem.ts
defines the main noun model
ImportService.ts
explains import as storage shaping
ItemLoader.ts
explains load as path -> noun
PackedTranslationNotesRepository.ts
explains packed TN runtime/disk seam
LibraryService.ts
explains library orchestration vs loading
DefaultLibraryService.ts
explains app-layer implementation role
Add JSDoc to key interfaces/types
LibraryItem
UsfmScriptureItem
TranslationNotesItem
LibraryItemCapabilities
ProjectIndex
ImportResult
ContainerFormat
Remove / rewrite comments that tell the old story
Any comment that frames:

BaseResource as the main model
ProjectsService as the intended top-level seam
“resource vs project” as the active architecture
10. Migration Strategy
Phase 1. Introduce clean targets
create/move files into final locations
add JSDoc and naming
keep compatibility exports where needed
Phase 2. Flip imports
move callers to new paths
move app orchestration to app/library
move TN store usage to PackedTranslationNotesRepository
Phase 3. Collapse old seams
stop importing BaseResource*
stop importing ProjectsService in new code
remove transitional aliases
Phase 4. Final cleanup
delete dead files
update tests/docs
ensure ADRs and file tree align
11. Explicit Success Criteria
This cleanup is done when:

src/core/persistence/ contains only persistence/platform concerns
BaseResource* is no longer an active architectural center
ProjectsService is no longer the preferred seam
loaders live under src/core/loading/
TN storage/runtime boundary has an explicit repository name
app orchestration lives under src/app/library/
scripture/reference modules are separated by noun
UI branches once by type
JSDoc consistently tells the same story as the file tree
12. Main Risks
half-migrating names and leaving aliases forever
moving files without updating the mental model
over-abstracting capabilities and losing noun-specific APIs
letting BaseResource remain “secretly primary” because it is still convenient
13. Recommended Execution Order
Finalize naming and file moves on paper.
Move ProjectIndex, ImportService, TranslationNotes.
Create app/library/DefaultLibraryService.ts and migrate app imports.
Split loader/container/builder files.
Migrate UI hooks/routes to noun-first seams.
Delete or quarantine BaseResource* and ProjectsService.
Run regression and doc cleanup.
Do one final tree audit against the agreed story.
