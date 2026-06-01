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

Format scopes (chapter / book / project) all go through the validated
`withWorkingFilesDraft` seam (`workingFileCommand.ts`; see
`state-architecture.md` and `editor-data-flow.md`):

1. The scope resolves which chapter refs to draft.
2. The seam drafts them via `draftWithChapters` (shallow-copy only those
   chapters; everything else aliases the store) into a scratch.
3. `mutate` runs on the scratch: for each touched chapter, convert serialized
   state → flat tokens, run the format transforms, convert back → serialized
   state, recompute `currentTokens` and `dirty`; it returns the chapters it
   `affected`.
4. The seam re-reads latest, validates the affected chapters weren't replaced,
   re-checks the interaction gate, then commits — overlaying the affected
   chapters onto latest (`chapters` scope) or the scratch wholesale
   (`workspace` scope).

Book-scope and project-scope format use `rebuildParsedFileFromUsfm`, which
reassigns `book.chapters` wholesale; that runs under the seam's `workspace`
scope (validated by array identity) since it can add or remove chapters.

`matchFormatting` (in `useFormatMatching`) follows the same seam. The seam's
validate-on-commit is what makes the async transforms safe — there's no need
to keep a separate pre-draft rollback snapshot synchronous, because an abort
never commits.

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
- `src/app/domain/project/workingFileCommand.ts` — `withWorkingFilesDraft` seam
- `src/app/ui/components/blocks/Toolbar.tsx`
