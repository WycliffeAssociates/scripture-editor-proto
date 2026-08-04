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

- **Patches** (main → resident host, the only token-carrying verbs):
  `pushChapter`, `deleteChapter`, `updateBook`, `removeBook`, `pushBaseline`,
  `fullSync` (whole-corpus replacement), `residentSeed` (post-load metadata only
  — the host already owns the corpus), `syncMeta` (dirty-flag + disk-baseline
  sync with no tokens — the cheap save-clean-mark path).
- **Commands** (main → resident host): `loadProject`, `analyzeLint`,
  `analyzeGalley`, `formatBraid`, `applyBraidFix`, `publishBraid`,
  `writeBackup`, `clearBackup`. Braid lint is parameterless and publishes a
  complete resident-corpus snapshot; it does not receive an editor lint scope.
- **Results** (mirror → main, stamped with the generation they ran at):
  `loadProjectResult`, `lintResult`, `galleyResult`, `formatBraidResult`,
  `applyBraidFixResult`, `publishBraidResult`, `braidCommandError`,
  `backupResult`, `resyncRequest`.

There is no main-thread replica of the corpus. The host keeps chapter metadata
and per-book disk baselines for recovery policy; Braid and Galley keep the
resident tokens and projections. Patches mutate that metadata and invoke named
resident operations idempotently by generation — a patch older than the state it
would replace is dropped rather than applied, per book for book-scoped patches
and per corpus for whole-corpus ones.

## Data flow: commit → analyze / backup → result

- `mirrorPatchProducer.ts` — on each commit, tokenizes the one changed chapter
  and pushes the delta. `seedResidentMirror` pushes the post-load metadata seed;
  `seedMirror` pushes a whole-corpus `fullSync` for a resync. It also owns
  `awaitInitialFindings`, now used only by the crash-recovery path.
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
  that is a transport shell around `webMirrorEngines` — resident Braid
  (`src/web/domain/braid/`), resident Galley (`src/web/domain/sous/`), and an
  OPFS-backed backup. Every large buffer it returns is transferred, not cloned
  (`resultTransferables.ts`).
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
the platform session, the seeded mirror metadata, and the first-paint findings.
It hands the provider a `claim()`-able handle. The claim is **re-entrant** so a
StrictMode unmount/remount reuses the worker set instead of tearing it down; a
short grace-dispose absorbs preload/remount churn.

**Arbitration precedes the load.** The route calls `reserveWorkspaceSlot` before
it creates a session or reads a byte, because loading is not a private act:
desktop's resident Braid/Galley live in one process-wide Tauri state, so
preparing a second session and discovering afterwards that the slot was taken
would already have overwritten the live workspace. A reservation resolves to
`reuse` (the slot already serves this project — its kernel returns the loader
payload it produced, and nothing reloads), `declined` (a preload that would have
evicted the live workspace), or `granted` (the outgoing kernel is disposed first,
then the caller loads and calls `install`). Native sessions additionally carry an
**epoch**: a load adopts it and resets the state it takes over, and a teardown
only resets state it still owns, so an out-of-order dispose from a superseded
session cannot wipe its successor.

**One load restores both arms.** `loadProject` asks the host to bring Braid up —
from its `corpus.bin` sidecar when Braid itself accepts it against the exact disk
bytes, otherwise from a cold parse that republishes and atomically replaces the
sidecar — and to answer Galley from its own cache or a fresh pass. The result
carries the packed container, every book's exact disk bytes with their md5, and
Galley's packed findings. Main verifies and materializes both
(`materializeLoadedProject.ts`), and the verification hands back Rust-materialized
lint findings for the same snapshot — so the load IS the initial analysis and no
follow-up `analyzeLint`/`analyzeGalley` runs on a clean open.

Braid is cold-seeded from each book's **exact disk bytes** (`BookInput::Usfm`),
never from a token round trip. That is what binds every hash Braid publishes to
the file actually on disk: the sidecar validates on reopen, main's verification
accepts the same bytes, and the crash-recovery md5 hashes real disk content.

A crash-recovered open is the one exception. Its restored books differ from what
the host loaded, so each is republished as a single `updateBook` (not a
whole-corpus resync) and one `analyzeLint` + `analyzeGalley` pass runs with
`cachePolicy: "none"` — unsaved recovered content must never be written into a
cache that claims to describe disk.

Plain mode seeds the mirror (backup still needs resident metadata) but publishes
no findings.

## The startup trace

`startupLog.ts` prints one ordered `[startup]` line per phase of an open —
sequence number, elapsed, measured duration, and fields including cache
hit/miss, byte counts, and warm-vs-cold. Hosts do not print: the worker and the
native mirror record their phases and return them with the load result, and main
replays them into the same sequence (marked `↳`, since their position is real
but their elapsed time is not). Sidecar writes outlive the trace, so they report
separately as `[startup:cache-write]`. It is not DEV-gated — a nightly build's
console is expected to show how a real project opened on a real machine.

## The warm cache

`braidWarmCache.ts` owns one opaque `corpus.bin` per workspace under the app
cache root, and nothing else: no source manifest beside it and no app-side
validity check. Validity is Braid's answer, given the sidecar plus the exact disk
bytes. Existence is never validity, so a write **always** replaces atomically —
including over a file a previous open rejected, which is the only way a corrupt
sidecar heals. Read, write, and clear failures are misses; none can fail an open
or a save.

## Performance timing

The verbose cross-boundary mirror trace has been removed. Development builds
keep focused `console.time` entries around resident Galley book updates,
analysis, main-thread findings decode/reconciliation, and the commit-to-findings
path so frame-budget measurements stay readable.

## Key files

- `src/app/domain/mirror/` — `mirrorProtocol.ts`, `MirrorFeed.ts`,
  `workspaceKernel.ts`, `mirrorSessionFactory.ts`, `braidHost.ts`,
  `braidWarmCache.ts`, `startupLog.ts`, `resultTransferables.ts`,
  `retryBackupWrite.ts`, `workerMessages.ts`
- `src/app/domain/api/materializeLoadedProject.ts` — main's half of a load
- `src/app/domain/editor/pipelines/` — `mirrorPatchProducer.ts`,
  `mirrorResultRouter.ts`
- `src/web/domain/mirror/` — `WorkerMirrorSession.ts`, `webMirrorEngines.ts`,
  `workspaceMirror.worker.ts`
- `src/web/domain/braid/WebBraidHost.ts` — the web resident Braid arm
- `src/web/domain/sous/WebGalleyService.ts` — the web resident Galley arm
- `src/tauri/domain/mirror/` — `RustMirrorSession.ts`
- `src/tauri/rust/src/mirror.rs` — the resident Braid/Galley host and transport
- A shared protocol fixture (`tests/unit/mirrorProtocolFixtures.test.ts` +
  `mirror.rs` tests) pins the TS↔Rust wire contract from both sides.
