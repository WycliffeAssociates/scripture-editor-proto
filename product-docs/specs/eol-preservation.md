# Line-Ending Preservation

The editor model is **LF-internal**: `lexicalToTokens` stamps `"\n"` newline
tokens regardless of how the file arrived on disk. To stop a CRLF file from
showing a whole-file phantom diff the moment it loads, each chapter remembers
its original line ending and the serializer re-applies it at the byte "waist".

## The invariant

A file that arrives with `\r\n` line endings is saved back with `\r\n`; an LF
file stays LF. The system never rewrites line endings — only an explicit user
edit to the bytes changes them. This keeps save, the diff modal, and
dirty-buffer backups from reporting changes the user never made.

## How it works

- **`LineEnding`** is `"\n" | "\r\n"`
  (`usfmTokenStreamSerializedAdapter.ts`).
- **Detection on load:** `detectLineEnding(tokens)` inspects the source token
  stream and is stored as `eol: LineEnding` on each `ScriptureChapterState`
  (`ScriptureWorkspaceState.ts`). Set at parse
  (`scriptureProjectToParsedFiles.ts`), on rebuild
  (`rebuildParsedFileFromUsfm.ts`), and on dirty-buffer recovery
  (`recoverDirtyBuffers.ts`, falling back to the restored tokens' own ending
  when no disk chapter is available).
- **The serialize waist:** `tokensToUsfm(tokens, eol)` maps every internal
  `newline` token to the `eol` string. Multi-chapter serialization uses
  `bookLineEnding(book)` to pick the book's ending. Every byte-producing path
  routes through this — save, token-fix application (`lintFix.ts`,
  `chapterLabelStandardize.ts`), and compare-source materialization
  (`compareMutations.ts`) — so none of them can reintroduce a phantom diff.

## Key files

- `src/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts` —
  `LineEnding`, `detectLineEnding`, `bookLineEnding`, `tokensToUsfm`
- `src/app/scripture/ScriptureWorkspaceState.ts` — the `eol` field on chapter
  state
- `src/app/domain/api/scriptureProjectToParsedFiles.ts`,
  `recoverDirtyBuffers.ts` — where `eol` is captured
