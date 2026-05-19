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

## How edits flow through the store

Format scopes (chapter / book / project) all use the Option D mutation
pattern from `state-architecture.md`:

1. Collect every chapter ref the scope will touch.
2. `workingFilesStore.draftWithChapters(refs)` — shallow-copy only those
   chapters; everything else aliases the store.
3. For each touched chapter: convert serialized state → flat tokens, run
   the format transforms, convert back → serialized state, recompute
   `currentTokens` and `dirty`.
4. Synchronously `workingFilesStore.commit({ kind: "bulk", files: draft },
   { kind: "programmaticFix", scope, dirtyTextContent: true })`.

Book-scope and project-scope format additionally use
`rebuildParsedFileFromUsfm` which reassigns `book.chapters` wholesale —
this is safe because the book itself was shallow-copied by the draft.

`useFormatMatching.matchFormattingChapter` follows the same pattern and
captures the pre-draft `read()` as its rollback baseline; because the
draft only mutates copies, the snapshot stays a valid undo target.

## Current limits and non-goals
- Format is best-effort normalization, not full semantic rewriting of complex USFM.
- It does not auto-save; user still saves through diff/save flow.
- Unknown/unsupported serialized nodes are preserved when possible rather than aggressively rewritten.

## Key modules (for agents)
- `src/app/ui/hooks/usePrettifyOperations.tsx`
- `src/app/ui/hooks/useFormatMatching.tsx`
- `src/app/ui/hooks/useLintFixing.tsx`
- `src/core/domain/usfm/prettify/prettifyTokenStream.ts`
- `src/app/domain/editor/utils/prettifySerializedNode.ts`
- `src/app/domain/editor/actions/prettifyActions.ts`
- `src/app/state/WorkingFilesStore.ts` — `draftWithChapters`
- `src/app/ui/components/blocks/Toolbar.tsx`
