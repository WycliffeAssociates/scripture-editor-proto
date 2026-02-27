# Warm Reopen Parse Cache

## What this feature does
- Speeds up reopening an already-loaded project by reusing parse-derived state for unchanged scripture files.
- Caches the expensive reopen pipeline outputs:
  - Parsed USFM tokens
  - Flat lexical state
  - Paragraph lexical state
  - Loaded lexical baseline state
  - Initial lint errors
- Validates cache entries per file using SHA-1 over raw file bytes.
- Repairs only the files whose bytes changed, then rewrites the latest cache blob.

## What it does not do
- Does not optimize the first time a project is opened.
- Does not cache Git readiness, branch state, history, or commit snapshots.
- Does not cache zip-compare sources or arbitrary picked-directory compare sources.
- Does not detect external edits continuously while the project is already open.
- Does not keep historical generations of parse cache.

## Where it applies
- Main project open flow.
- Reference project loads.
- Existing-project compare loads.
- Post-save refresh for the current working tree.
- Web and Tauri both use the same cache model.

## Cache model
- One latest JSON blob per project.
- Blob key is derived from normalized project path.
- Blob file location:
  - Web: `appData/cache/project-warm/<sha1(projectPath)>.json`
  - Tauri: app private cache directory under the same `project-warm/` subfolder pattern
- Blob shape:
  - `schemaVersion`
  - `projectPath`
  - `projectId`
  - `languageDirection`
  - `updatedAtIso`
  - `files[]`
- Each file section stores:
  - `relativePath`
  - `checksumSha1`
  - `bookCode`
  - `title`
  - `sort`
  - `lintErrors`
  - `chapters[]`
- Each chapter section stores:
  - `chapNumber`
  - `tokens`
  - `loadedLexicalState`
  - `flatLexicalState`
  - `paragraphLexicalState`

## Validation and reuse rules
1. On reopen, the app reads the current scripture files from disk.
2. It computes SHA-1 on the raw bytes for each file.
3. It looks up a cached section by project-relative path.
4. A file is a cache hit only when:
   - The blob schema is valid
   - `projectPath` and `projectId` match
   - The file exists in both current project state and the cache
   - The checksum matches exactly
5. If a file misses, only that file is reparsed and re-derived.
6. If the blob is missing, malformed, or mismatched, the whole project falls back to live parse and the cache is rebuilt.

## Mode hydration behavior
- Cached lexical projections are reused without re-running the parser-to-Lexical conversion.
- Mode mapping on hydrate:
  - `regular` and `view` use `paragraphLexicalState`
  - `usfm` and `plain` use `flatLexicalState`
- `loadedLexicalState` is restored as the saved baseline state for all modes.

## Save integration
- Successful disk saves refresh the warm cache for the latest working tree.
- Save does not fail if cache refresh fails.
- Cache refresh uses the just-saved book content for changed books.
- Unchanged books reuse their existing cache section when available.
- If an unchanged book is missing from cache, it is rebuilt from disk.

## Corruption behavior
- Cache files are disposable.
- If JSON parse fails, schema is wrong, or project identity does not match:
  - Ignore the blob
  - Parse live files
  - Rewrite a fresh blob
- No user-facing warning is required for cache rebuilds.

## Performance instrumentation
- The reopen path logs these timers:
  - `warmCache.read`
  - `warmCache.validate`
  - `warmCache.hydrate`
  - `warmCache.repair`
  - `warmCache.write`
- Benchmark script:
  - `scripts/bench/warm-cache-validation.ts`

## Current limits and tradeoffs
- Validation still reads every current scripture file once to compute checksums.
- SHA-1 is used as a cache invalidation fingerprint, not as a security boundary.
- Cache blobs are plain JSON, so they favor simplicity over compactness.
- Previous-version snapshots are reparsed on demand today; they do not participate in the warm cache.

## Key modules (for agents)
- `src/app/domain/cache/ProjectWarmCacheProvider.ts`
- `src/app/domain/cache/ProjectFingerprintService.ts`
- `src/app/domain/cache/SubtleSha1FingerprintService.ts`
- `src/app/domain/cache/loadProjectWithWarmCache.ts`
- `src/app/domain/cache/refreshProjectWarmCache.ts`
- `src/app/domain/cache/projectWarmCacheUtils.ts`
- `src/app/domain/api/loadedProjectToParsedFiles.ts`
- `src/web/adapters/cache/WebProjectWarmCacheProvider.ts`
- `src/tauri/adapters/cache/TauriProjectWarmCacheProvider.ts`

## Validation references
- `src/test/unit/loadProjectWithWarmCache.test.ts`
- `src/test/unit/refreshProjectWarmCache.test.ts`
- `src/test/unit/projectWarmCacheProvider.test.ts`
- `src/test/unit/subtleSha1FingerprintService.test.ts`
