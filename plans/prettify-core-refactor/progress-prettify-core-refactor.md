# Progress: Prettify Core Refactor

## Current snapshot
- Core prettify already exists at `src/core/domain/usfm/prettify/prettifyTokenStream.ts` and operates on a flat token stream, with recursion into `content`.
- App currently has Lexical⇄token glue in `src/app/domain/editor/utils/prettifySerializedNode.ts` (includes root-shape detection + paragraph wrapping).
- UI orchestration currently lives in `src/app/ui/hooks/usePrettifyOperations.tsx` (save lexical, loop scope, update diffs, refresh editor, notifications).

## Decisions
- Keep Lexical-specific conversion and paragraph wrapping in `src/app` as adapters.
- Move “formatting logic” boundaries so core is strictly tokens-in/tokens-out.
- UI hook remains the only place that touches save/diff/notifications/editor refresh.

## Next steps
1. Harden and test core prettify (metadata preservation, unknown token tolerance, nested content).
2. Split `prettifySerializedNode.ts` into adapter helpers (no longer owns the prettify pipeline).
3. Rewire `usePrettifyOperations` to assemble pipeline using adapters + core prettifier.
4. Remove legacy helper(s) after migration.

## Progress (2026-02-04)
- Added core-level unit coverage for metadata preservation + nested content recursion (`src/test/unit/prettifyTokenStream.test.ts`).
- Refactored `src/app/domain/editor/utils/prettifySerializedNode.ts` into pure Lexical↔token adapter functions:
  - `lexicalRootChildrenToPrettifyTokenStream`
  - `prettifyTokenStreamToLexicalRootChildren`
  - Removed app-side `applyPrettifyToNodeTree` so the token-stream prettifier lives only in `src/core`.
- Updated `src/app/ui/hooks/usePrettifyOperations.tsx` to orchestrate prettify by calling core `prettifyTokenStream` and using the adapter for Lexical conversions.
- Updated tests that depended on `applyPrettifyToNodeTree` to assemble the pipeline locally (unit + integration).
