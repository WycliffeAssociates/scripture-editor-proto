# Cloud Publishing And Reconciliation Pseudocode

## Table of Contents

1. [Problem](#problem)
2. [Goals](#goals)
3. [Non-Goals](#non-goals)
4. [Current Touchpoints](#current-touchpoints)
5. [Proposed File Tree](#proposed-file-tree)
6. [Main Types And Interfaces](#main-types-and-interfaces)
7. [Primary Flows](#primary-flows)
8. [Function Stubs](#function-stubs)
9. [Testing Shape](#testing-shape)
10. [Decisions And Open Questions](#decisions-and-open-questions)
11. [Suggested Implementation Slices](#suggested-implementation-slices)

## Problem

Dovetail already has a local-first scripture editing model with:

- explicit `Review & Save`
- local Git-backed version history
- existing compare plumbing for left/right scripture review

The new feature needs to add **cloud publishing and reconciliation** for **editable scripture projects only**, while preserving those local-first guarantees.

In application terms:

- a user can connect a Gitea account
- link or create a remote repo for an editable scripture project
- keep saving locally first
- optionally publish after save
- explicitly review remote differences through Dovetail’s own diff UX when cloud state diverges

This is not generic remote sync. It is a scripture-specific cloud publishing layer on top of the existing local workspace and compare/save model.

## Goals

- Support Web and Tauri through shared contracts.
- Keep local save authoritative and first.
- Keep remote behavior behind non-technical UX.
- Preserve explicit review for USFM differences even when Git could merge mechanically.
- Reuse current save/history/compare seams where they already fit.
- Model auto-sync and auto-push as settings-driven policy, not hidden behavior.
- Persist durable remote linkage separately from mutable machine-local cloud status.

## Non-Goals

- Generic remote sync for reference resources in this scope.
- Multi-branch UI or branch management.
- Silent USFM merge behavior.
- User-authored commit messages.
- Rich merge tooling for arbitrary non-USFM files in v1.
- Making `useExternalCompare` the top-level cloud orchestrator.
- Treating exported/shared zips as portable cloud-linked projects.

## Current Touchpoints

- [projectToParsed.tsx](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/api/projectToParsed.tsx)
  - current project-open boundary into parsed workspace state
  - already ensures git readiness on editable opens
- [ensureProjectGitReady.ts](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/core/persistence/ensureProjectGitReady.ts)
  - current local Git bootstrap and detached-head recovery
- [GitProvider.ts](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/core/persistence/GitProvider.ts)
  - current shared local Git seam
- [useSaveAndRevert.ts](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/hooks/save/useSaveAndRevert.ts)
  - current local save -> write -> local commit path
- [useExternalCompare.ts](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/hooks/save/useExternalCompare.ts)
  - current left/right compare-source seam
- [compare/types.ts](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/project/compare/types.ts)
  - current compare session and compare source shapes
- [WorkspaceService.ts](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/core/persistence/WorkspaceService.ts)
  - current editor-facing workspace service facade
- [settings.ts](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/data/settings.ts)
  - current app-level settings contract
- [app/domain/settings/settings.ts](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/settings/settings.ts)
  - current shared settings persistence seam

## Proposed File Tree

This is intentionally a shape proposal, not a commitment to every exact filename.

```text
src/
  core/
    persistence/
      GitProvider.ts                         # extend remote-capable shared git contract
      projectCloudLink.ts                    # read/write Dovetail-owned project link file
    cloud/
      AuthSessionProvider.ts                 # app-global account/session seam
      CloudProjectService.ts                 # editor-facing cloud operations seam
      cloudTypes.ts                          # shared remote/link/status types

  app/
    data/
      settings.ts                            # add auto-sync / auto-push preferences
    domain/
      cloud/
        cloudStatusStore.ts                  # per-project app-local mutable state
        buildCloudCompareSource.ts           # convert remote latest into compare source
        resolveCloudMetadata.ts              # manifest / checksum regeneration rules
      api/
        projectToParsed.tsx                  # read cloud link, maybe kick open-time sync check
    persistence/
      DefaultProjectsService.ts              # create/link/clone cloud project orchestration
    ui/
      hooks/
        save/
          useCloudSync.ts                    # high-level cloud orchestration around save/sync
          useExternalCompare.ts              # stays compare-source focused

  web/
    adapters/
      cloud/
        WebAuthSessionProvider.ts
        WebCloudProjectService.ts

  tauri/
    adapters/
      cloud/
        TauriAuthSessionProvider.ts
        TauriCloudProjectService.ts
```

### Naming Notes

- `CloudProjectService` is preferred over `RemoteSyncService`.
  - It matches the product framing: cloud publishing and reconciliation.
  - It avoids collision with existing reference-resource `remote sync` language.
- `projectCloudLink.ts` is preferred over storing cloud facts in generic project metadata helpers.
  - It makes the Dovetail-owned file explicit.
- `cloudStatusStore.ts` is intentionally separate from the project link file.
  - durable linkage and mutable local status are different categories of state.

## Main Types And Interfaces

### Durable Project Link Types

```ts
type ProjectCloudLink = {
  schemaVersion: 1;
  hostBaseUrl: string;
  repoId: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  trackedBranch: string;
};

type ProjectCloudLinkFile = ProjectCloudLink | null;
```

Notes:

- This file lives in the project and is stripped during export/share/import-zip flows.
- It contains durable linkage only.
- It does not contain session, status, retry counts, or timestamps.

### App-Local Mutable Project Cloud State

```ts
type ProjectCloudStatus =
  | "connected"
  | "syncing"
  | "offline"
  | "pendingPublish"
  | "remoteUpdatesAvailable"
  | "needsReview"
  | "reauthRequired";

type ProjectCloudStatusRecord = {
  projectPath: string;
  status: ProjectCloudStatus;
  lastCheckedAt?: string;
  lastPublishedAt?: string;
  lastKnownRemoteHead?: string;
  lastKnownLocalHead?: string;
  pendingReason?: "offline" | "pushRejectedRemoteAdvanced" | "sessionMissing";
};
```

Notes:

- These properties belong to a project conceptually.
- They are still app-local because they are this install’s observation of the cloud relationship.
- They should be persisted keyed by project, but never tracked in Git.

### App-Global Session Types

```ts
type CloudSession = {
  username: string;
  token: string;
  tokenId?: string;
};

type PendingTokenRevocation = {
  tokenId: string;
  retryCount: number;
  lastAttemptAt?: string;
};
```

Notes:

- Exactly one active session per install in v1.
- Local logout succeeds even if remote deletion cannot.
- Revocation retry is bounded and stops on terminal failures.

### Settings Additions

```ts
type Settings = {
  // existing fields...
  cloudAutoSyncOnOpen: boolean;
  cloudAutoPushOnSave: boolean;
};
```

Notes:

- These are policy guards, not hidden implementation details.
- `Sync` still exists as an explicit action even when both are false.

### Shared Cloud Service Interfaces

```ts
interface AuthSessionProvider {
  login(): Promise<CloudSession>;
  getCurrentSession(): CloudSession | null;
  logout(): Promise<{ revokedRemotely: boolean }>;
  retryPendingRevocations(): Promise<void>;
}

interface CloudProjectService {
  listWritableRepos(): Promise<CloudRepoSummary[]>;
  createRepo(input: CreateCloudRepoInput): Promise<CloudRepoSummary>;
  cloneLinkedProject(input: CloneCloudProjectInput): Promise<ClonedCloudProject>;
  attachExistingProject(input: AttachCloudProjectInput): Promise<ProjectCloudLink>;
  inspectRemoteState(input: InspectRemoteStateInput): Promise<RemoteStateSummary>;
  fetchRemoteLatest(input: FetchRemoteLatestInput): Promise<RemoteLatestSnapshot>;
  publishCurrentBranch(input: PublishCurrentBranchInput): Promise<PublishResult>;
}

type CloudRepoSummary = {
  repoId: string;
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
};
```

Notes:

- `AuthSessionProvider` is app-global.
- `CloudProjectService` is per-feature but stateless enough to be adapter-backed.
- Current `GitProvider` should probably be extended for remote Git operations used by cloud publishing, but account/session API does not belong inside it.

### Compare Source Extension

The compare seam should gain a remote-latest source, but without moving orchestration into `useExternalCompare`.

```ts
type CompareSourceKind =
  | "existingProject"
  | "zipFile"
  | "directory"
  | "previousVersion"
  | "remoteLatest";

type CompareSessionConfig = {
  mode: "unsaved" | "external";
  source:
    | { kind: "remoteLatest"; projectPath: string; remoteHead: string; }
    | /* existing variants */;
};
```

Note:

- `useExternalCompare` remains the compare-source loading and apply mechanism.
- A higher-level cloud flow should decide when remote latest becomes the active compare source.

## Primary Flows

### 1. Open Editable Project With Cloud Awareness

1. `Route.loader()`
2. `projectParamToParsedScripture(args)`
3. `openEditableScripture(...)`
4. `ensureProjectGitReady(...)`
5. `readProjectCloudLink(projectPath)`
6. `hydrateProjectCloudStatus(projectPath)`
7. if `settings.cloudAutoSyncOnOpen && link && session`
8. queue `CloudOpenSyncCoordinator.check(link, currentHeads, inBackground: true)`
9. parse scripture into working state
10. render editor immediately
11. if remote differs, update per-project status to `remoteUpdatesAvailable` or `needsReview`

Reasoning:

- open should not block on cloud unless a future product decision changes that
- cloud check is a background side effect after local editable open succeeds

### 2. Create Remote And Link Existing Local Project

1. `CreateProjectFlow.onCreateRemoteIntent()`
2. `AuthSessionProvider.getCurrentSession()` or `login()`
3. `CloudProjectService.createRepo(input)`
4. `CloudProjectService.attachExistingProject(input)`
5. `writeProjectCloudLink(projectPath, link)`
6. `cloudStatusStore.set(projectPath, "connected")`
7. optional first publish path enters `PublishCoordinator.publishAfterSaveOrExplicitIntent()`

Reasoning:

- link creation is distinct from later mutable status
- the project-local file should be the durable evidence of cloud association

### 3. Explicit Sync With Unsaved In-Memory Changes

1. `Toolbar.onSyncIntent()`
2. `CloudSyncCoordinator.startExplicitSync(projectPath, workingFilesRef)`
3. `CloudProjectService.fetchRemoteLatest(...)`
4. `buildCloudCompareSource(remoteLatest, metadataRules)`
5. `useExternalCompare.loadRemoteLatest(compareSource)`
6. present combined review UI
7. user accepts/rejects incoming USFM changes into working memory
8. working state remains unsaved
9. user later triggers `Review & Save`

Reasoning:

- this preserves the “current left in memory vs remote latest right” model
- it avoids forcing a local save just to start review

### 4. Review And Save With Auto Push Enabled

1. `DiffModal.saveAllChanges()`
2. `useSaveAndRevert.saveProjectToDisk()`
3. build local save payload from dirty working files
4. write changed books to workspace
5. regenerate derived metadata if needed
6. create local save commit
7. if `settings.cloudAutoPushOnSave && projectHasCloudLink`
8. `PublishCoordinator.publishCurrentLocalHead()`
9. if publish succeeds -> set status `connected`
10. if offline -> set status `pendingPublish`
11. if remote advanced -> keep local commit and set status `needsReview`

Reasoning:

- local save/commit remains authoritative
- cloud publish is follow-on behavior guarded by settings

### 5. Reconciliation Review And Final Publish

1. `CloudSyncCoordinator.enterNeedsReview(projectPath)`
2. `CloudProjectService.fetchRemoteLatest(...)`
3. `buildCloudCompareSource(...)`
4. `useExternalCompare` computes diffs against current in-memory left
5. UI labels remote side as incoming cloud changes
6. user applies incoming hunks / chapters / whole remote side as needed
7. working state is now resolved but unsaved
8. `Review & Save`
9. save writes resolved USFM + regenerated metadata
10. local save commit created
11. publish current branch

Reasoning:

- no merge-commit UX
- resolved content is just the next working state that the user explicitly saves

### 6. Clone From Cloud Into New Local Project

1. `CreateRoute.onChooseCloudProject()`
2. `CloudProjectService.listWritableRepos()`
3. user picks repo
4. `CloudProjectService.cloneLinkedProject(...)`
5. validate repo content shape at import boundary
6. if valid, keep Git history
7. write project cloud link file
8. index project and open locally

Reasoning:

- writable cloud clone is the only path where preserving history is desired in v1
- unsupported content should fail fast rather than silently importing as a linked editable project

## Function Stubs

### Durable Link File Boundary

```ts
async function readProjectCloudLink(projectPath: string): Promise<ProjectCloudLinkFile> {
  // read Dovetail-owned cloud link file from project root
  // validate schema version and required fields
  // return null when file is absent
}

async function writeProjectCloudLink(
  projectPath: string,
  link: ProjectCloudLink,
): Promise<void> {
  // persist durable cloud linkage facts only
}

async function removeProjectCloudLink(projectPath: string): Promise<void> {
  // used by export/share sanitization or explicit unlink flows
}
```

### Project Cloud Status Store

```ts
interface CloudStatusStore {
  get(projectPath: string): ProjectCloudStatusRecord | null;
  set(projectPath: string, record: ProjectCloudStatusRecord): void;
  patch(projectPath: string, updates: Partial<ProjectCloudStatusRecord>): void;
  clear(projectPath: string): void;
}
```

### Open-Time Background Check

```ts
async function checkProjectCloudOnOpen(args: {
  projectPath: string;
  settings: Settings;
  session: CloudSession | null;
  cloudLink: ProjectCloudLink | null;
  gitProvider: GitProvider;
  cloudProjectService: CloudProjectService;
  cloudStatusStore: CloudStatusStore;
}): Promise<void> {
  // exit early when no cloud link
  // exit early when auto-sync-on-open is disabled
  // exit early when no current session, but mark reauth if linked
  // inspect local/remote heads
  // if same -> patch connected + lastCheckedAt
  // if remote changed and local working tree is clean -> mark remoteUpdatesAvailable
  // if divergence exists -> mark needsReview
  // if offline -> mark offline
}
```

### Combined Sync Review Entry

```ts
async function beginCloudReview(args: {
  projectPath: string;
  mutWorkingFilesRef: ScriptureBookState[];
  cloudLink: ProjectCloudLink;
  cloudProjectService: CloudProjectService;
  compareBridge: CloudCompareBridge;
}): Promise<CloudReviewSession> {
  // fetch remote latest scripture snapshot
  // regenerate / normalize remote-side metadata if needed for compare context
  // convert remote latest into a compare source shape
  // load that source into the existing compare pipeline
  // return a session summary for UI status and follow-up save behavior
}
```

### Save Then Publish Coordinator

```ts
async function saveThenMaybePublish(args: {
  saveResult: LocalSaveCommitResult;
  projectPath: string;
  settings: Settings;
  cloudLink: ProjectCloudLink | null;
  cloudProjectService: CloudProjectService;
  cloudStatusStore: CloudStatusStore;
}): Promise<void> {
  // if no cloud link -> exit
  // if auto-push disabled -> mark connected or pending manual publish
  // publish current tracked branch
  // on success -> patch connected + lastPublishedAt
  // on offline -> patch pendingPublish
  // on remote advanced -> patch needsReview
}
```

### Metadata Rewrite Boundary

```ts
async function reconcileDerivedCloudMetadata(args: {
  loadedProject: Project;
  currentWorkingFiles: ScriptureBookState[];
}): Promise<void> {
  // inspect current project type
  // if scripture burrito -> rewrite derived checksum / timestamp / ingredient facts
  // preserve remote-only extra files where policy says to preserve them
}
```

## Testing Shape

The testing pyramid for this work should stay boundary-oriented.

### Unit Tests

Focus on:

- link file parsing and validation
- cloud status store transitions
- settings guard behavior
- logout revocation retry rules
- remote state classification
- metadata rewrite rules
- compare source building for remote latest

Why:

- these are pure shape and transition rules
- they carry the most architectural meaning cheaply

### Integration Tests

Focus on:

- open editable project with cloud link and background check
- save local-first then publish success/failure classification
- explicit sync entering compare/review flow
- clone linked project preserving history
- export/share stripping link and `.git`

Why:

- these test cross-module call paths and persistence boundaries
- they validate orchestration without relying on full UI click coverage

### E2E Tests

Focus on a narrow set of user-critical journeys:

1. connect account -> create remote -> publish local project
2. linked project -> save -> auto-publish
3. second device/browser equivalent -> open from cloud -> review incoming changes
4. offline save -> pending publish -> later explicit sync

Why:

- these are the promises users care about
- they should avoid over-testing implementation details inside compare or save hooks

Testing cautions:

- do not overmock compare internals when testing review entry; assert source shape and state transition boundaries instead
- do not unit-test trivial file reshaping
- prefer checking status transitions and call ordering at orchestration seams

## Decisions And Open Questions

### Decisions Already Made

- product framing is `cloud publishing and reconciliation`
- editable scripture projects only in v1
- one tracked branch only
- durable cloud link file lives in project
- mutable project cloud status is app-local per project
- session is app-global
- current in-memory left vs remote latest right is the review model
- explicit USFM review even for mechanically mergeable changes
- local save/commit first, cloud publish second
- use logged-in account as commit author

### Open Questions Still Worth Carrying Forward

- exact filename and on-disk location of the Dovetail cloud link file
- whether `CloudProjectService` should own remote Git transport directly or delegate some operations into an extended `GitProvider`
- exact UI shape for combined save-and-sync review versus today’s diff modal
- exact rule for non-derived manifest fields that change remotely
- whether “manual publish pending” deserves its own user-facing status distinct from `connected`
- whether remote-open notifications should immediately open review or just surface a banner

## Suggested Implementation Slices

### Slice 1: Durable Types And Settings Guards

- add cloud settings fields
- add shared cloud types
- add link-file read/write helpers
- add per-project cloud status store

This slice creates vocabulary and persistence shape without remote transport yet.

### Slice 2: Session And Repo Listing

- add `AuthSessionProvider`
- add basic `CloudProjectService` repo listing / repo creation
- wire account-global login/logout state

This slice proves auth and cloud catalog behavior.

### Slice 3: Project Linking And Clone Path

- attach existing project to remote
- create remote from local project
- clone writable cloud project into local editable project
- validate and preserve history on the cloud-clone path

This slice establishes durable project linkage.

### Slice 4: Save Then Publish

- extend save pipeline with publish guard
- classify success / offline / remote advanced
- persist per-project cloud status

This slice delivers the core “publish my own project” story.

### Slice 5: Remote Latest Compare Source

- add `remoteLatest` compare source kind
- build remote latest -> compare source bridge
- enter combined review flow from explicit sync / needs review

This slice delivers reconciliation without yet polishing every UI edge.

### Slice 6: Metadata Rewrite And Export Sanitization

- regenerate derived metadata before save/publish
- preserve remote extra files per policy
- strip cloud linkage and `.git` on export/share/import-zip

This slice removes the most obvious correctness and portability traps.
