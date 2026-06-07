# Analysis-Library Scheduling & Statefulness — Architecture Notes

**Date:** 2026-06-07
**Status:** Idea / refined position. Sequenced *after* the current in-flight branch merges. No code committed beyond the benchmark scripts referenced here.
**Scope:** Performance architecture for the analysis libraries that take USFM / verse text and return findings (lint; statistical analysis — proportionality, z-scores, compression, hapax, punctuation, …). How to keep web INP snappy and desktop responsive while running thorough diagnostics, given we are *not* in an LSP world but an editor-embedded one.

> Out of scope here: the mechanism for associating a finding back to a location. Both libraries already own that contract (token id ↔ vref/plain-text index via usfm-onion). This document is about **where the work runs, what state it keeps, and how work reaches it** — not how findings are anchored.

---

## 1. The setting (verified facts)

- One Lexical editor. `WorkingFilesStore` is the single source of truth. It emits an ordered, single-writer commit stream (monotonic `generation`); consumers subscribe via Effect with per-consumer debounce / `switchMap`.
- Tokens are already **per-chapter** in the store (`ScriptureChapterState.currentTokens`). USFM is **book-per-file**; the parser's natural unit is a book.
- Web runs the wasm parser **on the main thread** behind an async facade today (so `await` doesn't move it — a long call blocks input).
- Tauri runs the work in the **Rust process over IPC** (truly off the webview thread), today as **stateless** commands (`usfm_onion_lint_tokens(tokens) -> issues`).
- Calls are stateless by design today; the libraries build internal state per call and discard it.
- The product goal grows toward **whole-project** (66-book) analysis, so costs scale with project size.

The libraries share **only** one contract: scripture text/tokens in → findings anchored by token id (or local UTF-16 range) out. They need not operate alike internally.

---

## 2. Measured baseline (napkin math)

Real `usfm-onion-web` v0.0.5 wasm, real 66-book `en_ulb` (254,578 tokens). Node V8 (= Chrome's engine; `structuredClone` uses the same structured-serialize as `postMessage`; `v8.serialize` ≈ the wire step). Warm medians on a sandbox CPU — **trust the ratios, not the absolute ms.** Scripts in `scripts/bench/`.

| | whole project | Psalms (biggest book) | avg book | one big chapter |
|---|---|---|---|---|
| tokens | 254,578 | 30,857 | ~3,857 | 1,969 (Ps 119) |
| **parse + tokens** (materialize JS objects) | **886 ms** | 110 ms | 13 ms | 5 ms |
| raw lex only | ~7 ms | — | — | — |
| **lintTokens** compute | 1138 ms | 104 ms | 14 ms | — |
| formatTokens compute | — | 173 ms | 23 ms | — |
| **serialize OUT** (v8 / worker) | 359 ms | 32 ms | 3 ms | **1.3 ms** |
| structuredClone round trip | 1112 ms | 113 ms | 11 ms | 4.8 ms |
| **JSON.stringify** (Tauri out) | 335 ms | 28 ms | 3.3 ms | — |
| JSON.parse (Tauri return) | 408 ms | 45 ms | 4.8 ms | — |
| wire size | 35 MB | 4.1 MB | 0.58 MB | 0.23 MB |

Fixed costs: wasm **compile** (once, cloneable Module) 4.6 ms; **instantiate** per worker 2.2 ms.

Hashing a chapter: SubtleCrypto SHA-1 ~0.1 ms (async, ~floor); **FNV-1a sync 0.01–0.04 ms** (3–25× cheaper, synchronous, sufficient for change-detection).

State sizes (the mirror-vs-summary argument): token mirror **35 MB**; corpus summary/histograms **2.5 MB**; inverted occurrence index **41 MB** (don't build); hapax accumulator **137 KB counts + 324 KB rare-tail locations**.

### Takeaways the numbers force
1. The dominant cost is **materialization** (building JS token objects across the wasm→JS boundary), not lexing and not clone.
2. The boundary tax is **the same shape on web and Tauri** (`structuredClone` ≈ `JSON.stringify`). TextEncoder→u8 is additive, not a substitute.
3. **Chapter is sub-frame** for everything (5 ms compute, 1.3 ms serialize). Whole-book/whole-project per pass is not.
4. Returning large token arrays to main is a cliff (~750 ms whole project, ~80 ms Psalms deserialize). Stream per chapter.

---

## 3. The three levers

1. **Scheduling** (the Driver) — partially implemented today (debounce / switchMap).
2. **Statefulness & scope** of a check — not implemented. The libraries already accrue state internally per call; the lever is *persisting* it.
3. **Where the work runs & how the delta gets there** — serialization vs a persistent worker/Rust channel holding state.

---

## 4. Lever 1 — Scheduling / the Driver

A single **Driver sits above both transports**. Because the cost model is identical in shape on web and Tauri, the scheduling decisions are transport-agnostic — so the Driver, not the libraries, is the uniform layer, and web/Tauri parity falls out for free.

The Driver owns:
- **Epochs / generations** — newest-wins supersession, tagged with the commit `generation`.
- **Hot / cold lanes** — interactive per-chapter work vs background corpus work (see §5).
- **Coalescing** — drop superseded compute requests; never drop ordered state patches.
- **Memo gate** — skip serialize + compute for unchanged units (sync FNV/xxHash, or just the commit/patch already names the changed chapter).
- **Per-check cost-based routing** — decides, per check, whether it runs on-main or off-main (§6).

Each analysis library is an **opaque consumer** to the Driver: `delta in → anchored findings out`, epoch-tagged. The Driver never needs to know a library's internal scope or state.

---

## 5. Lever 2 — Statefulness & scope

**Reframe:** this is not "add a fragile mirror." The libraries already build state every call and throw it away (`onion.parse()` builds the parse, you call `.tokens()` and discard the handle). The lever is **persist the state you already paid to build** and update it by patch instead of rebuilding it.

Scope a check by **how often its inputs change**, which sorts every check into three classes:

| Class | examples | unit | state | cadence |
|---|---|---|---|---|
| **Local** | most lint; most punctuation | chapter | none (or book handle) | every edit, hot |
| **Book-structural** | chapter-label consistency, chapter-number order | book | tiny (labels/numbers) | only when a structural marker changes — rare |
| **Corpus-statistical** | proportionality, z-scores, compression, hapax | corpus | derived aggregates (~MB) | every edit, but incremental |

Two **kinds** of persisted state, both unlike a 35 MB project mirror:

- **Book token handle** — a replica of one book's tokens, updated by chapter patch. Bounded (≤ ~4 MB), **shardable per book** (books independent → keeps the pool, no head-of-line blocking), cheap to rebuild. Hosts Local + Book-structural checks.
- **Corpus aggregate accumulator** — small **derived** aggregates (count maps, running Σx/Σx², sketches, rare-tail index), fed per-chapter *summaries*, never tokens. Single-homed. Reduces are cheap aggregation → can live on the main thread. Hosts Corpus-statistical checks.

### Incremental tractability of the statistical class
- **Additive** (mean, variance, **z-scores**, counts, **hapax**) → O(1) / O(chapter) incremental via running sums + count maps. Easy. Hapax works because hapaxes *are* the rare tail: keep locations only for count ≤ 2 words (324 KB), self-maintaining.
- **Order statistics** (**median / MAD / quantiles**) → **not** O(1). Either reformulate as z-score (mean ± k·std, O(1)) or use a mergeable streaming sketch (**t-digest** / P²). This is the one genuinely hard sub-problem, and it has a known answer.
- **Per-unit scalars** (per-chapter **compression** ratio) → recompute the one changed chapter; choose a per-chapter unit, not a whole-corpus stream.

Punctuation is mostly **Local lint**, not a corpus stat — don't overthink it.

---

## 6. Lever 3 — Where the work runs, and how the delta arrives

The persisted state lives on the **far side** of the boundary; only deltas (chapter patches) and findings cross. Sync the state with the **commit stream you already emit** — single writer → ordered → `postMessage` / Rust channel preserves order. The one safeguard that makes this **not** fragile: **version every patch by commit `generation`; the mirror tracks last-applied; a gap → resync that book.** This turns "silently wrong" into "detected and self-healing."

### Web — a real A/B choice, routed per check by cost
- **(A) Worker holds the handle/mirror.** Pay the chapter patch (~1.3 ms serialize) each commit; compute runs off-main. Wins whenever *compute > patch-serialize* — basically always for any non-trivial check at chapter grain.
- **(B) Handle on main thread.** Zero serialization, but compute blocks input. Only right for checks cheap enough to finish within a frame.
- **Mix:** trivial checks → B, expensive checks → A. The Driver routes by measured cost.
- Cancellation: prefer **epoch-ignore** (let it finish, drop the result) over `terminate()` (which amputates the worker's state — ~1.2 s rebuild for a whole project, less per book). Reserve `terminate()` for genuinely hung calls. Shard per book so a kill costs one book, not everything.

### Tauri — B does not exist
- Work is already off the webview thread in the Rust process. So Tauri is always A-shaped. Its only choice is **stateful rust** (managed-state handle, incremental, saves recompute) vs **stateless rust** (recompute per call) — **both** keep compute off the main thread, so on Tauri statefulness is a *performance* choice, not an INP one.
- Mechanism: Tauri **managed state**. Register `builder.manage(Mutex<…>)` (e.g. a `HashMap<BookCode, BookLinter>`), add a command `usfm_onion_lint_update(state, book, chapter, tokens) -> issues` that locks, mutates in place, returns merged findings. The held state lives for the app lifetime and **never serializes across IPC** — only the chapter delta in and findings out. (`State<T>` must be `Send + Sync + 'static`; don't hold a `std::sync::Mutex` guard across `.await` — use `tokio::sync::Mutex` or keep the command synchronous and spawn heavy work on a thread.)

### Symmetry
Web worker (handle in wasm linear memory) and Tauri (handle in Rust managed state) both keep the heavy value on the far side; only deltas + findings cross. The seam's two impls each hold their handle their own way; call sites stay unaware.

---

## 7. How INP stays snappy (the guarantees)

- **Chapter-grain payloads** (1.3 ms), never whole-book/project per pass.
- **Memo gate** skips unchanged units entirely.
- **Newest-wins epochs** + generation versioning; superseded compute dropped, patches never dropped.
- **Stream returns** per chapter (avoid the ~750 ms whole-project deserialize cliff).
- **Off-main compute** for anything above the per-frame budget (A on web; always on Tauri).
- Cold/bulk work shows **partial results + progress**, reconciles as chapters land.

## 8. How it still feels like "proper diagnostics" (without an LSP)
- Corpus stats are **incremental**, so they stay *live* on every edit (re-map one chapter + cheap reduce) instead of being stale or requiring manual invocation. Manual/cold is reserved only for the genuinely non-incremental tail.
- A one-time **cold full pass at project open** populates the accumulators (the 886 ms materialize), backgrounded and streamed.
- **Drill-down** (e.g. "why is this book flagged") lazily re-maps that one book on demand — no persisted occurrence index.

---

## 9. Build order (cheapest, highest-leverage first)
1. **Chapter-grain dispatch for local checks** — send the dirty chapter, not the whole book. ~20× serialize cut (28 ms → 1.3 ms on Psalms), **no library change**, both platforms. Biggest near-term win.
2. **Driver upgrades** — generation/epoch tagging, hot/cold lanes, memo gate. Extends the existing debounce/switchMap.
3. **Persist the handle** — worker hosting (web) + Rust managed state (Tauri); generation-versioned patches; per-book scope; epoch-ignore default.
4. **Corpus stats engine** — per-chapter map → accumulators → reduce; z-reformulation or t-digest for order stats; rare-tail index for hapax.
5. **Gated optimizations (only if tracing shows the tax)** — wasm-side **columnar/transferable** token emission (attacks the 886 ms materialization *and* serialize at once — the asymptote, and we own the lib); coordinator worker-to-worker fan-out; binary IPC codec.

## 10. Explicitly rejected / deferred
- **TS port of the parser** — two impls, doesn't solve thread-sharing. No.
- **Project-wide 35 MB token mirror** — second authoritative truth, terminate-amputates, fights the pool. (Book-scoped handle is fine; project-wide is the trap.)
- **TextEncoder→u8 as a codec** — additive cost, no benefit.
- **Inverted occurrence index** (41 MB) — never; lazy drill-down instead.
- **Routine `terminate()` for cancellation** — epoch-ignore instead; terminate only for hung calls.
- **Manual invocation for incrementalizable rules** — user friction; reserve for the non-incremental tail.

## 11. Tracing to add *before* committing to any of this
Per call: `{ epoch/generation, lane, granularity, tokenCount, serializedBytes, memoHit, queueWaitMs, computeMs, boundaryMs, superseded? }`. Plus main-thread long-task markers around the serialize step, and pool depth / busy time / terminate events. Decision gates this answers: **is the worker actually moving compute off-main, or did serialize become the new bottleneck**, and **what is the memo hit-rate** (which decides whether a check even needs off-main hosting).

## 12. Open questions (the two that gate the build)
1. Which checks are **chapter-local vs book-structural vs corpus**? (Sets unit + state per check.)
2. Of the corpus ones, which are **additive** (easy, O(1)) vs **order-statistic** (need a sketch or z-reformulation)?
3. (web) The per-check **cost threshold** for A (worker) vs B (main) routing.
