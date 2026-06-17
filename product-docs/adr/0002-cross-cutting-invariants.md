# ADR 0002 — Cross-cutting invariants register

**Status:** Accepted (2026-06-17)
**Source:** lifted from §17 of the v0.6.0 codebase-architecture HTML
(`product-docs/2026-06-15-codebase-architecture-v0.6.0.html`) into a plain,
greppable, visible list. Kept current as the system evolves.

These are the load-bearing rules. Break one and the system gets subtly wrong in
ways tests may not immediately catch — so **changing one is a deliberate,
reviewed act**, and ideally records its own ADR.

---

1. **Dependency direction.** `src/core` never imports `app`/`web`/`tauri`.
   Domain stays portable; platforms inject at boot.

2. **One live truth, commit-only.** All workspace state is
   `WorkingFilesStore`; you never mutate it in place — you `commit(patch, meta)`
   and let the two channels fan out.

3. **The seam is mandatory.** Active mutations go through
   `withWorkingFilesDraft`: draft → compute → validate identity → re-check gate
   → commit → invalidate. No side effects in `mutate`; none at all on abort.

4. **Saved ≠ versioned ≠ published.** Disk write, git checkpoint, and remote
   publish are independent substates; the latter two failing is a warning, not a
   save failure.

5. **Never accept remote while review remains.** `finalizeOutcome`
   structurally forbids a fast-forward when any review diff is pending; partial
   acceptance adopts on the next save.

6. **Single-source marker taxonomy.** Form-mode categories derive from the
   usfm-onion catalog, not hand-maintained sets; only the `rule` grouping +
   uncatalogued legacy markers stay local, and they're labeled.

7. **Two recovery surfaces.** The coarse gate blocks all mutation; the fine
   recovered-conflict tracker forces review and blocks incoming sync until
   resolved.

8. **Lossless modes.** regular / flat / form all round-trip through the same
   token stream; mode is a Lexical shape, never a content change.

9. **Structure, not repair.** Chapter/verse markers carry their bytes in node
   shape, not hidden editable text — the byte-corruption class is
   unrepresentable, not swept. Bad states are surfaced as findings, never
   silently fixed; a dev-only fixpoint assert guards
   `tokens ≡ lex(join(sources))`.

10. **Line endings preserved.** The model is LF-internal; each chapter's disk
    `eol` is re-applied at serialize, and chapters never reorder — so CRLF files
    and stored chapter order round-trip without phantom diffs.

11. **One findings store, N producers.** onion lint, sous content analysis, and
    main-thread `local-lint` (intrinsic consistency) land in one namespaced
    `FindingsStore` through one presentation policy and one decoration path;
    findings anchor by token id or `(sid, UTF-16 span)`. Adding a producer is a
    closed-union type edit AND a `findingsSelectors` entry (the selectors
    enumerate sources exhaustively so a new one can't be silently invisible).
    _(The architecture HTML still says "two producers"; local-lint is the
    third, landing as of 2026-06-17.)_

12. **Read tokens for structure.** `token.sid` is a derived, maintenance-
    refreshed cache, not ground truth; a producer running on the `userEdit`
    commit derives chapter/verse structure from the canonical tokens (marker +
    following `number` token), never `token.sid`. See
    `adr/0001-token-sid-is-a-derived-cache.md`.
