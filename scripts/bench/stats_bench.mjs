import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import v8 from "node:v8";
const PKG="/home/user/scripture-editor-proto/node_modules/usfm-onion-web/pkg-web";
const ULB="/tmp/ulb/en_ulb";
const mod=await import(join(PKG,"usfm_onion_web.js"));
mod.initSync({module:new WebAssembly.Module(readFileSync(join(PKG,"usfm_onion_web_bg.wasm")))});
const {parse}=mod;
const kb=n=>(n/1024).toFixed(0);
const files=readdirSync(ULB).filter(f=>f.toLowerCase().endsWith(".usfm")).sort();
const count=new Map(); const locAll=new Map(); const locRare=new Map();
let totalWords=0;
for(const f of files){
  const toks=parse(readFileSync(join(ULB,f),"utf8")).tokens();
  for(const t of toks){ if(t.kind!=="text"||!t.source.trim())continue;
    for(const w of t.source.toLowerCase().match(/\p{L}+/gu)??[]){
      totalWords++; count.set(w,(count.get(w)??0)+1);
      (locAll.get(w)??locAll.set(w,[]).get(w)).push({book:f,id:t.id});
    }}
}
// rare-tail index: keep locations only for words whose corpus count <= 2
for(const [w,c] of count) if(c<=2) locRare.set(w, locAll.get(w));
const distinct=count.size;
let hapax=0,le2=0; for(const c of count.values()){if(c===1)hapax++; if(c<=2)le2++;}
console.log(`total words: ${totalWords}, distinct: ${distinct}`);
console.log(`hapax (count==1): ${hapax}  (${(hapax/distinct*100).toFixed(0)}% of distinct)`);
console.log(`count<=2 words:   ${le2}`);
console.log(`FULL occurrence index (all words):  ${kb(v8.serialize(Object.fromEntries(locAll)).length)} KB`);
console.log(`RARE-TAIL index (count<=2 only):    ${kb(v8.serialize(Object.fromEntries(locRare)).length)} KB`);
console.log(`unigram count map (the accumulator): ${kb(v8.serialize(Object.fromEntries(count)).length)} KB`);
// compression ratio per chapter sample
const psa=parse(readFileSync(join(ULB,"19-PSA.usfm"),"utf8")).tokens().map(t=>t.source).join("");
const raw=Buffer.byteLength(psa), gz=gzipSync(psa).length;
console.log(`compression ratio (whole Psalms text): ${(gz/raw).toFixed(3)} (raw ${kb(raw)}KB -> gz ${kb(gz)}KB)`);
