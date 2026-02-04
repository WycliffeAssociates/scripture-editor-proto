# Plan: Move Prettify Into `src/core` (Token-Stream In/Out)

## Why
Prettification currently spans:
- **Core algorithm** (`src/core/domain/usfm/prettify/*`) that works on a token stream
- **App/editor adapters** (`src/app/domain/editor/utils/prettifySerializedNode.ts`) that convert Lexical serialized nodes ⇄ core tokens and also do paragraph/root-shape wrapping
- **React hook orchestration** (`src/app/ui/hooks/usePrettifyOperations.tsx`) that saves current Lexical state, loops chapters, updates diff map, refreshes editor content, and triggers notifications

The goal of this refactor is to enforce Hexagonal boundaries:
- `src/core` owns prettification *behavior* (pure token-stream transform)
- `src/app` owns adapters between Lexical/editor representations and core token streams (still pure, but UI-agnostic)
- `src/app/ui` owns orchestration: save/restore, diff updates, notifications, editor refresh

## Target Architecture
### Core (`src/core`)
- A single public prettify entry that is:
  - Pure (no app state / IO / editor dependencies)
  - Token-stream in → token-stream out
  - Recurses through nested token content (notes, embedded streams) via a convention (`content?: Token[]`) or a customizable hook
- Core types should be generic-friendly:
  - Allow callers to attach extra metadata on tokens (sid/id/attributes/etc)
  - Avoid hard-coding app-only token types

### App/domain adapters (`src/app/domain/editor/...`)
- Lexical serialized nodes ⇄ core token stream conversion
- Root-shape/paragraphing decisions (wrap/group) remain here (application-specific, but not React/UI-specific)
- Should expose building blocks:
  - `lexicalRootChildrenToFlatTokens(children) => { tokens, direction, shape }`
  - `flatTokensToLexicalRootChildren(tokens, { direction, shape }) => children`
  - (Optional) `ensureRootChildrenSafe(children, direction)`

### UI/hook orchestration (`src/app/ui/hooks`)
- Saves dirty Lexical state before operating
- Determines scope (chapter/book/project) and loops appropriately
- Applies the adapter + core prettifier
- Updates diff map and refreshes editor content when the current chapter is affected
- Notifications (“Nothing changed”, progress, success)

## Phased Execution (Safe Incremental)
1. **Core API hardening**
   - Make core prettifier the only “source of truth” entrypoint (explicit export)
   - Ensure it preserves unknown token types and metadata
   - Add/adjust unit tests in `src/core` for:
     - whitespace normalization
     - marker recovery
     - linebreak insertion/removal
     - recursion into `content`
2. **Adapter split in app/domain**
   - Refactor `prettifySerializedNode.ts` so it no longer “owns” the prettify pipeline
   - Expose the conversion + wrapping helpers
   - Keep any Lexical-specific token annotations in app (e.g. `__serialized`)
3. **Hook becomes the orchestrator**
   - Hook calls: `tokens = lexical→tokens`, `tokens2 = corePrettify(tokens)`, `children2 = tokens→lexical`
   - Hook determines “changed” and “dirty” (USFM compare) and applies updates
4. **Remove legacy helpers**
   - Remove `applyPrettifyToNodeTree` if unused
   - Ensure actions/palette call the same orchestrated path

## Non-Goals (for this refactor)
- Changing the user-visible formatting rules
- Changing Lexical node schemas
- Performance optimization beyond “don’t regress”

## Acceptance Criteria
- Prettify Chapter/Book/Project produces identical output to before
- No core file imports from `src/app` or `src/app/ui`
- UI hook contains all “save lexical + diff + refresh + notifications” concerns
- Adapter layer is reusable outside React (pure functions)

