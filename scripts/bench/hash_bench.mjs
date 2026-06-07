import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
const ULB="/tmp/ulb/en_ulb";
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const med=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const ms=n=>n.toFixed(4);

// gather chapter sources
const files=readdirSync(ULB).filter(f=>f.toLowerCase().endsWith(".usfm")).sort();
let chapters=[];
for(const f of files){
  const src=readFileSync(join(ULB,f),"utf8");
  for(const c of src.split(/(?=\n\\c\s)/)) if(c.trim()) chapters.push(c);
}
chapters.sort((a,b)=>b.length-a.length);
const big = chapters[0];                 // biggest chapter (~Ps119)
const mid = chapters[Math.floor(chapters.length/2)];
console.log(`chapters: ${chapters.length}; biggest ${big.length} bytes, median ${mid.length} bytes`);

// sync FNV-1a over bytes
function fnv1a(bytes){let h=0x811c9dc5;for(let i=0;i<bytes.length;i++){h^=bytes[i];h=Math.imul(h,0x01000193);}return h>>>0;}

async function timeAsync(fn,n=200,w=20){for(let i=0;i<w;i++)await fn();const a=[];for(let i=0;i<n;i++){const s=performance.now();await fn();a.push(performance.now()-s);}return med(a);}
function timeSync(fn,n=2000,w=200){for(let i=0;i<w;i++)fn();const a=[];for(let i=0;i<n;i++){const s=performance.now();fn();a.push(performance.now()-s);}return med(a);}

for(const [lbl,src] of [["biggest chapter",big],["median chapter",mid]]){
  const bytes = enc.encode(src);
  const encMs = timeSync(()=>enc.encode(src));
  const sha1  = await timeAsync(()=>subtle.digest("SHA-1", bytes));
  const sha256= await timeAsync(()=>subtle.digest("SHA-256", bytes));
  const fnv   = timeSync(()=>fnv1a(bytes));
  const fnvFull = timeSync(()=>fnv1a(enc.encode(src)));   // encode+hash
  const nodeMd5 = timeSync(()=>createHash("md5").update(bytes).digest());
  console.log(`\n${lbl} (${src.length} B):`);
  console.log(`  TextEncoder.encode:        ${ms(encMs)} ms`);
  console.log(`  subtle SHA-1 (bytes):      ${ms(sha1)} ms   (async, incl. promise)`);
  console.log(`  subtle SHA-256 (bytes):    ${ms(sha256)} ms`);
  console.log(`  FNV-1a sync (bytes only):  ${ms(fnv)} ms`);
  console.log(`  FNV-1a sync (encode+hash): ${ms(fnvFull)} ms`);
  console.log(`  node md5 (ref):            ${ms(nodeMd5)} ms`);
}

// throughput: hashing all chapters once
const allBytes = chapters.map(c=>enc.encode(c));
let t=performance.now();
await Promise.all(allBytes.map(b=>subtle.digest("SHA-1",b)));
console.log(`\nsubtle SHA-1 all ${chapters.length} chapters (parallel): ${ms(performance.now()-t)} ms total`);
t=performance.now(); for(const b of allBytes) fnv1a(b);
console.log(`FNV-1a all ${chapters.length} chapters (sync loop):    ${ms(performance.now()-t)} ms total`);
