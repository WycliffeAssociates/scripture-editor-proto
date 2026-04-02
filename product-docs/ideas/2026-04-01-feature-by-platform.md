# Feature By Platform

Timestamp: 2026-04-01

Purpose: brief product/engineering reference for places where Web and Desktop can diverge because the same feature crosses a platform seam, or because Desktop has a native/Rust path while Web stays in JS/browser APIs.

This is intentionally not exhaustive. It focuses on areas worth remembering when behavior drifts, bugs reproduce on one platform only, or we are deciding where new work should live.

## Shared By Default

These are mostly JS/shared-app concerns unless noted otherwise:

- Editor behavior, save/diff/revert UX, compare modal behavior, cloud reconciliation rules
- Project orchestration and most product logic in `src/app/` and `src/core/`
- Project indexing and most metadata validation/loading rules
- Cloud session shape and remote-link metadata models

If a bug reproduces identically on both platforms, it is probably here first.

## Platform Seams Worth Tracking

### Filesystem

- Web:
  - `src/web/persistence/OpfsFileSystem.ts`
  - Managed storage is OPFS-backed and implemented in JS.
  - Browser path restrictions are enforced in JS.
- Desktop:
  - `src/tauri/persistence/TauriFileSystem.ts`
  - Uses Tauri FS plugin calls.
  - Also depends on Tauri capability files under `src/tauri/rust/capabilities/`.

Why it matters:
- Path access bugs can be Desktop-only because of capability scopes.
- OPFS timing/layout issues are Web-only.

### Storage Roots

- Web:
  - `src/web/persistence/OpfsStorageRoots.ts`
- Desktop:
  - `src/tauri/persistence/TauriStorageRoots.ts`

Why it matters:
- Managed path layout should feel the same product-wise, but the backing storage locations differ.
- Session files, temp imports, logs, and git metadata all depend on these roots.

### Git

- Web:
  - `src/web/adapters/git/WebGitProvider.ts`
  - Uses `isomorphic-git` and OPFS.
  - Browser Git uses `corsProxy` and optional `X-Requested-With`.
- Desktop:
  - `src/tauri/adapters/git/TauriGitProvider.ts`
  - Invokes Rust commands in `src/tauri/rust/src/git.rs`
  - Native git behavior depends on libgit2 and Rust-side implementation details.

Why it matters:
- This is one of the biggest divergence zones.
- Branch behavior, fetch/push semantics, replay/reset behavior, auth transport, and remote inspection can fail differently.
- Product logic is shared, but the git engine is not.

Current product rule to remember:
- We use `master` as the default branch in this ecosystem.
- Diverged manual reconciliation is squash-to-final-form, not pick/replay.

### Import: Folder / ZIP / Remote Archive

- Web:
  - `src/web/persistence/WebImportService.ts`
  - Folder and zip imports stay in JS/browser APIs.
  - Remote URL import is browser `fetch` + JS zip pipeline.
- Desktop:
  - `src/tauri/persistence/TauriImportService.ts`
  - Folder, zip, and remote archive download route through native Tauri/Rust commands.
  - Rust implementation lives in `src/tauri/rust/src/import.rs`.

Why it matters:
- Remote URL import is a major divergence point.
- Desktop remote archive download is native HTTP, not browser fetch.
- WAF/header/challenge behavior can therefore differ even when the same URL works in browser contexts.

Current notable detail:
- Desktop remote archive download now forwards optional `X-Requested-With` from env for Cloudflare/WAF bypass.

### USFM Onion / Lint / Format / Diff

- Web:
  - `src/web/domain/usfm/WebUsfmOnionService.ts`
  - Uses `usfm-onion-web` directly in JS.
  - Path-based IO is unsupported on web.
- Desktop:
  - `src/tauri/domain/usfm/TauriUsfmOnionService.ts`
  - Uses Tauri invokes backed by Rust commands in `src/tauri/rust/src/usfm_onion.rs`
  - Can use path-based batch operations.

Why it matters:
- Same app-facing API, different execution engines.
- Performance and edge-case differences may appear in formatting, linting, token diffing, and path batch operations.

### Settings

- Web:
  - `src/web/domain/settings.ts`
  - Browser local-storage backed.
  - Zoom and system-font access are intentionally disabled.
- Desktop:
  - `src/tauri/domain/settings/settings.ts`
  - Same base settings model, but adds webview zoom restore and system-font support.

Why it matters:
- Most settings UI is shared.
- Capability differences are mostly in side effects, not in the stored setting names.

### Export / Open In File Explorer

- Web:
  - `src/web/persistence/WebOpener.ts`
  - Export is JS zip download.
  - No native “reveal in folder”.
- Desktop:
  - `src/tauri/persistence/TauriOpener.ts`
  - Export uses save dialog + native file write.
  - Can reveal files/directories in the OS file explorer.

Why it matters:
- Portable export should match semantically across platforms.
- OS-level file reveal is Desktop-only.

### Hashing / MD5

- Web:
  - `src/core/domain/md5/webMd5.ts`
  - JS implementation.
- Desktop:
  - `src/tauri/domain/md5/TauriMd5Service.ts`
  - Rust invoke path.

Why it matters:
- Usually low risk, but worth noting if content fingerprinting ever drifts between platforms.

### Cloud Host / Transport Configuration

- Web:
  - `src/web/main.tsx`
  - Uses `VITE_GITEA_WEB_HOST`
  - Uses `VITE_GIT_CORS_PROXY_URL` for browser Git transport
  - Browser Git routes through proxy semantics.
- Desktop:
  - `src/tauri/main.tsx`
  - Uses `VITE_GITEA_DESKTOP_HOST`
  - Native git/archive/network calls hit the direct host.

Why it matters:
- If cloud behavior differs by platform, check env wiring first.
- Some non-git flows may still trust external URLs directly instead of reconstructing them from platform host config.

## Mostly JS Even On Desktop

These are useful to remember because they are not meaningfully split today:

- Workspace state, diff modal state, compare-source orchestration
- Save/review/revert product semantics
- Remote status hydration and sync branching
- Project metadata validation and attach/create remote orchestration
- Dexie project index usage in app code

Desktop may call native adapters underneath, but the behavior contract is still mostly decided in JS.

## Good Places To Check First When Behavior Differs

- Git-only issue:
  - `WebGitProvider.ts`
  - `TauriGitProvider.ts`
  - `src/tauri/rust/src/git.rs`
- Import-only issue:
  - `WebImportService.ts`
  - `TauriImportService.ts`
  - `src/tauri/rust/src/import.rs`
- USFM engine/perf issue:
  - `WebUsfmOnionService.ts`
  - `TauriUsfmOnionService.ts`
  - `src/tauri/rust/src/usfm_onion.rs`
- File/path permission issue:
  - `OpfsFileSystem.ts`
  - `TauriFileSystem.ts`
  - Tauri capability JSON files
- Desktop-only shell/settings issue:
  - `src/tauri/domain/settings/settings.ts`
  - `src/tauri/persistence/TauriOpener.ts`

## Current Rule Of Thumb

When adding new functionality:

- If it is pure product behavior or editor-state behavior, prefer shared JS.
- If it benefits from native path access, native HTTP, libgit2, native dialogs, or heavy batch work, it may need a Desktop seam.
- If Desktop gets a native path, note it here if Web has a materially different implementation or limitation.
