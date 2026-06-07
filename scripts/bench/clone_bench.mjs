// Napkin-math benchmark for the wasm-scheduling discussion.
// Measures, against the real en_ulb (66 books) using the real usfm-onion-web wasm:
//   1. wasm compile-once vs instantiate cost
//   2. parse (USFM -> tokens) at whole-book and per-chapter granularity
//   3. lintTokens compute on whole-book / whole-project token arrays (the hot consumer)
//   4. structuredClone (round trip) AND v8.serialize (one-way, = posting-thread tax)
//      of token arrays at three granularities: whole project / biggest book / avg book / chapter
//
// structuredClone() = serialize+deserialize in-process. postMessage to a worker pays
// the serialize half on the POSTING (main) thread and the deserialize half on the
// worker thread. So v8.serialize length+time is the closer proxy for the main-thread
// INP tax of crossing the worker boundary. We report both.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import v8 from "node:v8";
import { fileURLToPath } from "node:url";

const PKG = "/home/user/scripture-editor-proto/node_modules/usfm-onion-web/pkg-web";
const ULB = "/tmp/ulb/en_ulb";

// ---- init wasm, measuring compile vs instantiate -------------------------
const wasmBytes = readFileSync(join(PKG, "usfm_onion_web_bg.wasm"));
const mod = await import(join(PKG, "usfm_onion_web.js"));

const tCompile0 = performance.now();
const compiled = new WebAssembly.Module(wasmBytes); // structured-cloneable, compile ONCE
const tCompile1 = performance.now();
mod.initSync({ module: compiled }); // cheap per-worker instantiate
const tInit1 = performance.now();

const { parse, lintTokens } = mod;

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const ms = (n) => n.toFixed(3);
const kb = (n) => (n / 1024).toFixed(1);
// time a fn over N iters (after warmup), return median ms
function timeIt(fn, iters = 7, warmup = 2) {
  for (let i = 0; i < warmup; i++) fn();
  const ts = [];
  for (let i = 0; i < iters; i++) {
    const a = performance.now();
    fn();
    ts.push(performance.now() - a);
  }
  return med(ts);
}

// ---- load books ----------------------------------------------------------
const files = readdirSync(ULB)
  .filter((f) => f.toLowerCase().endsWith(".usfm"))
  .sort();

const books = files.map((f) => {
  const source = readFileSync(join(ULB, f), "utf8");
  // split into chapters on \c markers (approximate; header stays with ch.1)
  const parts = source.split(/(?=\n\\c\s)/);
  return { name: f, source, chapters: parts };
});

console.log(`\n=== environment ===`);
console.log(`node ${process.version}, ${books.length} books, wasm ${kb(wasmBytes.length)} KB`);
console.log(`wasm COMPILE (once, cloneable Module): ${ms(tCompile1 - tCompile0)} ms`);
console.log(`wasm INSTANTIATE (per worker):         ${ms(tInit1 - tCompile1)} ms`);

// ---- parse + tokenize each book -----------------------------------------
let projectTokens = [];
const perBook = [];
for (const b of books) {
  const parseMs = timeIt(() => parse(b.source), 5, 1);
  const parsed = parse(b.source);
  const toks = parsed.tokens();
  const tokensMs = timeIt(() => parse(b.source).tokens(), 5, 1); // parse+tokens
  // per-chapter parse->tokens
  const chapMs = b.chapters.map((c) => timeIt(() => parse(c).tokens(), 3, 1));
  const ser = v8.serialize(toks);
  perBook.push({
    name: b.name,
    bytes: b.source.length,
    nTokens: toks.length,
    nChapters: b.chapters.length,
    parseMs,
    tokensMs,
    chapMsTotal: chapMs.reduce((a, c) => a + c, 0),
    chapMsMax: Math.max(...chapMs),
    serBytes: ser.length,
    toks,
  });
  projectTokens = projectTokens.concat(toks);
}

// ---- aggregates ----------------------------------------------------------
perBook.sort((a, b) => b.nTokens - a.nTokens);
const biggest = perBook[0];
const totalTokens = projectTokens.length;
const avgTokens = Math.round(totalTokens / perBook.length);
const totalParse = perBook.reduce((a, b) => a + b.parseMs, 0);
const totalLexTokens = perBook.reduce((a, b) => a + b.tokensMs, 0);
const avgBook = perBook.reduce(
  (acc, b) => {
    acc.parseMs += b.parseMs;
    acc.tokensMs += b.tokensMs;
    acc.serBytes += b.serBytes;
    return acc;
  },
  { parseMs: 0, tokensMs: 0, serBytes: 0 },
);
const nB = perBook.length;

console.log(`\n=== parse / tokenize (USFM -> Token[]) ===`);
console.log(`whole project: ${totalTokens} tokens across ${nB} books`);
console.log(`  parse only,   sum over books:   ${ms(totalParse)} ms`);
console.log(`  parse+tokens, sum over books:   ${ms(totalLexTokens)} ms`);
console.log(`biggest book  (${biggest.name}): ${biggest.nTokens} tok, ${biggest.nChapters} ch`);
console.log(`  parse only:                     ${ms(biggest.parseMs)} ms`);
console.log(`  parse+tokens:                   ${ms(biggest.tokensMs)} ms`);
console.log(`  per-chapter parse+tokens (sum): ${ms(biggest.chapMsTotal)} ms`);
console.log(`  per-chapter parse+tokens (max): ${ms(biggest.chapMsMax)} ms`);
console.log(`avg book (${avgTokens} tok):`);
console.log(`  parse only:                     ${ms(avgBook.parseMs / nB)} ms`);
console.log(`  parse+tokens:                   ${ms(avgBook.tokensMs / nB)} ms`);

// ---- lintTokens compute (the hot consumer) -------------------------------
const lintBiggest = timeIt(() => lintTokens(biggest.toks, undefined), 7, 2);
const lintAvgBook = (() => {
  // pick the book closest to avg token count
  const tgt = perBook.reduce((p, c) =>
    Math.abs(c.nTokens - avgTokens) < Math.abs(p.nTokens - avgTokens) ? c : p,
  );
  return { name: tgt.name, n: tgt.nTokens, t: timeIt(() => lintTokens(tgt.toks, undefined), 7, 2) };
})();
const lintProject = timeIt(() => lintTokens(projectTokens, undefined), 5, 1);

console.log(`\n=== lintTokens compute (Token[] -> issues) ===`);
console.log(`biggest book  (${biggest.nTokens} tok): ${ms(lintBiggest)} ms`);
console.log(`avg book (${lintAvgBook.name}, ${lintAvgBook.n} tok): ${ms(lintAvgBook.t)} ms`);
console.log(`whole project (${totalTokens} tok):    ${ms(lintProject)} ms`);

// ---- structuredClone vs v8.serialize (the worker-boundary tax) -----------
function cloneStats(label, toks) {
  const cloneMs = timeIt(() => structuredClone(toks), 7, 2);
  const serMs = timeIt(() => v8.serialize(toks), 7, 2);
  const bytes = v8.serialize(toks).length;
  const jsonBytes = Buffer.byteLength(JSON.stringify(toks));
  console.log(
    `${label.padEnd(28)} n=${String(toks.length).padStart(6)}  ` +
      `clone(rt)=${ms(cloneMs).padStart(8)}ms  ` +
      `v8.ser(1-way)=${ms(serMs).padStart(7)}ms  ` +
      `wire=${kb(bytes).padStart(7)}KB  json=${kb(jsonBytes).padStart(7)}KB`,
  );
}

console.log(`\n=== structured-clone / serialize tax (Token[]) ===`);
console.log(`(clone rt = structuredClone round trip; v8.ser = posting-thread half)\n`);
cloneStats("whole project", projectTokens);
cloneStats(`biggest book (${biggest.name})`, biggest.toks);
const avgBookObj = perBook.reduce((p, c) =>
  Math.abs(c.nTokens - avgTokens) < Math.abs(p.nTokens - avgTokens) ? c : p,
);
cloneStats(`avg book (${avgBookObj.name})`, avgBookObj.toks);
// representative chapter: biggest book's largest chapter token slice
const biggestSrc = books.find((b) => b.name === biggest.name);
const bigChapterSrc = [...biggestSrc.chapters].sort((a, b) => b.length - a.length)[0];
const oneChapterTokens = parse(bigChapterSrc).tokens();
cloneStats("one big chapter", oneChapterTokens);

console.log(`\n=== per-pass projection (lint I2 = whole-book tokens every ~100ms) ===`);
const tax = timeIt(() => v8.serialize(biggest.toks), 7, 2);
console.log(`biggest-book worker post tax (v8.ser, main thread): ${ms(tax)} ms/pass`);
console.log(`at 10 passes/sec that's ~${ms(tax * 10)} ms/sec of main-thread serialize`);
