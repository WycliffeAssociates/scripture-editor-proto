# Project Import and Management

## What this feature does
- Creates local projects from three sources:
  - Repository download
  - Writable cloud project clone (when a cloud session is already present)
  - Local folder upload
  - Local ZIP import
- Detects supported project container types:
  - Scripture Burrito (`metadata.json`)
  - Resource Container (`manifest.yaml`)
- Indexes project metadata for fast local browsing.
- Provides core project management actions:
  - Open project
  - Rename project display name
  - Delete project (disk + local DB metadata)
  - Export project as ZIP (where opener/export is available)
- Shows a session-aware `From my cloud projects` source on `/create` when this install already has a cloud session.

## How to access it in the app
- Go to home route (`/`) and click `New Project` (or use `New Project` from the in-project drawer).
- On the create project route (`/create`), use:
  - Search/download repository
  - `From my cloud projects` to clone writable cloud repos into managed storage
  - `Upload a folder`
  - `Or select a ZIP file`
- Existing projects are listed under `Projects`.
- In-project drawer also exposes project list actions (`Open`, `Export`, `New Project`).

## Typical user flow
1. Import via repository, writable cloud repo, folder, or ZIP.
2. Importer copies content into the app project storage.
3. Project indexer stores metadata entries for fast lookup.
4. Project appears in `Projects`.
5. Open it from the list and start editing.

## Current limits and non-goals
- Project type detection is metadata-based (`metadata.json` or `manifest.yaml`).
- ZIP imports with multiple top-level entries currently use the first discovered top-level entry.
- Naming collisions are auto-resolved by suffixing (`(1)`, `(2)`, ...).
- Cloud repo listing/clone is session-aware, but this route does not implement OAuth login itself.
- Export/share/import portability strips Git internals. Exported ZIPs are portable local projects, not cloud-linked bundles.
- Cloud session and per-project cloud status are app-local and do not travel with export/share artifacts.

## Key modules (for agents)
- `src/app/routes/index.tsx`
- `src/app/routes/create.tsx`
- `src/app/ui/components/import/CloudProjectImporter.tsx`
- `src/app/domain/api/import.tsx`
- `src/core/domain/project/import/ProjectImporter.ts`
- `src/core/domain/project/import/ProjectFileImporter.ts`
- `src/core/domain/project/import/ProjectDirectoryImporter.ts`
- `src/core/domain/project/import/ZipImportPipeline.ts`
- `src/core/domain/project/ProjectLoader.ts`
- `src/core/domain/project/ScriptureBurritoProjectLoader.ts`
- `src/core/domain/project/ResourceContainerProjectLoader.ts`
- `src/app/ui/components/blocks/ProjectCreator.tsx`
- `src/app/ui/components/blocks/ProjectRow.tsx`
