import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import v8 from "node:v8";
const PKG="/home/user/scripture-editor-proto/node_modules/usfm-onion-web/pkg-web";
const ULB="/tmp/ulb/en_ulb";
const mod=await import(join(PKG,"usfm_onion_web.js"));
mod.initSync({module:new WebAssembly.Module(readFileSync(join(PKG,"usfm_onion_web_bg.wasm")))});
const {parse}=mod;
const kb=n=>(n/1024).toFixed(1);
const files=readdirSync(ULB).filter(f=>f.toLowerCase().endsWith(".usfm")).sort();

let tokWire=0, sumWire=0, totalBigrams=0, distinctCorpus=new Set();
const perBookSummaries=[];
for(const f of files){
  const toks=parse(readFileSync(join(ULB,f),"utf8")).tokens();
  tokWire += v8.serialize(toks).length;
  // MAP: extract words from text tokens, build this book's bigram histogram + label/number locators
  const words=[];
  for(const t of toks){
    if(t.kind==="text" && t.source.trim()){
      for(const w of t.source.toLowerCase().match(/\p{L}+/gu)??[]) words.push(w);
    }
  }
  const bg=new Map();
  for(let i=0;i<words.length-1;i++){const k=words[i]+" "+words[i+1]; bg.set(k,(bg.get(k)??0)+1); distinctCorpus.add(k);}
  totalBigrams += words.length;
  // summary = histogram (as plain obj) + a few locators (chapter labels/numbers w/ token ids)
  const summary={ book:f, bigrams:Object.fromEntries(bg),
    chapterLabels: toks.filter(t=>t.marker==="cl").map(t=>({id:t.id,sid:t.sid,text:t.source})),
    chapterNums: toks.filter(t=>t.marker==="c").map(t=>({id:t.id,n:t.source})) };
  perBookSummaries.push(summary);
  sumWire += v8.serialize(summary).length;
}
console.log(`token corpus wire (what a mirror would hold):  ${kb(tokWire)} KB`);
console.log(`summary cache wire (bigram hist + locators):    ${kb(sumWire)} KB`);
console.log(`  -> summary is ${(sumWire/tokWire*100).toFixed(1)}% of the token corpus`);
console.log(`distinct corpus bigrams: ${distinctCorpus.size}, total bigram instances: ${totalBigrams}`);
console.log(`avg per-book summary: ${kb(sumWire/files.length)} KB  (this is the per-chapter-change re-reduce input)`);
