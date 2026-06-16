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
- Lets an existing local editable scripture project either:
  - `Save as new cloud project`
  - `Attach existing cloud project` from the settings drawer when the remote metadata looks like the same scripture language

## How to access it in the app

- Go to home route (`/`) and click `New Project` (or use `New Project` from the in-project drawer).
- On the create project route (`/create`), use:
  - Search/download repository
  - `From my cloud projects` to clone writable cloud repos into managed storage
  - `Upload a folder`
  - `Or select a ZIP file`
- Existing projects are listed under `Projects`.
- In-project drawer also exposes project list actions (`Open`, `Export`, `New Project`).
- In the settings drawer for an unlinked editable scripture project, the `Cloud` section supports:
  - Creating a new cloud repo from this project
  - Attaching one owned cloud repo whose metadata passes compatibility checks

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
- Attaching an existing cloud repo is intentionally conservative:
  - the remote repo must expose `metadata.json` or `manifest.yaml` on its tracked branch
  - scripture burrito remotes must look like scripture `textTranslation` `standard`
  - resource container remotes must classify as scripture from `dublin_core`
  - the remote language tag must match the local editable scripture project language code
- Export/share/import portability strips Git internals. Exported ZIPs are portable local projects, not cloud-linked bundles.
- Cloud session and per-project cloud status are app-local and do not travel with export/share artifacts.

## Key modules (for agents)

- `src/app/routes/index.tsx`
- `src/app/routes/create.tsx`
- `src/app/ui/components/import/CloudProjectImporter.tsx`
- `src/core/domain/project/import/ProjectImporter.ts`
- `src/core/domain/project/import/ProjectFileImporter.ts`
- `src/core/domain/project/import/ProjectDirectoryImporter.ts`
- `src/core/domain/project/import/ZipImportPipeline.ts`
- `src/core/domain/project/ScriptureBurritoProjectLoader.ts`
- `src/core/domain/project/ResourceContainerProjectLoader.ts`
- `src/app/ui/components/blocks/ProjectImportHub/ProjectImportHub.tsx`
- `src/app/ui/components/blocks/ProjectRow.tsx`
