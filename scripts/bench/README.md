# Analysis scheduling benchmarks

Napkin-math scripts behind `product-docs/ideas/2026-06-07-analysis-lib-scheduling-statefulness.md`.
They measure, against the real `usfm-onion-web` wasm and the real 66-book `en_ulb`,
the costs that drive the worker/Rust-channel scheduling decisions.

## Setup

```sh
pnpm install                                            # need node_modules/usfm-onion-web
mkdir -p /tmp/ulb && unzip -q tests/mockData/en_ulb-master.zip -d /tmp/ulb
```

The scripts hardcode `node_modules/usfm-onion-web/pkg-web` and `/tmp/ulb/en_ulb`
(adjust the constants at the top if your layout differs). Run any with `node`:

```sh
node scripts/bench/clone_bench.mjs    # parse/tokens, lint, structuredClone vs v8.serialize, by granularity
node scripts/bench/ipc_bench.mjs      # JSON.stringify vs v8 vs TextEncoder (Tauri-shaped codec)
node scripts/bench/fmt_bench.mjs      # formatTokens compute + result return tax
node scripts/bench/hash_bench.mjs     # SubtleCrypto SHA-1/256 vs sync FNV-1a per chapter
node scripts/bench/summary_bench.mjs  # summary cache size vs token corpus
node scripts/bench/ram_bench.mjs      # histogram vs inverted-occurrence-index RAM
node scripts/bench/stats_bench.mjs    # hapax / rare-tail index sizes, compression ratio
```

Numbers are warm medians on whatever CPU you run them on; trust the **ratios**.
Node's V8 is Chrome's engine, `structuredClone` uses the same structured-serialize
as `postMessage`, and `v8.serialize` is a close proxy for the wire step.
