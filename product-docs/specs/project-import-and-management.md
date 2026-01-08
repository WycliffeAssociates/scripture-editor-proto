# Project Import and Management Functionality Specification

## Overview

The Dovetail Scripture Editor provides a flexible project import and management system that supports multiple sources and formats for scripture projects. This system enables users to import projects from remote repositories, local ZIP files, or existing directories, with automatic detection of project format (Scripture Burrito or Resource Container). The system maintains a local IndexedDB database for fast project metadata queries while keeping actual scripture files on persistent storage (OPFS for web, file system for desktop/Tauri).

The import system is designed to handle various USFM project structures gracefully. When importing, the system performs a multi-stage process: download/extract to temporary location, detect project format and load metadata, resolve naming conflicts, copy to permanent projects directory, and index metadata in IndexedDB for fast queries. This approach ensures clean separation of temporary processing artifacts from final project storage while providing users with clear feedback throughout the import process.

## Core Architecture

The project import and management system is built around the `ProjectImporter` orchestrator class, which delegates to specialized importers based on source type. This orchestrator pattern ensures consistent post-processing—regardless of import source—while allowing source-specific handling of download, extraction, and directory copying logic.

**Key Components:**
- **ProjectImporter**: Single-entry orchestrator that accepts discriminated import sources and delegates to concrete importers
- **WacsRepoImporter**: Handles downloading and importing from remote WACS repository URLs
- **ProjectFileImporter**: Handles importing from local ZIP files
- **ProjectDirectoryImporter**: Handles importing from already-available local directories
- **ProjectLoader**: Detects project format (Scripture Burrito or Resource Container) and loads metadata
- **IndexedDB (Dexie)**: Stores project metadata (languages, projects, files) for fast queries
- **ProjectRepository**: Interface for project persistence operations across platforms

The architecture uses a temporary staging approach where all imports are first processed in a temporary directory, validated, and then copied to the permanent projects directory. This prevents partial or failed imports from corrupting the projects directory. The system uses the `fflate` library for ZIP extraction and supports both `metadata.json` (Scripture Burrito) and `manifest.yaml` (Resource Container) project formats.

## Project Detection and Loading

The system automatically detects project format through the `ProjectLoader` class, which examines the project directory for metadata files. This detection determines which specific loader to use for extracting project information.

**Detection Logic:**
The system checks for the presence of metadata files in the following order:
1. **metadata.json**: If found, attempts to load as a Scripture Burrito project
2. **manifest.yaml**: If found and Scripture Burrito loading fails or is absent, attempts to load as a Resource Container project

**Prioritization:**
Scripture Burrito format is prioritized when both `metadata.json` and `manifest.yaml` are present in the same directory. This design choice reflects the assumption that Scripture Burrito is the modern preferred format for USFM projects.

**Loaders:**
- **ScriptureBurritoProjectLoader**: Reads and validates `metadata.json`, extracting project identifier, name, language information, and file list. Uses MD5 service for file integrity verification.
- **ResourceContainerProjectLoader**: Reads and validates `manifest.yaml`, extracting similar project metadata with the Resource Container schema.

**Validation:**
Both loaders use Valibot schemas to validate project structure before returning a Project object. Validation includes checking for required fields in metadata, language definitions, and file properties. If validation fails, the loader returns null, allowing the system to fall back to the alternative loader if available.

The `ProjectLoader` acts as a facade, hiding the complexity of multiple project formats from the rest of the application. When a project is successfully loaded, the returned object contains a complete `Project` interface with metadata, files, directory handle, and file writer reference.

## Import Sources and Workflows

The system supports three distinct import workflows, each handled by a dedicated importer class. All workflows follow a similar pattern: source acquisition, temporary staging, project loading and validation, conflict resolution, final copy to permanent storage, and post-processing.

### Remote Repository Import (WACS)

The WACS (Web Application for Content Sharing) repository import allows users to download projects from remote URLs. This workflow is implemented by `WacsRepoImporter`.

**Process Flow:**
1. **Download**: Fetches ZIP file content from provided URL using standard fetch API
2. **Extract**: Extracts ZIP contents to a unique temporary directory using `fflate` library
3. **Detect Project**: Identifies top-level entry in extracted directory (typically a single project directory)
4. **Resolve Conflicts**: Checks for existing project with same name in permanent directory; appends counter suffix (e.g., "MyProject (1)") if conflict exists
5. **Copy**: Copies extracted content to permanent projects directory
6. **Cleanup**: Removes temporary extraction directory

**Error Handling:**
- Download failures (HTTP errors, network issues) throw errors and halt import
- Invalid or corrupted ZIP files are caught during extraction
- Empty ZIP files are detected and rejected
- Cleanup is attempted even if import fails, ensuring temporary files don't accumulate

### Local ZIP File Import

The ZIP file import allows users to import projects from locally stored ZIP archives. This workflow is implemented by `ProjectFileImporter`.

**Process Flow:**
1. **Read File**: Reads selected ZIP file through file system API
2. **Extract**: Extracts ZIP contents to temporary directory
3. **Identify Top-Level**: Determines whether ZIP contains a single project directory, multiple directories, or loose files; uses first entry if multiple exist
4. **Resolve Conflicts**: Appends counter suffix to project name if conflict exists in permanent directory
5. **Copy**: Copies project content to permanent directory
6. **Cleanup**: Removes both temporary extraction directory and original staged ZIP file

**Special Handling:**
- Supports ZIP files with single file (copies file directly to new project directory)
- Supports ZIP files with directory structure (copies directory contents)
- Warns but continues if ZIP contains multiple top-level entries

### Local Directory Import

The directory import allows users to import projects from an existing directory on their file system. This workflow is implemented by `ProjectDirectoryImporter`.

**Process Flow:**
1. **Copy to Temporary**: Copies entire source directory contents to a unique temporary location with timestamp suffix
2. **Discover Project Name**: Examines temporary directory to find actual project name (may be nested within extracted structure)
3. **Resolve Conflicts**: Appends counter suffix if project name already exists in permanent directory
4. **Copy**: Copies content from temporary location to permanent projects directory
5. **Cleanup**: Removes temporary directory

**Discovery Logic:**
The system looks for subdirectories within the copied content to determine the true project name. This handles cases where the selected directory is a wrapper containing the actual project. The first subdirectory found is used as the project name.

## Post-Import Processing

After a successful import, the `ProjectImporter` orchestrator runs a centralized post-import hook via the `postImportHook` method. This hook executes consistently regardless of the import source, ensuring all projects are properly indexed and tracked in the application's metadata database.

**Post-Import Process:**
1. **Load Project**: Uses `ProjectRepository.loadProject()` to load the newly imported project, which internally uses `ProjectLoader` to detect format and parse metadata
2. **Validate Structure**: Uses `tryParseProjectForDb()` to validate the loaded project shape using Valibot schemas
3. **Database Transaction**: Runs a single IndexedDB transaction that:
   - Upserts language row (or retrieves existing language by identifier)
   - Upserts project row with association to language_id
   - Upserts each file row with resolved path_on_disk and metadata
4. **Error Resilience**: If post-import processing fails, the error is logged but the import is still considered successful (projects are on disk even if not fully indexed)

**Database Schema (IndexedDB via Dexie):**

**Languages Table:**
- `id` (auto-increment, primary key)
- `identifier` (string, indexed) - e.g., "en", "es"
- `title` (string, nullable) - e.g., "English", "Spanish"
- `direction` (string, nullable) - "ltr" or "rtl"

**Projects Table:**
- `id` (auto-increment, primary key)
- `projectDir` (string, indexed) - path to project on disk (unique key)
- `identifier` (string, nullable) - project identifier from metadata
- `title` (string, nullable) - project display name
- `languageId` (number, indexed, foreign key to languages.id)
- `version` (string, nullable)
- `createdAt` (string, nullable)
- `importedAt` (string, nullable)
- `updatedAt` (string, nullable)

**Files Table:**
- `pathOnDisk` (string, primary key) - absolute path to file
- `projectId` (number, indexed, foreign key to projects.id)
- `identifier` (string, nullable) - book code or file identifier
- `title` (string, nullable) - file title
- `sortOrder` (number, nullable) - for ordering files in UI
- `relativePath` (string, nullable) - relative path within project
- `fileExtension` (string, nullable) - file extension (e.g., ".usfm")

## Project Listing and Queries

The application provides multiple query interfaces for retrieving project and file information from IndexedDB. These queries are designed for use with Dexie's `useLiveQuery` hook to enable reactive updates.

**Language Queries:**
- `getLanguageByIdentifier(identifier)`: Fetches single language by ISO code
- `listLanguages()`: Returns all languages ordered by identifier

**Project Queries:**
- `getProjectByDir(projectDir)`: Fetches single project by directory path
- `listProjects()`: Returns all projects ordered by `importedAt` descending (most recent first)
- `listProjectsByLanguage()`: Composite query joining projects with language information
- `getProjectWithFilesByDir(projectDir)`: Fetches project with associated files and language

**File Queries:**
- `getFileByPath(pathOnDisk)`: Fetches single file by absolute path
- `listFilesForProject(projectId)`: Returns all files for a project ordered by `sortOrder`

**Upsert Operations:**
- `upsertLanguage(identifier, title, direction)`: Creates or updates language, returns language row with ID
- `upsertProject(projectDir, opts)`: Creates or updates project with optional metadata
- `upsertFile(projectId, file)`: Creates or updates file entry

**Delete Operations:**
- `deleteProjectById(id)`: Deletes project and all associated files within transaction
- `deleteProjectByPath(projectDir)`: Deletes project and files by directory path
- `deleteFileByPathOnDisk(pathOnDisk)`: Deletes single file by path

## Project Management Operations

### Project Renaming

Projects can be renamed through the UI, which updates only the display title in IndexedDB without affecting the directory name or metadata files.

**Process:**
1. User clicks edit icon on project row
2. Inline text input appears with current project name
3. User edits name and clicks Save (or presses Cancel to discard)
4. System calls `upsertProject(projectDir, { title: newName })`
5. Project list refreshes to reflect updated name

**Constraints:**
- Empty names are rejected
- Rename operation only updates the `title` field in projects table
- Directory structure on disk is not changed
- Metadata files (`metadata.json`, `manifest.yaml`) are not modified
- Original project identifier and file structure remain unchanged

### Project Deletion

Projects can be deleted through a confirmation dialog that removes both the database record and the files from disk.

**Process:**
1. User clicks delete icon on project row
2. Confirmation modal displays warning about removing files and metadata
3. User confirms deletion
4. System calls `ProjectRepository.deleteProject(projectPath, { recursive: true })` to remove directory and all contents
5. System calls `deleteProjectByPath(projectDir)` to remove IndexedDB records
6. Project list refreshes

**Constraints:**
- Deletion is recursive: entire project directory and all contents are removed
- Both database records and files are removed in sequence
- If directory removal fails, system still attempts to remove database records
- Deletion cannot be undone (no recovery mechanism)

### Project Navigation

Projects can be opened for editing through two primary UI pathways:

**Project List (Index Page):**
- Lists all projects grouped by language
- Clicking project name navigates to `/project` route
- Last opened project path is saved to settings for persistence

**App Drawer (Project List):**
- Lists all projects in sidebar
- Clicking project name navigates to project editor
- Selected project is visually highlighted

**Additional Actions (Desktop Only):**
- Open in file manager: Opens project directory in system file explorer
- Export project: Creates ZIP archive of project directory for download

## User Interface Components

### ProjectCreator Block

The `ProjectCreator` component provides the main interface for importing new projects. It composes three import methods in a two-column layout:

**Left Column - Remote Import:**
- Language API search/autocomplete with debounced input (300ms delay)
- Search filters by language IETF code, language name, or English language name
- Results grouped by English language name
- Displays repository information (username/repo_name) with formatted display string
- Download button triggers WACS import workflow

**Right Column - Local Import:**
- Directory uploader: Opens system folder picker with `webkitdirectory` attribute
- File uploader: Opens file picker restricted to `.zip` files
- Both uploaders show loading state and disable during import

**State Management:**
- Maintains `isImporting` state to prevent concurrent imports
- Shows success/error notifications via toast system
- Validates selections before initiating import

### ProjectRow Component

The `ProjectRow` component displays a single project in the main project list with inline editing and deletion capabilities.

**Display Mode:**
- Link to open project (clickable project name)
- Edit button (pencil icon) triggers inline edit mode
- Delete button (trash icon) opens confirmation modal

**Edit Mode:**
- Text input for project name with placeholder text
- Save button (checkmark) commits name change
- Cancel button (X) discards changes and reverts to original name

**Delete Confirmation Modal:**
- Centered modal with warning message
- Lists project name being deleted
- Explains that files will be removed and metadata deleted
- Cancel and Delete buttons with Delete colored red

### ProjectList Component

The `ProjectList` component displays projects in the app drawer with navigation and action buttons.

**Project Items:**
- Main button navigates to project when clicked
- Action icons separate from main button (to prevent accidental navigation)
- Open icon (eye) opens project in system file manager (desktop only)
- Export icon (download) creates ZIP archive for download

**Platform Handling:**
- Hides Open icon on Android and iOS platforms
- Export functionality requires `opener.export` method in router context

### LanguageApiImporter Component

The `LanguageApiImporter` component provides autocomplete-based search for remote WACS repositories.

**Autocomplete Features:**
- Debounced search input (300ms delay)
- Fetches consolidated repo list on first interaction
- Filters results by language identifier or name
- Groups results by English language name
- Shows loading indicator during fetch
- Displays error messages if fetch fails

**Selection and Download:**
- Selecting a repo sets it as selected and updates display text
- Download button is disabled until a repo is selected
- Download retrieves ZIP URL from selected repo and triggers import

## Import Handlers and Helper Functions

The system provides handler functions that bridge UI events with the import logic:

**handleDownload:**
- Accepts URL string
- Calls `ProjectImporter.import({ type: "fromGitRepo", url })`
- Throws error if import fails
- Invalidates router cache on success to refresh project list

**handleOpenDirectory:**
- Accepts input change event with file list
- Reads `webkitRelativePath` to determine directory structure
- Copies selected directory contents to temporary location
- Calls `ProjectImporter.import({ type: "fromDir", dirHandle: tempDir })`
- Cleans up temporary directory after import
- Throws error if import fails

**processFile / handleOpenFile:**
- Accepts File object (ZIP)
- Copies file to temporary directory with timestamp prefix
- Calls `ProjectImporter.import({ type: "fromZipFile", fileHandle: tempFile })`
- Cleans up temporary file after import
- Throws error if import fails

All handlers follow the same pattern:
1. Stage source to temporary location
2. Call appropriate importer
3. Clean up temporary resources
4. Invalidate router cache to refresh UI
5. Show success/error notifications

## Error Handling and Validation

The system implements multi-layer error handling and validation:

**Import-Level Errors:**
- Network failures for remote downloads are caught and reported to user
- Invalid or corrupted ZIP files throw errors during extraction
- Empty project directories or ZIP files are detected and rejected
- Import failures return `false` from importer but don't crash the application

**Project-Level Validation:**
- Valibot schemas validate project metadata before database indexing
- Missing required fields in metadata cause validation to fail
- Validation failures are logged but don't prevent project from being on disk
- Post-import hook catches and logs errors without marking import as failed

**Database-Level Errors:**
- Upsert operations are wrapped in try/catch blocks
- File-level upsert errors are logged but don't fail entire transaction
- Transaction failures are caught and reported
- Missing foreign keys (e.g., languageId) are handled as nullable

**User-Facing Errors:**
- Notifications use toast system for success/error feedback
- Error messages are internationalized via Lingui
- Loading states prevent concurrent operations
- Confirmation dialogs prevent accidental destructive actions

## Naming Conflict Resolution

All import workflows use a consistent naming conflict resolution strategy to prevent overwriting existing projects.

**Algorithm:**
1. Extract project name from source (directory name or top-level ZIP entry)
2. Check if name already exists in permanent projects directory
3. If conflict exists, append counter suffix: `{name} (1)`, `{name} (2)`, etc.
4. Increment counter until a unique name is found
5. Create final project directory with unique name

**Behavior:**
- Conflict detection uses `DirectoryProvider.containsDir()` method
- Counter resets to 1 for each import operation
- Only checks for conflicts in permanent projects directory, not temp
- Original directory name is preserved in all cases

## Platform Considerations

The import and management system is designed to work across web and desktop platforms with appropriate adaptations:

**Web (OPFS):**
- Uses `FileSystemDirectoryHandle` and `FileSystemFileHandle` APIs
- Temporary directory is within OPFS space
- Permanent projects directory is within OPFS space
- File access requires user permission grants

**Desktop (Tauri):**
- Uses platform-specific `DirectoryProvider` implementation
- Direct file system access without browser sandbox
- Can open projects in system file manager
- Can export projects as ZIP files for download

**Mobile (Android/iOS):**
- Limited import capabilities (file system restrictions)
- No "Open in file manager" action
- Export functionality may be limited or unavailable
- Touch-optimized UI with larger buttons

## Scaffold Route

The `/scaffold` route provides a simplified interface for importing from a WACS URL directly (bypassing the main project listing).

**Features:**
- URL query parameter (`?url=...`) allows direct linking
- Auto-processes import on route mount if URL provided
- Shows progress messages during download and processing
- Navigates to newly created project on success
- Redirects to home page if no URL provided

**Use Case:**
Designed for external systems or bookmarks that want to trigger a project import directly without requiring the user to navigate through the main project listing interface.

---

## Notes for Future Work

This specification was written based on existing code inspection. The following areas may need additional documentation or refinement based on future implementation needs:

1. **Reference Project Integration**: The system includes reference project functionality (useReferenceProject hook, reference project picker in UI), but this spec currently focuses on main project import/management. A separate spec may be needed for reference project workflows.

2. **Metadata Update on Project Edit**: Currently, project renaming only updates the display title in IndexedDB. Future work may need to update `metadata.json` or `manifest.yaml` files to keep disk and database in sync.

3. **Export Functionality**: Export is mentioned in the code (opener.export) but not fully detailed in this spec. May need expansion if export becomes a primary workflow.

4. **Book Addition to Projects**: The `Project` interface includes an `addBook` method for adding USFM files to existing projects, but this workflow is not covered in the current spec. Likely part of a separate "book management" spec.

5. **File System Permissions**: The browser's File System Access API requires user permission grants. The exact flow for requesting and managing these permissions may need additional documentation.

6. **Import Progress Tracking**: While the code shows some progress messages (e.g., "Downloading repository...", "Processing scaffold ZIP..."), a comprehensive progress tracking system with percentage completion is not fully implemented.

7. **Project Validation Beyond Schema**: Currently, validation focuses on metadata structure. Future work may include validation of USFM file contents, checking for required markers, or ensuring book codes match canonical book lists.

8. **Undo/Redo for Import**: There is no mechanism to undo import operations. Once a project is imported and database records created, there is no rollback capability (short of manual deletion).
