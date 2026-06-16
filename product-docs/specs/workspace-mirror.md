# Workspace Mirror (off-main analysis & crash-recovery backup)

A **mirror** is a passive replica of the editor's per-chapter token state that
lives wherever the analysis engines live — a **web worker** on web, a
**Rust-managed resident `State`** (reached over IPC) on desktop. It exists so
lint, sous, and crash-recovery backup serialization run OFF the main thread. The
main thread is the SOLE writer: on each working-files commit it tokenizes the
chapters that changed and pushes a token delta; the mirror applies it and, on
command, reads its OWN resident tokens to run an engine or serialize a backup.
The mirror never walks Lexical state and never receives a re-serialized book —
only token deltas cross the boundary.

This is the companion to `state-architecture.md` (which owns the main-thread
store + pipelines). The pipelines that used to call lint/sous/backup services
inline now send commands to the mirror and commit the results back through one
router.

## Why off-main

Per commit, the main thread serialized lint + sous + a crash-recovery backup
on the typing path, stacking work that dropped frames on large chapters. The
mirror keeps **policy** on main (debounce, scope folding, ordering, the commit
stream) and moves the **heavy work** — wasm lint/sous and USFM serialization +
md5 — to a replica beside the engines. Findings and backups are latest-wins, so
the replica can drop/coalesce freely rather than backpressure the editor.

## The protocol vocabulary

`mirrorProtocol.ts` is the transport-agnostic message set. Every message carries
the `generation` it describes.

- **Patches** (main → mirror, the only token-carrying verbs): `pushChapter`,
  `deleteChapter`, `pushBaseline`, `fullSync` (the load-time seed / project
  resync — replaces the whole mirror), `syncMeta` (dirty-flag + disk-baseline
  sync with no tokens — the cheap save-clean-mark path).
- **Commands** (main → mirror, read resident state → produce a result):
  `analyzeLint`, `analyzeSous`, `writeBackup`, `clearBackup`. Analyze scope is
  **book-granular** (`AnalyzeScope = { books } | "all"`); the mirror widens a
  changed chapter to its book and reads resident tokens.
- **Results** (mirror → main, stamped with the generation they ran at):
  `lintResult`, `sousResult`, `backupResult`, `resyncRequest`.

## The state machine

`WorkspaceMirror.ts` is a PLAIN module — no Worker, no DOM, no `postMessage` —
so it is unit-testable directly and runs unchanged whether hosted in a worker or
inline. Resident state is per-chapter `{ tokens, eol, dirty }` keyed
`(book, chapter)`, plus per-book disk baselines for the backup envelope. Patches
mutate it **idempotently by generation** (a patch older than what a chapter
already holds is a no-op — covering an unordered or replayed transport).
Commands assemble scope from resident state and call the injected `MirrorEngines`
(`lintBook` / `analyzeSousBook` / `computeMd5` / `persistBackup` / `clearBackup`).

## Data flow: commit → analyze / backup → result

- `mirrorPatchProducer.ts` — on each commit, tokenizes the one changed chapter
  and pushes the delta; `seedMirror` pushes a `fullSync` at load. It also owns
  `awaitInitialFindings` (the load contract's first pass).
- The `lintPipeline` / `sousPipeline` / `dirtyBufferPipeline` send
  `analyzeLint` / `analyzeSous` / `writeBackup` commands to the `MirrorFeed`
  (a multicast feed; one sink per platform session).
- `mirrorResultRouter.ts` consumes results and lands them in the main-thread
  stores: lint/sous → normalize + commit into the `FindingsStore` (onion / sous
  slices); backup → web persisted itself, desktop ships envelope bytes back for
  the FS write. A per-class **generation high-water mark** drops stale results;
  a `resyncRequest` re-seeds the mirror (coalesced by generation).

## Platforms

- **Web** (`src/web/domain/mirror/`): one worker (`workspaceMirror.worker.ts`)
  hosting a `WorkspaceMirror` with `webMirrorEngines` — lint + sous wasm and an
  OPFS-backed backup (`persistBackup` writes directly, returns `true`).
- **Desktop** (`src/tauri/domain/mirror/` + `src-tauri/.../mirror.rs`): the
  session composes **two sinks** on the feed — `RustMirrorSession` owns lint/sous
  (tokens are born in Rust at parse; edits flow as `mirror_push_patch`; analyze
  reads the resident Rust `State`), and a wasm-free `BackupWorkerSession` owns
  crash-recovery backup. The backup worker has NO analysis engines
  (`backupOnlyMirrorEngines` throws if asked to lint/sous); it serializes the
  envelope in JS off-main and **bounces the bytes back to main** for the Tauri
  FS write, because a worker can't `invoke` (`persistBackup` / `clearBackup`
  return `false` to signal "main writes/clears"). A single Rust-side serializer
  would let desktop collapse to one sink — a tracked future cleanup.

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

## Tracing

`mirrorTrace.ts` instruments every async boundary, gated by
`localStorage.mirrorTrace = "1"` (zero cost when off). Workers relay trace
entries to the main console, since worker logs aren't otherwise captured.

## Key files

- `src/app/domain/mirror/` — `mirrorProtocol.ts`, `MirrorFeed.ts`,
  `WorkspaceMirror.ts`, `workspaceKernel.ts`, `mirrorSessionFactory.ts`,
  `mirrorTrace.ts`, `retryBackupWrite.ts`, `workerMessages.ts`
- `src/app/domain/editor/pipelines/` — `mirrorPatchProducer.ts`,
  `mirrorResultRouter.ts`
- `src/web/domain/mirror/` — `WorkerMirrorSession.ts`, `webMirrorEngines.ts`,
  `workspaceMirror.worker.ts`
- `src/tauri/domain/mirror/` — `RustMirrorSession.ts`, `BackupWorkerSession.ts`,
  `backupOnlyMirrorEngines.ts`, `backupWorker.worker.ts`
- `src/tauri/rust/src/mirror.rs` — the resident token `State` + lint/sous DTOs
- A shared protocol fixture (`tests/unit/mirrorProtocolFixtures.test.ts` +
  `mirror.rs` tests) pins the TS↔Rust wire contract from both sides.
