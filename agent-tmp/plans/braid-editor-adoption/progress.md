# Braid editor adoption — progress

Append-only execution record tied to `plan.md` sections.

## 2026-07-27 — planning pass

- **Current section:** planning / pre-Section 0.
- **Status:** plan drafted; no product implementation started.
- **Plan dials:** exhaustive, ruthless assumptions/open-decision pass, hardened tests on
  data-integrity boundaries.
- **Upstream read:** reviewed the complete approved Braid epic and treated its retained
  decisions, API inventory, packed snapshot contract, Phase F editor adoption, and
  non-goals as normative.
- **Current-tree read:** inventoried the mirror protocol/producer, lint and sous
  pipelines, result router, `WorkspaceMirror`, web and Tauri hosts, Onion service,
  marker registry, serialization waist, FindingsStore, save pipeline, editor workspace
  state, filesystem/storage roots, and relevant product specs.
- **Key finding:** the existing generic mirror combines three responsibilities: resident
  Onion lint, resident sous-chef analysis, and crash-backup serialization. Target is two
  named resident arms plus app-owned backup/IO policy, not a renamed generic mirror.
- **Key finding:** `AnalyzeScope` and chapter-to-book widening are editor-owned Braid
  policy today. Target Braid command is no-argument `lint()` with complete result
  publication and internal dirty-book computation.
- **Key finding:** web and desktop currently diverge: web hosts JS/wasm mirror state;
  desktop duplicates resident state and token DTOs in Rust plus a separate backup
  worker. Initial target is the same wasm Braid module worker on both platforms.
- **Key finding:** current save, dirty, fix, prettify, recovery, and history paths still
  call the app's `tokensToUsfm`; deletion must be staged behind Braid serialization and
  save-race parity.
- **Key finding:** current marker registry is mutable and entrypoint-initialized. Target
  is direct immutable upstream registry/query exports with only an explicit `s5` policy
  overlay.
- **Key finding:** current FindingsStore structurally replaces touched books and spreads
  maps, which churns finding identities. Target is official packed reconciliation plus
  one complete Braid slice transaction.
- **Upstream prerequisite identified:** Braid needs an explicit per-book line-ending
  contract for token updates because Zephyr is LF-internal and must not retain a
  competing serializer.
- **Upstream prerequisite identified:** warm load needs a wasm operation that validates
  and seeds resident Braid directly from exact sources plus opaque packed bytes. JS
  `materialize` alone would otherwise force object materialization and re-submission.
- **Scope decision:** the serializable-token audit is absorbed as Section 1 after the
  Braid dependency bump. It is not worthwhile as a standalone pre-bump project because
  the bump supplies the final token fields/types.
- **Scope decision:** NodeTransforms, paste mechanics, caret behavior, and editor UI
  structure stay in Zephyr; their USFM semantic queries come from upstream registry
  facts.
- **Scope decision:** Galley implementation is not redesigned here. This plan severs it
  from `WorkspaceMirror` and establishes an independently testable arm.
- **Unresolved until Gate 0:** exact released EOL type/API, exact direct-restore API,
  generated Finding projection requirements, and worker packaging details.
- **Working tree:** unrelated pre-existing changes were observed and left untouched.

## 2026-07-27 — architecture corrections from owner review

- **Corrected overstatement:** the target is not wasm-in-a-worker on both platforms.
  Web uses synchronous wasm inside a web worker; Tauri retains native resident Rust.
  Both implement one app-facing Braid host contract and the same behavioral corpus
  suite.
- **Desktop return boundary:** native Rust lint/analyze/serialize results should return
  packed bytes through Tauri's array-buffer response path, avoiding JSON stringify and
  parse of Rust/JavaScript object graphs. Main-thread official helpers still
  materialize/reconcile UI objects.
- **Type boundary:** no hand-maintained Tauri domain DTOs. Host envelopes may carry
  request/generation metadata, but Tokens, findings, errors, patches, and config remain
  Braid-owned Rust types plus generated TypeScript declarations.
- **Function-color clarification:** async is appropriate for load, lint, analyze,
  serialize, cache validation, and post-save work. Node transforms, paste, marker
  lookup, rendering, and caret behavior must remain locally synchronous and cannot
  depend on IPC/worker calls.
- **Galley scope correction:** this is not a Galley plan and no separate Galley
  session/worker lifecycle is chosen. The Braid plan removes Braid coupling with the
  smallest seam and leaves Galley hosting to its own future plan.
- **Findings clarification:** complete Braid producer-data publication does not change
  app/UI filtering or presentation policy. Ignored codes, severity/category rules,
  active-book/chapter filtering, limits, messages, overlays, and navigation remain
  selectors/presentation behavior.
- **Diff clarification:** Braid handles comparisons against its resident state/baseline;
  symmetric left/right operations where both sides are supplied remain stateless Onion
  and full-scope.
- **Cache module decision:** use one narrow filesystem-backed `ResidentArtifactStore`
  namespaced for the two known arms (`braid`, future `galley`). It owns layout and
  atomic opaque-byte IO only. `BraidWorkspaceLoader` owns Braid validation,
  restore-versus-cold fallback, materialization, and cache rewrite. This avoids a
  generic cache abstraction learning engine semantics.
- **Loader finding:** current `scriptureProjectToParsedFiles` separately chooses path IO
  versus content IO, parses/normalizes/groups tokens, and later kernel construction
  performs initial analysis. Braid adoption can move editable-corpus construction into
  the Braid-specific loader while top level retains project/container/Git coordination.
- **Dirty-buffer decision:** first improve and measure load sequencing by establishing
  recovered working sources before initial Braid lint/publication. Defer a chapter-
  delta persistence format unless timings still implicate whole-book backup IO. Any
  later design must use an ordered chapter-slot list, never a chapter-label map, and
  preserve duplicates, order, deletion, front matter, and recovery classifications.

## 2026-07-27 — warm-cache naming and lifecycle clarification

- **Naming correction:** `ResidentArtifactStore` did not communicate the use case. The
  plan now calls the narrow app-cache module `WorkspaceWarmCache`: disposable binary
  acceleration for repeated development reloads and future production opens.
- **Post-save lifecycle:** after exact captured bytes reach disk, enqueue best-effort
  Braid and future Galley warming independently. Warming is not part of save success and
  must be bound to the persisted snapshot, never newer live edits made during awaited
  save/post-save work.
- **Open lifecycle:** read exact sources and each library's cached packed bytes; each
  library independently validates/restores or cold-falls back. Valid cache data can
  materialize initial UI state while non-authoritative internal indexes/hashes warm
  lazily. Correctness validation still precedes publication.
- **Cache authority:** deleting the cache cannot lose project data, dirty recovery data,
  or correctness. The cache module knows paths/atomic byte IO only; Braid and Galley own
  their respective binary meaning and validity.

## 2026-07-27 — Braid lint localization ownership

- **Boundary decision:** Braid supplies stable generated lint codes and locale-neutral
  structured message parameters. Zephyr retains all user-facing localization and the
  default English wording.
- **Current-tree finding:** `formatFindingMessage` correctly keeps producer dispatch at
  the UI edge and `presentFinding` separately owns filtering/presentation policy.
  `usfmOnionLocalization.formatLintIssueMessage` already switches on lint code, but its
  default currently returns the engine's English `issue.message`; this is not fully
  exhaustive.
- **Adoption requirement:** replace that default with a compile-exhaustive switch or
  `satisfies Record<BraidLintCode, Formatter>` table. A new upstream lint code must fail
  editor typecheck/tests until app-owned default/localized copy is added.
- **Packed contract:** reconciliation/materialization must preserve code and structured
  parameters. Engine diagnostic strings may remain available for debugging, but known
  codes never use them as UI fallback.
- **Policy unchanged:** ignored-code rules, user filters, book/chapter scope, severity
  preferences, visibility limits, overlays, messages, and navigation remain app/UI
  policy over the complete Braid findings slice.

## 2026-07-31 — Galley-wart prevention hardening against near-final Braid

- **Current section:** planning / pre-Section 0.
- **Status:** editor adoption plan hardened; no product implementation started.
- **Source audit:** inspected `origin/master...braid` in
  `/Users/willkelly/Documents/Work/Code/usfm_onion` at `aa1c001`, including the resident
  Rust/wasm Braid surface, mutation effects, snapshot identity, packed verification and
  materialization, publication work, baseline/serialization operations, and upstream
  approved plan.
- **API spelling finding:** near-final source exposes `replaceCorpus`, not
  `ingestCorpus`. The editor plan now requires one released spelling and forbids an app
  compatibility alias. The current near-final resident `lint()` is still object-shaped,
  so Gate 0 explicitly stops if the published release has not landed the approved packed
  result surface.
- **Resident-boundary hardening:** `BraidHost.lint()` is explicitly parameterless and
  may not accept tokens, config, scope, or cache policy. Named mutations precede lint;
  `MutationEffect` controls no-op scheduling without cancelling already-pending real
  work. Hosts may not reproject the whole corpus at lint time.
- **Staleness hardening:** result acceptance now requires current editor generation,
  current host epoch, request receipt, and matching semantic snapshot identity. Tests
  must cover a stale result that arrives before any newer result, not only result/result
  reordering.
- **Packed-boundary hardening:** web must transfer the owned `ArrayBuffer`; native Tauri
  must return direct binary IPC. Serialized Rust `Vec<u8>` and TypeScript `number[]`
  payloads are mechanical gate failures. Gate 0 also records the actual Cargo feature
  graph instead of inferring upstream behavior from direct dependencies.
- **Cache hardening:** raw file existence never implies validity or readiness. Official
  restore/verification precedes publication; every cold fallback replaces an invalid
  existing sidecar atomically; read/clear/write failures remain best-effort and cannot
  suppress valid live results or save success. Buffer detachment ownership is tested.
- **Identity hardening:** official packed verification/materialization is separate from
  `reconcileFindings(previous, next)` over semantic findings. Any editor adapter is
  memoized by reconciled object identity, and the store/UI test asserts references—not
  merely equal generated IDs—through the entire publication edge.
- **Save hardening:** post-save warming consumes an immutable receipt bound to exact
  ordered bytes and snapshot identity. It never reads live store generation from a
  deferred timer. Partial saves either produce a coherent artifact matching the final
  full disk corpus or skip the sidecar.
- **Testing decision:** the hardened matrix now includes invalid-cache repair and second
  reopen, cache IO failures, stale-first results, no-op mutations, host restart/disposal,
  native binary type, web detachment, identity through the store, later-edit save races,
  and partial-save cache eligibility.
- **Working tree:** only `plan.md` and this append-only progress file were intentionally
  changed in this pass; unrelated existing changes remain untouched.

## 2026-08-01 — Resident Braid editor integration

- **Implemented:** resident Braid mutations now back web-worker and native Rust
  mirrors; lint is parameterless and follows committed mutations; current-corpus
  formatting routes through snapshot-bound resident `prepareFormatPatch` /
  `applyFormatPatch`; save serialization uses an exact-generation resident Braid
  snapshot; and Braid baseline/dirty state drives whole-book crash-buffer writes.
- **Persistence:** dirty-buffer serialization stays host-owned and atomic. A backup
  is written only for a Braid-dirty book and cleared when the resident book returns
  to its saved baseline. The artifact remains whole-book because that is the current
  recovery format; chapter dirty flags remain UI metadata.
- **Save race:** production save captures ordered resident Braid USFM before disk IO,
  rejects a resident generation that advanced during capture, and only then rebases
  successful books.
- **Deferred by request:** saved-vs-working resident diff was not migrated.
- **Gate 0 stop:** the released Braid package exposes `replaceCorpus`, resident
  mutations, lint, formatting, baseline/dirty, and serialization, but does not expose
  the plan's opaque whole-corpus packed restore/verification/materialization/
  reconciliation contract. No editor-owned cache decoder, copied packed DTO, or
  compatibility shim was added; the existing Galley cache remains the only packed
  workspace cache.

## 2026-08-01 — Immutable marker catalog cutover

- The released Onion bindings now provide the catalog synchronously, so the editor
  builds its small `s5`-aware query registry directly at module load. Startup,
  worker initialization, and test setup no longer register a nullable global catalog.
- The upstream packed helper module exposes `verifyPackedCorpus`, `materialize`,
  `decodeTokens`, and `reconcileFindings`, and the root Braid class exposes
  `restoreCorpus`. These are two deliberate package surfaces: the root class owns
  resident restoration, while `./packed` owns certification and main-thread
  materialization. The editor must use both entry points rather than infer that the
  helpers are absent from the root declaration.
- The current release still does not expose the resident publication/pack verb that
  creates a new opaque Braid sidecar. That is a separate remaining contract question;
  it does not invalidate restore, verification, materialization, or reconciliation.
  Do not substitute the Galley `sous-chef-findings/.../corpus.bin` artifact or add an
  editor-owned packed encoder/decoder.
- Removed the obsolete catalog DTO and Tauri command, and removed catalog forwarding
  from the stateless Onion service interface. Arbitrary-source parse/lint/format/diff
  operations remain behind that interface; marker facts no longer cross the app
  service boundary.

## 2026-08-02 — Braid v0.1.1 publication and warm-cache integration

- **Dependency gate cleared:** updated web and native Onion/Braid dependencies to
  v0.1.1 at upstream commit `7ff7fe9`, including the published `publish()` and
  `restorePublishedCorpus()` surfaces.
- **Save publication:** replaced the app's legacy resident serialization command
  with `publishBraid`. Save receipts now retain the exact packed `ArrayBuffer`,
  snapshot identity, complete ordered source manifest, and serialized book outputs
  captured before disk IO. A post-save cache write verifies every current disk book
  against that receipt before replacing the cache.
- **Warm open:** added a Braid cache namespace beside (not over) Galley's
  `sous-chef-findings/<workspace>/corpus.bin`. The web worker and native host both
  validate the packed corpus through resident Braid, restore tokens/findings, and
  reinstall saved baselines; a rejected/missing cache falls through to cold lint and
  a best-effort fresh publication.
- **Transport:** web publication bytes transfer as an owned `ArrayBuffer`; native
  publication metadata is followed by a direct binary Tauri response. Native
  publication reuses unchanged wire sections between calls through a host-local
  publication cache. No legacy serializer command or compatibility alias remains.
- **Verification:** `pnpm test:unit` passed 167 files / 1,136 tests; `pnpm check`,
  `cargo fmt --check`, `cargo check`, `cargo test` (16 tests), and `git diff --check`
  passed.

## 2026-08-01 — Resident Braid lint fixes

- Current-corpus lint-fix actions now resolve official resident Braid patches and
  apply them through the web-worker or native Rust host. The live editor no longer
  calls the stateless token-fix service; the existing compute-only helper remains
  isolated to arbitrary-source unit coverage.
- Patch requests are generation-bound and stale-safe. Web/native operation failures
  return a correlated error result so a rejected patch cannot leave the UI action
  awaiting forever. A stale finding may be re-found once against current text, then
  retries through resident Braid only.
- The released package still lacks the public opaque resident publication/pack verb
  required for the plan's Braid cache sidecar. Diff remains deferred by owner request;
  resident formatting, serialization, baseline, dirty checks, and whole-book dirty
  backup behavior are implemented.

## 2026-08-01 — Resident corpus ownership cleanup

- The web `WorkspaceMirror` coordinator no longer retains chapter or baseline token
  arrays after the resident seed; it keeps only chapter metadata and disk baselines.
  Mutations require the resident Braid to be seeded by `fullSync`, and backup bytes
  come from resident Braid serialization.
- Native `WorkspaceTokenMirror` now follows the same ownership boundary: chapter
  token arrays and baseline token arrays are not resident mirror state. Full sync
  constructs Braid once, chapter mutations update Braid, and deletion uses Braid's
  explicit `remove_chapter`/`remove_book` path before refreshing the surviving Galley
  projection.
- The Braid lint trigger no longer computes or transports editor book scope. The
  editor decides only whether a text-changing commit is lint-eligible; resident Braid
  owns complete-corpus lint scope.
- The released package still has no public packed Braid publication verb. The official
  root restore and `./packed` verification/materialization/reconciliation surfaces
  remain available for a future real Braid artifact; no editor encoder or Galley-cache
  substitution was added.

## 2026-08-01 — Structural mutation widening

- Structural commit metadata now emits a complete `updateBook` patch, and explicit
  book deletion emits `removeBook`; ordinary chapter edits remain `pushChapter` and
  unambiguous chapter deletion remains `deleteChapter`.
- Web and native resident paths apply the complete book operation before advancing its
  Braid baseline. Native no longer falls back from a failed chapter update to an
  incomplete one-chapter `updateBook`; an ambiguous/structural edit must arrive as
  the complete-book operation.
- The single-commit LOC audit remains intentionally open: the current integration is
  still net-positive because the generic mirror and hand-authored native host layer
  remain around the resident arm. The final deletion phase has not been claimed.

## 2026-08-01 — Braid/Galley boundary and cache-load follow-up

- Web Braid ownership is now explicit in `WebBraidHost`; `WebGalleyService` retains
  Galley projection/cache concerns and delegates resident Braid mutations,
  serialization, baseline, dirty, formatting, and fixes instead of carrying a
  second Braid implementation.
- Structural chapter deletion now removes the surviving web Galley projection when
  a book becomes empty; a multi-chapter book deletion remains a complete resident
  book replacement path.
- A rejected `corpus.bin` is treated as a load miss without rewriting the file during
  load. Fresh analysis runs with `cachePolicy: "none"`; the file is replaced only by
  the explicit post-successful-save refresh path, matching the workspace cache policy.
- The released Braid publication verb is still absent, so no Braid warm-cache loader
  or editor-owned packed encoder was added. The official root restore and `./packed`
  surfaces remain the future integration seam.

## 2026-08-01 — Token-fidelity gate follow-up

- Lexical token projection now preserves milestone identity, `attributes`,
  `attributeSource`, and `attributeOffset` through flat/regular/form shape changes.
- Removed the nine expected-failure synthetic round-trip cases; the complete
  kitchen-sink and malformed-fixture matrix now passes without a compatibility node
  or editor-owned USFM serializer.

## 2026-08-01 — Complete lint snapshot publication cutover

- `LintResult` now carries the complete generated Braid `LintSnapshot` on both web
  and native paths; the old per-book lint result shape is no longer part of the
  application protocol.
- The result router reconciles one complete corpus sequence with the official
  `usfm-onion-web/packed` reconciler, memoizes the app projection by reconciled
  issue identity, reuses unchanged per-book arrays, and commits one complete
  Onion slice. A first-delivered result older than the current editor generation
  is rejected before reconciliation.
- Initial findings now carry `LintSnapshot | null`; plain mode uses `null` rather
  than a fake empty object. Native snapshot mapping remains a temporary transport
  boundary until the published native packed-return API replaces the object-shaped
  lint surface.
- Successful disk-save callbacks now carry a receipt containing the captured save
  generation, post-clean-mark generation, and exact serialized books. The deferred
  Galley refresh still requires that receipt generation to remain current, so a
  later edit cannot warm the cache from newer unsaved state.
- Braid lint localization now has an exhaustive generated-code census and no longer
  falls back to the engine's English diagnostic for a known code.
- The findings-store transaction is now named `commitBraidSnapshot`; the web
  engine wiring publishes lint directly from `WebBraidHost` rather than reaching
  through the Galley service for Braid findings.

## 2026-08-01 — Remaining Gate 0 / deletion boundary

- The current released Braid package exposes resident restore plus packed
  verification/materialization/reconciliation helpers, but its public resident
  `lint()` still returns an object snapshot and exposes no editor-callable packed
  publication verb. The plan's Braid sidecar writer therefore remains an upstream
  contract gate; no editor encoder, cache decoder, or Galley-cache substitution is
  being added.
- The generic mirror, native result DTO projection, and synchronous editor
  serializers still exist around the new resident arm. This is the source of the
  integration's net-positive LOC and remains the next deletion/refactoring pass;
  the current work must not be described as the final Braid boundary.

## 2026-08-02 — Upstream live-lint adjudication

- Live object-shaped Braid `LintSnapshot` is intentional and accepted. Findings are
  Rust-materialized objects across the host boundary; packed transport is reserved
  for persistence because the token corpus is orders of magnitude larger than the
  findings payload.
- `verifyPackedCorpus`, `materialize`, `decodeTokens`, and `reconcileFindings` are
  shipped in the `usfm-onion/packed` subpath and are not missing. The remaining
  upstream dependency is only Braid 0.1.1's `publish()` producer for the opaque
  persistence sidecar. Do not block live lint or invent an editor encoder while it
  is in flight.
- Onion's 62-step native/wasm parity transcript is library-owned evidence. The editor
  only needs host-level lifecycle/transport transcripts built against that oracle;
  it must not duplicate the library conformance suite.
- Remaining editor scope is therefore concrete: remove the generic WorkspaceMirror
  and native Braid DTO scaffolding, migrate eligible app byte-producing call sites to
  resident `toUsfm(scope)`, bind save receipts to `publish()` once 0.1.1 lands, and
  complete host-level lifecycle coverage.

## 2026-08-02 — Resident disposal hardening

- Added an ordered web-worker disposal message. The worker now releases resident
  Braid/Galley handles before termination, with a bounded fallback for a worker that
  failed before it can acknowledge disposal.
- Added the native `mirror_dispose` command so the Tauri resident state is reset when
  its session is torn down. This is lifecycle cleanup only; it does not add a second
  host or compatibility protocol.
- Verified with focused mirror tests (37 passing), TypeScript no-emit checking,
  `cargo check`, and Rust formatting.
- Still not complete: Braid 0.1.1 `publish()`/sidecar receipts, warm `restoreCorpus`
  integration, resident baseline diff wiring, and the larger generic mirror/native
  DTO deletion pass. The current app serializers remain only where a synchronous
  function-color boundary or no-resident test path still requires them.

## 2026-08-04 — Review remediation: load lifecycle, ownership, exact bytes

Addresses the standards + lifecycle review of the 2026-08-02/03 implementation.

- **[P1] Kernel arbitration now precedes any resident load.** `acquireWorkspaceKernel`
  is replaced by `reserveWorkspaceSlot`, which the route calls before it creates a
  session or reads a byte. `reuse` serves the kernel's own loader payload (the
  same store instances the still-mounted provider holds) and loads nothing;
  `declined` is the preload-while-occupied case and loads nothing; `granted`
  disposes the outgoing kernel FIRST, then the caller loads and `install`s.
  Previously a same-project reopen and a preload each prepared a second session
  and ran a full load — on desktop, against the live workspace's process-wide
  resident state — and then disposed it, globally resetting the survivor.
- **[P1] Native ownership is epoch-scoped.** Each `RustMirrorSession` takes an
  epoch. `mirror_load_project` adopts it and resets the state it takes over (a
  load is by definition a complete replacement); `mirror_dispose(epoch)` no-ops
  unless it still owns the state. The old `generation != high_water` guard, which
  rejected a new project's generation-0 load whenever the previous workspace had
  a nonzero high-water mark, is gone.
- **[P1] Structural patches are generation-guarded.** `FullSync`/`ResidentSeed`
  drop when older than the corpus high-water mark; `UpdateBook`/`RemoveBook` drop
  per book (a newer patch for a DIFFERENT book says nothing about this one, and
  dropping on that basis would lose its edit). `SyncMeta`'s Braid baseline moved
  under the same guard as the disk baseline it accompanies. Four Rust tests.
- **[P1] Exact disk bytes end to end.** Both hosts cold-seed Braid with the
  source form of `BookInput`, never a token round trip, so every hash Braid
  publishes binds to the file on disk. The load returns each book's exact bytes
  (one concatenated buffer + offsets) and its md5, hashed by the host that read
  them. This fixes three things at once: crash-recovery baselines hashed
  reconstructed USFM; the warm cache could never validate (its manifest held
  round-tripped text compared against disk); and main re-encoded the whole corpus
  to hash it. A native test pins it with a source whose round trip is NOT
  byte-identical.
- **[P1] One load restores both arms.** `loadProject` returns Braid's packed
  container, the source bytes, and Galley's packed analysis; main verifies and
  materializes both, and takes the verifier's Rust-materialized findings as the
  initial lint. The kernel no longer issues `analyzeLint`/`analyzeGalley` on a
  clean open. Crash recovery remains the exception and now republishes only the
  recovered books (`updateBook`) instead of a whole-corpus resync, analyzing with
  `cachePolicy: "none"`.
- **[P1] Transfer, not clone.** `transferablesOf` covers the packed corpus, the
  source bytes, and Galley's packed findings; `RestoreBraidRecord[]` (a
  whole-corpus string DTO) is gone from the load result. Native returns the same
  three payloads over the binary response path, so no part of the corpus is
  JSON-encoded across IPC.
- **[P1] The sidecar self-heals.** Both hosts dropped their `exists()` guard; a
  cold rebuild always atomically replaces the entry, including one a previous
  open rejected. The `sources.json` manifest is deleted outright — Braid's own
  restore verification against the disk bytes IS the validity check, so the app
  no longer double-validates. Native test: corrupt sidecar → cold → warm reopen.
- **[P2] Main materialization stopped deep-cloning.** `structuredClone` per
  chapter is a shallow array copy (tokens are immutable), and the whole-corpus
  `tokensToLexical` projection was dead — `ScriptureChapterState` has had no
  `lexicalState` field since shape-on-read landed, so it was computed and
  discarded for every chapter at load. Removing it drops `shape` from the
  parsed-files seam.
- **Logging.** `startupLog.ts` prints one ordered `[startup]` line per phase with
  timings, cache hit/miss, byte counts, and warm-vs-cold. Hosts record rather
  than print; main replays their phases into the same sequence (marked `↳`).
  Sidecar writes report as `[startup:cache-write]`. Not DEV-gated.
- **Naming.** `WebBraidHost` moved out of `src/web/domain/sous/` (the Galley
  subsystem) to `src/web/domain/braid/`.
- **Docs.** `product-docs/specs/workspace-mirror.md` reconciled: arbitration
  order, the one-load contract, the exact-bytes rule, the warm cache, and the
  startup trace. No reference to the deleted `WorkspaceMirror` remains.
- **Verification:** `pnpm check`, `pnpm lint`, `pnpm knip`, 168 unit files /
  1129 tests, `cargo test` 22 tests, `cargo fmt --check`, `git diff --check`.
- **Still owed:** a live in-app pass on both platforms (the trace is designed to
  make that read at a glance); web-side load-path integration coverage is blocked
  on `makeWebMirrorEngines` constructing its own OPFS filesystem rather than
  taking one — worth an injection seam when that test is written.
