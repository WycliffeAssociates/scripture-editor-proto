# Local Git Versioning

## What this feature does
- Maintains a local Git repository per project as an implementation detail.
- Creates local version checkpoints on explicit save.
- Lets users browse and load previous project versions without exposing Git terminology in the UI.
- Supports comparing the current project against a previous local version inside the existing compare flow.
- Works on both Web and Tauri with platform-specific Git adapters.

## User-facing model
- Users see:
  - `Review & Save`
  - `Previous Versions`
  - `Viewing older version`
  - `Back to latest`
  - `Save as New Version`
- Users do not see:
  - branch names
  - commit hashes
  - merge / rebase / HEAD terminology

## How to access it in the app
- Open the toolbar `More actions` menu.
- Choose `Previous Versions`.
- Select a version row to load that snapshot into working editor state.
- Use `Back to latest` to return to the newest saved state.
- When viewing an older version, the main save action is relabeled to `Save as New Version`.

## Repository lifecycle
- On project open, Dovetail:
  - Ensures `.gitignore` contains a minimal baseline
  - Ensures a local Git repo exists
  - Uses `master` as the default branch when initializing app-created repos
  - Checks repository health and reinitializes if needed
  - Attempts detached-HEAD recovery by checking out the preferred branch
- If the repo has no history after initialization/open, Dovetail creates a baseline commit automatically.

## Import and export behavior
- Imported `.git` directories are discarded.
- Exported archives exclude `.git`.
- Current `.gitignore` baseline entries added by Dovetail are:
  - `.DS_Store`
  - `Thumbs.db`
  - `node_modules`

## Commit behavior
- Dovetail creates commits only on explicit save and only when there are effective tracked-file changes.
- Commit author is:
  - `Dovetail <noreply@dovetail.local>`
- Commit subject format:
  - Baseline: `baseline:<ISO_TIMESTAMP>`
  - Save: `save:<ISO_TIMESTAMP>`
- Commit trailers:
  - `x-dovetail-op: baseline|save`
  - `x-dovetail-chapters: GEN 1|EXO 2|...`
  - `x-dovetail-version: 1`
- If a save writes successfully but checkpoint creation fails:
  - The project save still succeeds
  - The user gets a non-blocking warning

## History listing behavior
- History is read from the current branch.
- Newest entries are shown first.
- The UI loads 50 entries at a time and supports `Load more`.
- Both app-created and external commits are listed.
- App-created commits use structured chapter summaries from trailers.
- External commits fall back to raw subject text.

## Previous Versions behavior
- Selecting a version is time-travel working state, not read-only preview.
- Dovetail reads the tracked files from that commit, reparses them, and swaps them into current working state.
- Switching versions also resets the saved baseline in memory, so users can hop between versions without being forced dirty after each hop.
- `Back to latest` loads the newest saved version into working state without creating a commit.
- Undo/redo history is cleared after a version switch.

## Dirty-switch behavior
- If the workspace has unsaved edits when opening previous versions or switching versions, the app prompts:
  - `Cancel`
  - `Discard`
  - `Review & Save`
- `Discard` drops unsaved working changes, then performs the requested version action.
- `Review & Save` routes back through the existing save-review modal.

## Save-from-older-version behavior
- When saving while viewing an older version:
  - Dovetail first restores the tracked file tree from the selected version on disk
  - Then it writes the current in-memory edited books
  - Then it creates a new save commit at the tip
- This makes the saved result a new latest version derived from the selected historical state.

## Compare integration
- The existing compare UI supports `previousVersion` as a compare source.
- Current project content can be compared against one selected previous local version.
- `Take incoming` actions operate through the existing compare/review flow.
- This is not Git merge behavior; it is Dovetail’s existing scripture/chapter compare model against a version snapshot.

## Branch and recovery behavior
- App-created repos prefer `master`.
- If `master` is unavailable in an existing repo, Dovetail falls back to the repo default branch or current branch.
- Detached HEAD on open triggers a best-effort checkout fallback.
- On web, missing/unborn HEAD is handled explicitly so a newly initialized repo can exist before the first commit.

## Platform implementation
- Web:
  - `isomorphic-git`
  - ZenFS-backed filesystem runtime
- Tauri:
  - Rust `git2` / libgit2 bridge exposed through Tauri commands
- Shared logic:
  - Commit message formatting and trailer parsing
  - Branch preference resolution
  - External-vs-app commit detection

## Current limits and non-goals
- No push, pull, fetch, clone, auth, remotes, merge UI, or conflict UI.
- No user-authored commit messages.
- No branch management UI.
- No hash display in the UI.
- Previous-version loads reparse the snapshot today instead of using warm parse cache.
- Git remains storage/history infrastructure; user-visible diffing is still the app’s scripture diff engine.

## Key modules (for agents)
- `src/core/persistence/GitProvider.ts`
- `src/core/persistence/gitVersionUtils.ts`
- `src/app/domain/git/gitConstants.ts`
- `src/app/domain/git/ensureProjectGitReady.ts`
- `src/web/adapters/git/WebGitProvider.ts`
- `src/tauri/adapters/git/TauriGitProvider.ts`
- `src/tauri/rust/src/git.rs`
- `src/app/ui/hooks/useSave.tsx`
- `src/app/ui/components/blocks/Toolbar.tsx`
- `src/app/ui/components/blocks/DiffModal/DiffModal.tsx`
- `src/app/domain/project/compare/types.ts`

## Validation references
- `src/test/unit/gitVersionUtils.test.ts`
- `src/test/unit/ensureProjectGitReady.test.ts`
- `src/test/unit/versionNavigationService.test.ts`
- `src/test/unit/webGitWriteThroughRegression.test.ts`
