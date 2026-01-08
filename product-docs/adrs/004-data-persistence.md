# 004. Dexie (IndexedDB) for Metadata

## Status
Accepted

## Context
While the "Source of Truth" is the USFM file on disk, we need fast querying for the project list, file ordering, and metadata without parsing thousands of files on every load.

## Decision
We use **Dexie.js** (IndexedDB wrapper) as a local cache/index.
*   **Role:** Stores `Projects`, `Files` (paths), and `Languages` metadata.
*   **Sync:** The database is updated whenever the file system is modified by the application.

## Consequences
*   We must ensure the DB stays in sync with the file system.
*   On application startup, we may need reconciliation logic (Sanity Checks).