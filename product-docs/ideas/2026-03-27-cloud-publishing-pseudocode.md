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

- Support Web and Tauri through shared contracts/interfaces.
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
      projectLocalGitRemoteInfo.ts           # read/write Dovetail-owned project link file
    remote/
      AuthSessionProvider.ts                 # app-global account/session seam
      GitRemoteProjectService.ts             # editor-facing remote repo / publish operations seam
      remoteTypes.ts                         # shared remote/link/status types

  app/
    data/
      settings.ts                            # add auto-sync / auto-push preferences
    domain/
      remote/
        gitRemoteStatusStore.ts              # per-project app-local mutable state
        buildGitRemoteCompareSource.ts       # convert remote latest into compare source
        resolveDerivedProjectMetadata.ts     # manifest / checksum regeneration rules
      api/
        projectToParsed.tsx                  # read remote link, maybe kick open-time sync check
    persistence/
      DefaultProjectsService.ts              # create/link/clone remote project orchestration
    ui/
      hooks/
        save/
          useGitRemoteSync.ts                # high-level remote orchestration around save/sync
          useExternalCompare.ts              # stays compare-source focused

  web/
    adapters/
      remote/
        WebAuthSessionProvider.ts
        WebGitRemoteProjectService.ts

  tauri/
    adapters/
      remote/
        TauriAuthSessionProvider.ts
        TauriGitRemoteProjectService.ts
```

### Naming Notes

- Product language should stay `cloud publishing and reconciliation`.
- Internal code names can lean on `remote` or `gitRemote`.
  - Git terminology is acceptable in code where it clarifies transport and history behavior.
  - This lets us keep product copy friendly without making internal APIs vague.
- `GitRemoteProjectService` is preferred over `RemoteSyncService`.
  - it stays close to the actual responsibility boundary
  - it avoids reusing existing translation-notes `remote sync` language
- `projectLocalGitRemoteInfo.ts` is preferred over storing remote facts in generic project metadata helpers.
  - It makes the Dovetail-owned file explicit.
- `gitRemoteStatusStore.ts` is intentionally separate from the project link file.
  - durable linkage and mutable local status are different categories of state.

## Main Types And Interfaces

### Durable Project Link Types

```ts
type ProjectLocalGitRemoteInfo = {
  schemaVersion: 1;
  hostBaseUrl: string;
  repoId: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  trackedBranch: string;
};

type ProjectLocalGitRemoteInfoFile = ProjectLocalGitRemoteInfo | null;
```

Notes:

- This file lives in the project and is stripped during export/share/import-zip flows.
- It contains durable linkage only.
- It does not contain session, status, retry counts, or timestamps.

### App-Local Mutable Project Cloud State

```ts
type GitRemoteProjectStatus =
  | "connected"
  | "syncing"
  | "offline"
  | "pendingPublish"
  | "remoteUpdatesAvailable"
  | "needsReview"
  | "reauthRequired";

type GitRemoteProjectStatusRecord = {
  projectPath: string;
  status: GitRemoteProjectStatus;
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
type AuthSession = {
  username: string;
  token: string;
  tokenId: string;
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
  gitRemoteAutoSyncOnOpen: boolean;
  gitRemoteAutoPushOnSave: boolean;
};
```

Notes:

- These are policy guards, not hidden implementation details.
- `Sync` still exists as an explicit action even when both are false.

### Shared Cloud Service Interfaces

```ts
interface AuthSessionProvider {
  login(): Promise<AuthSession>;
  getCurrentSession(): AuthSession | null;
  logout(): Promise<{ revokedRemotely: boolean }>;
  retryPendingRevocations(): Promise<void>;
}

interface GitRemoteProjectService {
  listWritableRepos(input: ListWritableReposInput): Promise<GitRemoteRepoSummary[]>;
  createRepo(input: CreateGitRemoteRepoInput): Promise<GitRemoteRepoSummary>;
  cloneLinkedProject(input: CloneGitRemoteProjectInput): Promise<ClonedGitRemoteProject>;
  attachExistingProject(input: AttachGitRemoteProjectInput): Promise<ProjectLocalGitRemoteInfo>;
  inspectRemoteState(input: InspectGitRemoteStateInput): Promise<RemoteStateSummary>;
  fetchRemoteLatest(input: FetchGitRemoteLatestInput): Promise<RemoteLatestSnapshot>;
  publishCurrentBranch(input: PublishGitRemoteBranchInput): Promise<PublishResult>;
}

type ListWritableReposInput = {
  hostBaseUrl: string;
  topicFilter?: string;
  page: number;
  pageSize: number;
};

type CreateGitRemoteRepoInput = {
  hostBaseUrl: string;
  owner: string;
  repoName: string;
  defaultBranch: string;
  visibility: "public" | "private";
  topics: string[];
};

type CloneGitRemoteProjectInput = {
  repoId: string;
  repoUrl: string;
  trackedBranch: string;
  destinationProjectPath: string;
};

type AttachGitRemoteProjectInput = {
  projectPath: string;
  repoId: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  trackedBranch: string;
};

type InspectGitRemoteStateInput = {
  projectPath: string;
  repoUrl: string;
  trackedBranch: string;
  localHead: string | null;
};

type FetchGitRemoteLatestInput = {
  projectPath: string;
  repoUrl: string;
  trackedBranch: string;
  mode: "scriptureSnapshot" | "fullRepoSnapshot";
};

type PublishGitRemoteBranchInput = {
  projectPath: string;
  repoUrl: string;
  trackedBranch: string;
  localHead: string;
};

type GitRemoteRepoSummary = {
  repoId: string;
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
};

type ClonedGitRemoteProject = {
  projectPath: string;
  link: ProjectLocalGitRemoteInfo;
};

type RemoteStateSummary = {
  localHead: string | null;
  remoteHead: string | null;
  relationship: "upToDate" | "aheadOnly" | "behindOnly" | "diverged" | "untrackedRemote";
};

type RemoteLatestSnapshot = {
  remoteHead: string;
  files: Map<string, string | Uint8Array>;
  metadataMode: "scriptureSnapshot" | "fullRepoSnapshot";
};

type PublishResult = {
  outcome: "published" | "offline" | "remoteAdvanced" | "reauthRequired";
  remoteHead?: string;
};
```

Notes:

- `AuthSessionProvider` is app-global.
- `GitRemoteProjectService` is per-feature but stateless enough to be adapter-backed.
- `inspectRemoteState()` is the lightweight head/relationship check.
- `fetchRemoteLatest()` is the heavier content fetch used only when review or clone actually needs content.
- `GitProvider` should own as much low-level fetch / push / replay plumbing as possible.
- account/session and repo catalog behavior still do not belong inside `GitProvider`.

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
- It can still orchestrate compare behavior once the remote branch of comparison is activated.
- The git-remote flow should populate that branch, not replace the compare hook with a second review system.

## Primary Flows

### 1. Open Editable Project With Cloud Awareness

1. `Route.loader()`
2. `projectParamToParsedScripture(args)`
3. `openEditableScripture(...)`
4. `ensureProjectGitReady(...)`
5. `readProjectCloudLink(projectPath)`
6. `hydrateProjectCloudStatus(projectPath)`
7. if `settings.gitRemoteAutoSyncOnOpen && link && session`
8. queue `GitRemoteOpenSyncCoordinator.check(link, currentHeads, inBackground: true)`
9. parse scripture into working state
10. render editor immediately
11. if remote differs, update per-project status to `remoteUpdatesAvailable` or `needsReview`

Reasoning:

- open should not block on cloud unless a future product decision changes that
- cloud check is a background side effect after local editable open succeeds

### 2. Create Remote And Link Existing Local Project

1. `CreateProjectFlow.onCreateRemoteIntent()`
2. `AuthSessionProvider.getCurrentSession()` or `login()`
3. `GitRemoteProjectService.createRepo(input)`
4. `GitRemoteProjectService.attachExistingProject(input)`
5. `writeProjectLocalGitRemoteInfo(projectPath, link)`
6. `gitRemoteStatusStore.set(projectPath, "connected")`
7. optional first publish path enters `GitRemotePublishCoordinator.publishAfterSaveOrExplicitIntent()`

Reasoning:

- link creation is distinct from later mutable status
- the project-local file should be the durable evidence of cloud association

### 3. Explicit Sync With Unsaved In-Memory Changes

1. `Toolbar.onSyncIntent()`
2. `GitRemoteSyncCoordinator.startExplicitSync(projectPath, workingFilesRef)`
3. `GitRemoteProjectService.fetchRemoteLatest(...)`
4. `buildGitRemoteCompareSource(remoteLatest, metadataRules)`
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
7. if `settings.gitRemoteAutoPushOnSave && projectHasRemoteLink`
8. `GitRemotePublishCoordinator.publishCurrentLocalHead()`
9. if publish succeeds -> set status `connected`
10. if offline -> set status `pendingPublish`
11. if remote advanced -> keep local commit and set status `needsReview`

Reasoning:

- local save/commit remains authoritative
- cloud publish is follow-on behavior guarded by settings

### 5. Reconciliation Review And Final Publish

1. `GitRemoteSyncCoordinator.enterNeedsReview(projectPath)`
2. `GitRemoteProjectService.fetchRemoteLatest(...)`
3. `buildGitRemoteCompareSource(...)`
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

### 5a. Remote Advanced With Dirty Memory But No Unpublished Local Commits

1. fetch `remoteLatest`
2. compare current in-memory left against remote latest right
3. user resolves into working memory
4. save writes resolved state
5. new local save commit is created directly on top of `remoteLatest`

Reasoning:

- no explicit rebase is required in this case
- there is no unpublished local commit history to replay

### 5b. Remote Advanced With Unpublished Local Commits

1. inspect relationship -> `diverged` or `aheadOnlyThenRemoteAdvanced`
2. fetch `remoteLatest`
3. compare latest local working state against remote latest
4. user resolves into working memory
5. before final save/publish, perform hidden replay of unpublished local commits onto `remoteLatest`
6. write resolved working state
7. create final local save commit on top of replayed history
8. publish branch

Reasoning:

- we do not want merge commits in the user-facing model
- we do not want to squash away unpublished local commits
- under the hood this is a rebase / cherry-pick-style replay path even though the user never sees that vocabulary

### 6. Clone From Cloud Into New Local Project

1. `CreateRoute.onChooseCloudProject()`
2. `GitRemoteProjectService.listWritableRepos()`
3. user picks repo
4. `GitRemoteProjectService.cloneLinkedProject(...)`
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
async function readProjectLocalGitRemoteInfo(projectPath: string): Promise<ProjectLocalGitRemoteInfoFile> {
  // read Dovetail-owned cloud link file from project root
  // validate schema version and required fields
  // return null when file is absent
}

async function writeProjectLocalGitRemoteInfo(
  projectPath: string,
  link: ProjectLocalGitRemoteInfo,
): Promise<void> {
  // persist durable cloud linkage facts only
}

async function removeProjectLocalGitRemoteInfo(projectPath: string): Promise<void> {
  // used by export/share sanitization or explicit unlink flows
}
```

### Project Cloud Status Store

```ts
interface GitRemoteStatusStore {
  get(projectPath: string): GitRemoteProjectStatusRecord | null;
  set(projectPath: string, record: GitRemoteProjectStatusRecord): void;
  patch(projectPath: string, updates: Partial<GitRemoteProjectStatusRecord>): void;
  clear(projectPath: string): void;
}
```

### Open-Time Background Check

```ts
async function checkProjectCloudOnOpen(args: {
  projectPath: string;
  settings: Settings;
  session: AuthSession | null;
  remoteInfo: ProjectLocalGitRemoteInfo | null;
  gitProvider: GitProvider;
  gitRemoteProjectService: GitRemoteProjectService;
  gitRemoteStatusStore: GitRemoteStatusStore;
}): Promise<void> {
  // exit early when no remote link
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
  remoteInfo: ProjectLocalGitRemoteInfo;
  gitRemoteProjectService: GitRemoteProjectService;
  compareBridge: GitRemoteCompareBridge;
}): Promise<GitRemoteReviewSession> {
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
  remoteInfo: ProjectLocalGitRemoteInfo | null;
  gitRemoteProjectService: GitRemoteProjectService;
  gitRemoteStatusStore: GitRemoteStatusStore;
}): Promise<void> {
  // if no remote link -> exit
  // if auto-push disabled -> mark connected or pending manual publish
  // publish current tracked branch
  // on success -> patch connected + lastPublishedAt
  // on offline -> patch pendingPublish
  // on remote advanced -> patch needsReview
}
```

### Metadata Rewrite Boundary

```ts
async function replayUnpublishedLocalCommitsOntoRemoteLatest(args: {
  projectPath: string;
  gitProvider: GitProvider;
  remoteHead: string;
  localAheadCommits: string[];
}): Promise<void> {
  // checkout or reset local branch to remoteHead
  // replay unpublished local commits in original order
  // use hidden rebase / cherry-pick semantics under the hood
  // surface failure as needsReview / replayFailed for higher-level orchestration
}

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
- replay classification for unpublished local commits

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

- exact filename and on-disk location of the Dovetail remote info file
- exact UI shape for combined save-and-sync review versus today’s diff modal
- exact rule for non-derived manifest fields that change remotely
- whether “manual publish pending” deserves its own user-facing status distinct from `connected`
- remote-open notifications should surface a banner that opens the relevant review UI, not force the modal immediately

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
- persist per-project remote status

This slice delivers the core “publish my own project” story.

### Slice 5: Remote Latest Compare Source And Replay

- add `remoteLatest` compare source kind
- build remote latest -> compare source bridge
- enter combined review flow from explicit sync / needs review
- add hidden replay path for unpublished local commits before final publish

This slice delivers reconciliation without yet polishing every UI edge.

### Slice 6: Metadata Rewrite And Export Sanitization

- regenerate derived metadata before save/publish
- preserve remote extra files per policy
- strip cloud linkage and `.git` on export/share/import-zip

This slice removes the most obvious correctness and portability traps.
