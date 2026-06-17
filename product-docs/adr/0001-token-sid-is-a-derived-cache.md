# ADR 0001 — `token.sid` is a derived cache; read tokens for structure

**Status:** Accepted (2026-06-17)
**Context surfaced by:** the `local-lint` producer (see
`product-docs/specs/findings-and-content-analysis.md`).

> First ADR — establishes `product-docs/adr/`. ADRs record _decisions and their
> rationale_ (why we chose X over Y); the living specs under `specs/` describe
> _how things work_. Add an ADR when a non-obvious tradeoff was weighed.

## Context

A `\c`/`\v`'s number lives on the canonical token stream as **two tokens** — a
`marker` token then a following `kind:"number"` token (whose `source` is the
literal text, e.g. `"93"`/`"5-6"`). The app also carries a convenience field,
`token.sid` (`"GEN 1:93"`), but that is **derived**:

- `mutAddSids` / `normalizeTokenSids` compute sids from the stream.
- They run at **load** (loader normalizes) and via **`maintainMetadata`** — an
  editor listener that re-stamps sids onto the **Lexical nodes** and emits a
  separate **`structuralFixup`** commit.
- So after you type `\v 93`, the `userEdit` commit's `currentTokens` serialize
  with sids from the _previous_ maintenance pass — stale relative to the number
  just typed. The corrected sids ride the `structuralFixup` commit, which the
  analysis producers deliberately **exclude** (fixups shouldn't surface
  findings). Net: a producer reading `token.sid` on the `userEdit` commit gets a
  number that lags one cycle. `local-lint` hit exactly this and produced nothing.

Crucially, **no library depends on `token.sid`.** usfm-onion and
scripture-sous-chef compute their own sids internally from the tokens;
`normalizeTokenSids` is explicitly _app-level_. So `token.sid` is an
app-internal cache, not part of any external contract.

## Decision

**Treat `token.sid` as a maintenance-refreshed cache, not ground truth. Any
producer that runs on the `userEdit` commit must derive structure (chapter /
verse numbers, ranges) from the canonical tokens — the `\c`/`\v` marker and its
following `number` token's `source` — and must not trust `token.sid`.**

Short form: **always read tokens for structure.**

`local-lint` follows this: `numberAfterMarker` reads the `number` token's
`source` (regex `^(\d+)(?:-(\d+))?`), not `sid` and not `numberInfo` (both
derived/stale-prone). It also anchors findings to the `number` token's id (the
id the editor renders the marker+number element under), not the marker token's.

## Consequences

- Producers reacting to live edits are correct on the commit the edit lands on,
  with no dependency on maintenance timing.
- `token.sid` remains fine for app code that reads **after the editor settles**
  (navigation, search, diff, serialization) — it is fresh there.
- A future main-thread producer must follow the same rule; the staleness is a
  latent footgun for anyone who reaches for `token.sid` in a pre-maintenance
  path.

## Alternatives considered (rejected for now)

- **Stamp sids at the commit boundary** so `currentTokens` are never stale
  (fold sid derivation into the commit pipeline instead of a maintenance
  listener). Makes `token.sid` honest everywhere, but adds derivation to the
  commit hot path and is a meaningful pipeline refactor. Revisit only if more
  pre-maintenance consumers appear.
- **Remove `token.sid` from the canonical token**, forcing every reader to
  derive. Conceptually cleanest, but too disruptive — many app readers
  (`flatTokensByChapter`, serialization, search) rely on it post-settle.
