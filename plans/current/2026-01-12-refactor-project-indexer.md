# Refactor Plan: Extract ProjectIndexer

## Context
`ProjectImporter.ts` violates the Single Responsibility Principle. It handles both "File I/O" (importing from WACS/Zip/Dir) and "Database Indexing" (parsing metadata and writing to IndexedDB via the `postImportHook`).

## Objective
Extract the database indexing logic into a dedicated service `ProjectIndexer`.

## Proposed Changes

### 1. Create `src/core/domain/project/ProjectIndexer.ts`
**Responsibility:** Coordinate the loading of a project from disk and indexing it into the database.

**Interface:**
```typescript
export class ProjectIndexer {
    constructor(
        private projectRepository: IProjectRepository,
        private md5Service: IMd5Service
    ) {}

    /**
     * Loads project from disk, parses metadata, and updates DB.
     */
    public async indexProject(projectDirPath: string): Promise<void> {
        // Logic from ProjectImporter.postImportHook goes here
        // Note: The specific `db.transaction` logic currently lives in App layer (db/api.ts).
        // To maintain Hexagonal Architecture, this service might need to live in
        // src/app/domain/project/ProjectIndexer.ts OR delegate the DB write back to a repository method.
    }
}
```
Architectural Correction:
The current postImportHook imports db directly from @/app/db/db.ts. This suggests ProjectImporter (currently in src/core) is violating the dependency rule if it imports from src/app.
Checking imports: ProjectImporter.ts imports upsertFile from @/app/db/api.ts.
Correction: ProjectImporter is currently in src/core, but it depends on src/app. This is a strict architectural violation.
Refactor Strategy:
Move the Indexing Logic out of Core and into App.
ProjectImporter (Core) should just return the path of the imported directory.
The Caller (UI layer, handleDownload etc in src/app/domain/api/import.tsx) should call the Indexer after the Importer finishes.
Implementation Steps
Create src/app/domain/project/ProjectIndexer.ts:
This class will live in app because it writes to the App Database (Dexie).
Move postImportHook logic here.
Remove the db imports from src/core/domain/project/import/ProjectImporter.ts.
Clean src/core/domain/project/import/ProjectImporter.ts:
Remove postImportHook.
import method simply returns string | null (the path).
Update src/app/domain/api/import.tsx:
In handleDownload, handleOpenDirectory, processFile:
Call importer.import(...).
If successful, instantiate/call ProjectIndexer.indexProject(path).
Verification
Run pnpm build.web (This will likely fail if Core imports App, so this refactor fixes a circular dependency/arch violation).
Run pnpm test:unit.
Manual: Import a project from ZIP and ensure it appears in the project list.