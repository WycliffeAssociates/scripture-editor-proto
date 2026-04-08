# Version Dock Prefetch and Docked History Tab

## Table of Contents
- [Problem](#problem)
- [Goals](#goals)
- [Non-Goals](#non-goals)
- [Current Touchpoints](#current-touchpoints)
- [Proposed File Tree](#proposed-file-tree)
- [Main Types and Interfaces](#main-types-and-interfaces)
- [Primary Flows](#primary-flows)
- [Function Stubs](#function-stubs)
- [Risks and Open Questions](#risks-and-open-questions)
- [Suggested Implementation Slices](#suggested-implementation-slices)

## Problem
The editor toolbar currently owns the “previous version” action, but the real UX goal is broader:

- versions should live in the bottom dock as their own tab
- the dock should show version history, changed chapters, and git-related metadata
- hovering a version row should start warming the data layer before click
- clicking a version should feel instant because the result is already in TanStack Query cache or in flight

The current version-history flow already exists, but it is split across:

- toolbar intent
- `useVersionHistory` for list/history navigation
- `useExternalCompare` for loading older snapshots into parseable scripture state
- the bottom panel, which currently only knows about `problems` and `cloud`

The plan is to move the UI ownership into the dock without breaking the underlying save/version behavior.

## Goals
- Move “previous version” out of the editor toolbar and into the dock.
- Add a dedicated dock tab for versions.
- Show useful version metadata:
  - commit / hash information
  - authored time
  - changed books / chapters
  - current-vs-version relationship state
- Prefetch version detail on hover after a short intent delay.
- Reuse TanStack Query cache on click so version switching feels fast.
- Keep the current working tree untouched while prefetching or previewing older versions.

## Non-Goals
- Do not redesign git history itself.
- Do not introduce a new checkout model or mutate the user’s current work tree to preview versions.
- Do not change save/revert semantics.
- Do not move compare-with-source or cloud compare into this task unless it is needed as a shared helper.
- Do not require a new persistence layer if the existing git provider and snapshot adapters can supply the data.

## Current Touchpoints

```text
src/app/ui/components/primitives/EditorToolbar/EditorToolbar.tsx
src/app/ui/components/primitives/ToolbarOverflowMenu/ToolbarOverflowMenu.tsx
src/app/ui/components/views/ProjectView.tsx
src/app/ui/components/views/bottom-panel/BottomPanel.tsx
src/app/ui/components/views/layout/WorkspaceShell.tsx

src/app/ui/hooks/useSave.tsx
src/app/ui/hooks/save/useVersionHistory.ts
src/app/ui/hooks/save/useExternalCompare.ts
src/app/domain/project/versionSnapshotAdapter.ts
src/app/domain/project/compare/compareSourceLoader.ts
src/app/domain/project/compare/remoteCompareSource.ts

src/core/persistence/GitProvider.ts
src/core/persistence/gitRemoteModels.ts
```

What exists today:
- `useVersionHistory` already loads history entries, applies a selected commit, and handles dirty prompts.
- `useSave` already threads version history and compare state into the workspace save domain.
- The bottom panel already has a `Tabs` shell for `problems` and `cloud`.
- The toolbar overflow menu already contains the old “Previous versions” entry point.

## Proposed File Tree

```text
src/app/ui/components/views/bottom-panel/
  BottomPanel.tsx
  ProblemsPanel.tsx
  CloudPanel.tsx
  VersionsPanel.tsx

src/app/ui/hooks/save/
  useVersionHistory.ts
  useVersionDock.ts
  versionQueries.ts

src/app/ui/components/primitives/EditorToolbar/
  EditorToolbar.tsx

src/app/ui/components/views/layout/
  WorkspaceShell.tsx
  ProjectView.tsx
```

Notes:
- `VersionsPanel.tsx` should own the dock UI, not the toolbar.
- `versionQueries.ts` should own query keys, fetchers, and prefetch helpers so hover and click use the same cache path.
- `useVersionDock.ts` should orchestrate the panel state and actions without duplicating git logic.

## Main Types and Interfaces

### Version list item
```ts
type VersionDockItem = {
  hash: string;
  authoredAtIso: string;
  summary: string;
  author?: string;
  isLatest: boolean;
  isSelected: boolean;
  changedBooks: Array<{
    bookCode: string;
    chapterNums: number[];
  }>;
  remoteInfo?: {
    trackedBranch: string;
    remoteName: string;
    relationship: "connected" | "behind" | "diverged" | "syncing" | "offline";
  };
};
```

### Query payloads
```ts
type VersionHistoryQueryResult = {
  entries: VersionEntry[];
  latestHash: string | null;
};

type VersionPreviewQueryResult = {
  parsedFiles: ScriptureBookState[];
  changedBooks: Array<{
    bookCode: string;
    chapterNums: number[];
  }>;
  metadata: {
    commitHash: string;
    authoredAtIso?: string;
    summary?: string;
  };
};
```

### Dock contract
```ts
type VersionsDockActions = {
  openVersionsTab(): void;
  prefetchVersion(hash: string): void;
  selectVersion(hash: string): Promise<void>;
  backToLatest(): Promise<void>;
};
```

### Query keys
```ts
versionQueries.history(projectPath)
versionQueries.preview(projectPath, hash)
versionQueries.changedChapters(projectPath, hash)
```

## Primary Flows

### 1. Open dock on the versions tab
1. User clicks the old `Previous versions` entry point.
2. Toolbar calls `openVersionsTab()`.
3. `ProjectView` opens the bottom panel and sets the active tab to `versions`.
4. `VersionsPanel` renders the list immediately from cache if present.

Reasoning:
- the toolbar should only own the intent to open the dock
- the dock should own the actual version UI

### 2. Hover a version row and prefetch after intent delay
1. Pointer enters a version row.
2. Start a 25ms timer.
3. If the pointer is still on that row after the delay, call `prefetchQuery()` for the preview key.
4. If the row changes or the pointer leaves before the delay expires, cancel the timer.
5. If a fetch is already in flight, reuse that promise through TanStack Query.

Reasoning:
- 25ms is an intent threshold, not a guaranteed fetch.
- prefetch should not punish fast pointer movement across the list.
- the cache should be the single source of truth for both hover and click paths.

### 3. Click a version row
1. User clicks a version row.
2. `selectVersion(hash)` checks the query cache first.
3. If a preview is already cached, apply it immediately.
4. If a preview is in flight, await that same promise.
5. If neither exists, fetch through the same query key and then apply.
6. After apply, mark the row as selected and update the editor state.

Reasoning:
- click should not duplicate the hover fetch path
- preview and apply should share the same key so one in-flight request benefits both

### 4. Show changed chapters and git info in the dock
1. `VersionsPanel` loads the history list.
2. The selected row expands or reveals metadata:
   - changed books/chapters
   - commit hash
   - authored time
   - relationship to latest/current state where available
3. The panel can surface “back to latest” and “load more” actions.

Reasoning:
- changed chapters are a scan-time cue, not just a detail view
- git metadata should stay visible so the user knows what they are about to load

### 5. Keep current work intact while previewing older versions
1. The query fetches snapshot data by commit hash.
2. The snapshot is converted into temporary scripture book state via the existing adapter.
3. The current working tree is not checked out or rewritten just for hover or preview.
4. Only the explicit selection path mutates the active editor state.

Reasoning:
- this avoids throwing away unsaved work
- it keeps hover prefetch safe and cheap

## Function Stubs

```ts
function useVersionDock(args: {
  queryClient: QueryClient;
  loadedProject: Project;
  gitProvider: GitProvider;
  editorMode: EditorModeSetting;
  usfmOnionService: IUsfmOnionService;
  onApplyVersion(hash: string): Promise<void>;
}) {
  // expose openVersionsTab, prefetchVersion, selectVersion, backToLatest
  // keep dock-specific UI state here
}
```

```ts
function buildVersionDockItems(entries: VersionEntry[]): VersionDockItem[] {
  // map git history entries to UI rows
  // attach latest/selected state
  // attach chapter metadata if cached
}
```

```ts
function useHoverIntentPrefetch(
  onIntent: () => void,
  delayMs = 25,
): {
  onPointerEnter(): void;
  onPointerLeave(): void;
  cancel(): void;
}
```

```ts
async function fetchVersionPreview(args: {
  loadedProject: Project;
  hash: string;
  gitProvider: GitProvider;
  editorMode: EditorModeSetting;
  usfmOnionService: IUsfmOnionService;
}): Promise<VersionPreviewQueryResult> {
  // read snapshot at commit
  // convert snapshot to scripture book states
  // derive changed chapters / metadata for the dock
}
```

```ts
function openVersionsTabFromToolbar() {
  // set bottom panel open
  // set active tab to versions
}
```

## Testing Shape

### Unit tests
- `versionQueries.ts`:
  - query keys are stable
  - hover-prefetch uses the same key as click
  - in-flight query reuse works as expected
- `useVersionDock.ts`:
  - opening the tab sets the bottom panel active tab correctly
  - selecting a version uses cached preview data when present

### Integration tests
- Dock tab opens from the toolbar entry point.
- Hovering a version row starts prefetch and clicking the same row is instant on a warm cache.
- Selecting a version does not mutate the current working tree unless the apply action completes.

### What not to overtest
- Do not test TanStack Query internals.
- Do not test exact hover timer implementation details beyond the behavior contract.
- Do not test git provider implementation here; that belongs closer to the persistence boundary.

## Risks and Open Questions
- Should the versions tab live alongside `problems` and `cloud`, or should it replace the toolbar entry with a dock section inside `cloud`?
- What is the exact version row payload?
  - commit hash only
  - or commit hash plus derived changed-chapter summary
- Do we want to prefetch only the selected row, or also the adjacent rows when the dock becomes visible?
- Should the hover intent threshold be shared with other dock/list hovers, or remain version-specific?
- Do we want “previous versions” to mean git history only, or also surface non-git checkpoints if those exist in the future?

## Suggested Implementation Slices
1. Add a `versions` dock tab and route the toolbar action into it.
2. Introduce a version query module with keys and fetchers for history + preview.
3. Build `VersionsPanel` on top of the existing git/version history data.
4. Add hover-intent prefetch for version rows.
5. Reuse cached or in-flight preview data on click.
6. Decide whether any compare-related shared helpers should be extracted from `useVersionHistory` / `useExternalCompare`.

