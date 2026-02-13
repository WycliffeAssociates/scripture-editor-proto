# Dovetail Tech Stack

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
- Regular/View modes project flat tokens into paragraph containers for UX behaviors (including poetry indentation display).
- USFM/Plain modes operate on flattened streams.
- Shared invariant across modes: linting, parsing, maintenance, and token-linked metadata operate against flattened token order.

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

## Editor Stack (USFM)
- Editor engine: Lexical.
- Custom Lexical nodes:
  - `USFMElementNode`
  - `USFMTextNode`
- Parser bridge: `src/core/domain/usfm` transforms between raw USFM string and Lexical editor state.

### Editor Constraints
- Serialization/deserialization must maintain 1:1 parity between USFM string and editor state.
- Large chapter performance requires careful optimization of Lexical listeners.

## UI and Styling
- Mantine v7: UI primitives (modals, buttons, inputs, etc.).
- Vanilla Extract: Primary custom styling approach (`*.css.ts`, static CSS generation, type-safe theming).
- No Tailwind: Layout and styling should be implemented via Vanilla Extract (and Mantine primitives) for consistency and maintainability.

### Styling Constraints
- Prefer component-adjacent `*.css.ts` styles.
- Avoid runtime CSS-in-JS approaches (for example, Emotion, Styled Components) to reduce editor runtime overhead.

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
