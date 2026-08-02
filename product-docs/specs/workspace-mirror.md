# Workspace Mirror (off-main analysis & crash-recovery backup)

A workspace host keeps resident Braid and Galley state beside the editor — in a
web worker on web or native Rust state on desktop. Braid owns the resident token
corpus and USFM semantics; Galley owns its projection and content-analysis cache.
The application coordinates commits, generations, recovery metadata, and IO but
does not retain a second resident token corpus for analysis or backup. Token
arrays cross only at named resident mutation/seed boundaries.

This is the companion to `state-architecture.md` (which owns the main-thread
store + pipelines). The pipelines that used to call lint/sous/backup services
inline now send commands to the mirror and commit the results back through one
router.

## Why off-main

Per commit, the main thread previously stacked lint, sous, serialization, and
checksum work on the typing path. The host keeps debounce and commit ordering on
main and moves Braid lint/serialization, Galley analysis, and backup production
beside the engines. Findings and backups remain generation-bound and disposable.

## The protocol vocabulary

`mirrorProtocol.ts` is the transport-agnostic message set. Every message carries
the `generation` it describes.

- **Patches** (main → resident host, the only token-carrying verbs): `pushChapter`,
  `deleteChapter`, `pushBaseline`, `fullSync` (the load-time seed / project
  resync — replaces the whole mirror), `syncMeta` (dirty-flag + disk-baseline
  sync with no tokens — the cheap save-clean-mark path).
- **Commands** (main → resident host): `analyzeLint`, `analyzeGalley`,
  `writeBackup`, and `clearBackup`. Braid lint is parameterless and publishes a
  complete resident-corpus snapshot; it does not receive an editor lint scope.
- **Results** (mirror → main, stamped with the generation they ran at):
  `lintResult`, `galleyResult`, `backupResult`, `resyncRequest`.

## The state machine

`WorkspaceMirror.ts` is a PLAIN coordination module — no Worker, DOM, or
`postMessage` — and remains directly unit-testable. It keeps chapter metadata and
per-book disk baselines for recovery policy; Braid/Galley hosts keep resident
tokens and projections. Patches mutate metadata and invoke named resident
operations idempotently by generation. Commands call the resident host for
parameterless Braid lint, Galley analysis, serialization, and backup policy.

## Data flow: commit → analyze / backup → result

- `mirrorPatchProducer.ts` — on each commit, tokenizes the one changed chapter
  and pushes the delta; `seedMirror` pushes a `fullSync` at load. It also owns
  `awaitInitialFindings` (the load contract's first pass).
- The `lintPipeline` / `sousPipeline` / `dirtyBufferPipeline` send
  `analyzeLint` / `analyzeGalley` / `writeBackup` commands to the `MirrorFeed`
  (a multicast feed; one sink per platform session).
- `mirrorResultRouter.ts` consumes results and lands them in the main-thread
  stores: lint/sous → normalize + commit into the `FindingsStore` (onion / sous
  slices); backup → web persisted itself, desktop ships envelope bytes back for
  the FS write. A per-class **generation high-water mark** drops stale results;
  a `resyncRequest` re-seeds the mirror (coalesced by generation).

## Platforms

- **Web** (`src/web/domain/mirror/`): one worker (`workspaceMirror.worker.ts`)
  hosting a `WorkspaceMirror` with `webMirrorEngines` — lint + resident Galley and an
  OPFS-backed backup (`persistBackup` writes directly, returns `true`).
- **Desktop** (`src/tauri/domain/mirror/` + `src/tauri/rust/src/mirror.rs`):
  `RustMirrorSession` owns the native Braid/Galley resident. Braid produces
  serialization and dirty-backup bytes in native state; Tauri performs the
  filesystem write. There is no legacy backup-only worker or second native token
  mirror.

## Ordering, idempotency, recovery

Web `postMessage` is FIFO; Tauri `invoke` is unordered. Generation stamping
makes both correct: patches apply idempotently and results drop when stale, so
no transport needs ordered delivery. When an analyze finds the mirror `behind`
(its patch hasn't landed yet), the session retries a bounded number of times,
then emits `resyncRequest`; the result router (or, at load,
`awaitInitialFindings`) re-seeds.

## The load contract (the kernel)

`workspaceKernel.ts` is a **single-slot, refcounted registry** for the off-React
machinery a workspace needs alive before the editor paints: the `MirrorFeed`,
the platform session(s), the seeded mirror, and the awaited initial findings.
The loader builds + seeds the kernel, awaits engine readiness, awaits an initial
project-wide lint + sous (so first paint shows findings without typing), and
hands the provider a `claim()`-able handle. The claim is **re-entrant** so a
StrictMode unmount/remount reuses the worker set instead of tearing it down; a
short grace-dispose absorbs preload/remount churn. Plain mode disables analysis,
so the kernel seeds the mirror (backup still needs resident tokens) but skips the
initial findings pass.

## Performance timing

The verbose cross-boundary mirror trace has been removed. Development builds
keep focused `console.time` entries around resident Galley book updates,
analysis, main-thread findings decode/reconciliation, and the commit-to-findings
path so frame-budget measurements stay readable.

## Key files

- `src/app/domain/mirror/` — `mirrorProtocol.ts`, `MirrorFeed.ts`,
  `WorkspaceMirror.ts`, `workspaceKernel.ts`, `mirrorSessionFactory.ts`,
  `retryBackupWrite.ts`, `workerMessages.ts`
- `src/app/domain/editor/pipelines/` — `mirrorPatchProducer.ts`,
  `mirrorResultRouter.ts`
- `src/web/domain/mirror/` — `WorkerMirrorSession.ts`, `webMirrorEngines.ts`,
  `workspaceMirror.worker.ts`
- `src/tauri/domain/mirror/` — `RustMirrorSession.ts`
- `src/tauri/rust/src/mirror.rs` — the resident Braid/Galley host and transport
- A shared protocol fixture (`tests/unit/mirrorProtocolFixtures.test.ts` +
  `mirror.rs` tests) pins the TS↔Rust wire contract from both sides.
