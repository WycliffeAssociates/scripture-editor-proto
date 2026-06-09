# Zephyr Tech Stack

## Platform Targets
- Desktop: Rust/Tauri with native file system access.
- Web: Browser sandbox with OPFS (Origin Private File System).

## Architecture
We use Hexagonal Architecture (Ports and Adapters).

- `src/core`: Domain logic and interfaces (ports), including USFM parsing logic.
- `src/tauri`: Desktop adapters.
- `src/web`: Web/OPFS adapters.
- `src/app`: UI layer that consumes `src/core` through dependency injection.

### Architecture Constraints
- `src/core` must never import from `src/app`.
- Platform-specific code must not leak into `src/app`.

## Core Abstractions (Agent-Facing)
This section is the primary orientation guide for AI agents and new contributors.

### 1) Hand-Rolled USFM Lexing + Parsing
Current state: lexing/parsing is intentionally hand-rolled and is a first-class core abstraction.

- Lexer: `src/core/domain/usfm/lex.ts` (`lexUsfm`).
- Parse pipeline: `src/core/domain/usfm/parse.ts` + `src/core/domain/usfm/tokenParsers.ts` (`parseUSFMfile`, `parseUSFMChapter`, `parseTokens`).
- Lint integration is part of parse-time token processing (`src/core/domain/usfm/lint.ts`).
- Parse/lint output is token-centric and emits lint errors tied to token/SID context.

### 2) Flat Token Stream Is the Canonical Document Model
Most document operations should be reasoned about as a flat, ordered token stream (token-to-token), not as nested editor paragraphs.

- Canonical work model:
  - Parse
  - Lint/error emission
  - Document maintenance/normalization
  - Metadata/diff bookkeeping
- Core examples:
  - `src/core/domain/usfm/prettify/prettifyTokenStream.ts`
  - `src/core/domain/usfm/sidBlocks.ts`
  - `src/core/domain/usfm/sidBlockDiff.ts`
  - `src/core/domain/usfm/sidBlockRevert.ts`
- Practical rule: treat paragraph nesting as a projection for editing UX, not as source-of-truth semantics.

### 3) Serialized Traversal and Flattening Are Core Bridge Abstractions
Traversal and flattening logic is central infrastructure, not incidental utility code.

- Serialized traversal generators:
  - `src/app/domain/editor/utils/serializedTraversal.ts` (`walkNodes`, `walkChapters`)
- Canonical flattening adapters:
  - `src/app/domain/editor/utils/materializeFlatTokensFromSerialized.ts` (`materializeFlatTokensFromSerialized`, `materializeFlatTokensArray`, `walkFlatTokensSlidingWindow`)
- Serialization boundary:
  - `src/app/domain/editor/serialization/lexicalToUsfm.ts`
  - `src/app/domain/editor/serialization/fromSerializedToLexical.ts`

### 4) Editor Modes: Presentation Projection Over Canonical Tokens
Current model (with planned rework): editor modes operate over flat token streams; nested paragraph structure is a presentation concern for Lexical.

- Mode transforms:
  - `src/app/domain/editor/utils/modeTransforms.ts`
  - `src/app/ui/hooks/useModeSwitching.tsx`
- Regular/View modes project flat tokens into paragraph containers for UX behaviors (including poetry indentation display). Chapter/verse markers project into **structured `USFMNumberedMarkerNode`s** whose token emission derives from node shape (no hidden editable bytes); char markers still use hidden flat text nodes pending char-element nodes. See `product-docs/specs/regular-mode-structured-nodes.md`.
- USFM/Plain modes operate on flattened streams.
- Shared invariant across modes: linting, parsing, maintenance, and token-linked metadata operate against flattened token order. A dev-only fixpoint check (`tokenFixpointPipeline.ts`) asserts the structured tree re-lexes to the same token stream.

### Module Boundary Map
- `src/core/domain/usfm/*`:
  - Canonical USFM domain logic (lex, parse, lint, token-stream transforms, SID block operations).
  - No UI/editor framework dependencies.
- `src/app/domain/editor/serialization/*` + `src/app/domain/editor/utils/*`:
  - Adapter layer between canonical token model and Lexical serialized state.
  - Responsible for traversal, flattening, paragraph projection, and mode conversions.
- `src/app/ui/*`:
  - Presentation, editor interaction, mode toggles, lint display, and user workflows.
  - Must consume abstractions above rather than redefining parsing semantics.

### 5) Workspace State: Push-Based Store + Effect Pipelines
Live workspace state (loaded chapters, dirty flags, findings, save status,
layout ticks, search highlights) is held in a small set of stores under
`src/app/state/`. Findings from both producers — onion lint and
scripture-sous-chef content analysis — land in one `FindingsStore`; see
`product-docs/specs/findings-and-content-analysis.md`. Mutations flow through a single seam — every Lexical
update and every programmatic edit results in one `CommitEvent` published
by `WorkingFilesStore`. Subscribers react on two channels:

- React reads via `useSyncExternalStore(store.subscribe, store.getSnapshot)`
  for components that just need the current value (e.g. `hasUnsavedChanges`).
- Effect-side `Stream<CommitEvent>` for pipelines that need debouncing,
  cancellation, or async work (lint, sous content analysis, save-status,
  structure-maintenance, editor-sync, overlay-tick).

Programmatic mutations use Copy-on-Write drafting via
`workingFilesStore.draftWithChapters(refs)` — touched chapters become
shallow copies, every other chapter still aliases the store. Callers mutate
the draft synchronously, then `commit({ kind: "bulk", files: draft }, …)`.
This replaces the legacy `structuredClone` rollback baseline (~1.5 s per
project on Psalm 119) and keeps React memoization quiet on untouched paths.

Effect is opt-in per-pipeline today: pipelines are forked individually in
`WorkspaceContext` and there is no app-wide service container yet. We
adopted PubSub + scheduling first because that's what the editor pipelines
needed; broader Effect integration (`Context.Tag`, `Layer`,
`Effect.Service`, `Ref`) is a reasonable next step but was out of scope
for this refactor.

See `product-docs/specs/state-architecture.md` and
`product-docs/specs/editor-data-flow.md` for the full contract.

## Editor Stack (USFM)
- Editor engine: Lexical.
- Custom Lexical nodes:
  - `USFMElementNode`
  - `USFMTextNode`
  - `USFMParagraphNode` — paragraph-class container (marker bytes in node state)
  - `USFMNumberedMarkerNode` — structured chapter/verse markers (shape-derived emission)
  - `USFMNestedEditorNode` — notes (`\f`, `\x`) as nested-editor decorators
- Parser bridge: `src/core/domain/usfm` transforms between raw USFM string and Lexical editor state.

### Editor Constraints
- Serialization/deserialization must maintain 1:1 parity between USFM string and editor state.
- Large chapter performance requires careful optimization of Lexical listeners.

## UI and Styling
- Base UI (`@base-ui/react`): unstyled headless primitives (Combobox, Select, Tabs, Toast, ScrollArea, etc.). We wrap these in app-local primitives under `src/app/ui/components/primitives/` so the rest of the app talks to project-shaped components.
- Vanilla Extract: Primary custom styling approach (`*.css.ts`, static CSS generation, type-safe theming).
- No Tailwind: Layout and styling should be implemented via Vanilla Extract (and Base UI primitives) for consistency and maintainability.

### Styling Constraints
- Prefer component-adjacent `*.css.ts` styles.
- Avoid runtime CSS-in-JS approaches (for example, Emotion, Styled Components) to reduce editor runtime overhead.

## Concurrency / Effects
- `effect` (the Effect-TS library) is used for the per-pipeline async
  primitives only: `Stream`, `PubSub`, `Deferred`, `Fiber`, `Duration`.
- Pipelines are forked once in `WorkspaceContext` via `Effect.runFork`
  and interrupted on cleanup.
- We have not yet adopted the Effect service / `Layer` / `Context.Tag`
  model — the current scope was PubSub + scheduling for the editor
  pipelines, and broader DI was a larger refactor we didn't take on
  here. New flows should reach for plain TypeScript first; escalate to
  Effect when interruption, debouncing, or async coordination are the
  actual problem. Deeper Effect integration is open, not ruled out.

## Local Data and Persistence
- Source of truth: USFM files on disk.
- Local metadata/index cache: Dexie.js (IndexedDB wrapper).
- Dexie stores metadata for:
  - Projects
  - Files (paths and ordering support)
  - Languages
- Synchronization model: update DB whenever app-driven file system changes occur.

### Data Integrity Constraints
- Keep IndexedDB metadata in sync with file system state.
- Run startup reconciliation/sanity checks to repair drift when needed.

### Crash-Recovery Autosave
- Per-book USFM backup wrappers under `${appDataRoot}/dirty-buffers/${workspaceKey}/${bookCode}.json`, written via the `FileSystem.atomicWriteText` adapter (OPFS / Tauri).
- Disk-baseline MD5 attached to every backup wrapper. Computed via `IMd5Service` (`crypto-es` MD5 on web, the Rust `md5` crate on desktop) and returned from the parse interface itself (one IPC on Tauri) via the `includeSourceMd5` flag.
- Project files are never autosaved — explicit save remains the only thing that changes disk. The backup is a safety net only.
- See `product-docs/specs/crash-recovery-autosave.md` for the full contract (classification matrix, gate + tracker safety surfaces, banners, forced-review attestation, validated incoming-mutation boundary).

## Release Pipeline & Auto-Updater
Two release channels (Stable from `v*` tags, Nightly from every push to `master`) flow through a single channel-aware workflow. Desktop builds are signed with a Tauri minisign keypair so the in-app updater can verify them; a Cloudflare Worker serves the updater manifest by reading GitHub Releases at request time.

See `product-docs/specs/release-pipeline.md` for the full topology, workflow shapes, manifest format, signing, and how Settings → Advanced exposes the manual switch flow.
