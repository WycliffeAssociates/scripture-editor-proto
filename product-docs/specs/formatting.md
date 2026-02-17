# Formatting (Format)

## What this feature does
- Applies best-effort USFM normalization to reduce noisy formatting inconsistencies.
- Available scopes:
  - Chapter
  - Book
  - Project
- Current toolbar entry is project-level `Format Project`; chapter/book actions are available through editor actions.
- Typical transformations include:
  - Marker recovery from malformed text where possible
  - Whitespace normalization
  - Spacing normalization around markers
  - Linebreak normalization around structural markers
  - Best-effort verse text cleanup patterns
  - Insertion of default paragraph markers in specific intro-to-verse cases

## How to access it in the app
- Toolbar: click the `Format Project` icon.
- Editor action palette: `Format Chapter`, `Format Book`, `Format Project`.

## Typical user flow
1. Trigger format at desired scope.
2. App converts current serialized editor content to a flat token stream envelope.
3. Core format transforms run on tokens.
4. Tokens are converted back to the current editor root shape.
5. Changed chapters are marked dirty and included in `Review & Save`.

## Current limits and non-goals
- Format is best-effort normalization, not full semantic rewriting of complex USFM.
- It does not auto-save; user still saves through diff/save flow.
- Unknown/unsupported serialized nodes are preserved when possible rather than aggressively rewritten.

## Key modules (for agents)
- `src/app/ui/hooks/usePrettifyOperations.tsx`
- `src/core/domain/usfm/prettify/prettifyTokenStream.ts`
- `src/app/domain/editor/utils/prettifySerializedNode.ts`
- `src/app/domain/editor/actions/prettifyActions.ts`
- `src/app/ui/components/blocks/Toolbar.tsx`
