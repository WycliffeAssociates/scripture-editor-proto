import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import v8 from "node:v8";
const PKG="/home/user/scripture-editor-proto/node_modules/usfm-onion-web/pkg-web";
const ULB="/tmp/ulb/en_ulb";
const mod=await import(join(PKG,"usfm_onion_web.js"));
mod.initSync({module:new WebAssembly.Module(readFileSync(join(PKG,"usfm_onion_web_bg.wasm")))});
const {parse}=mod;
const kb=n=>(n/1024).toFixed(0);
const files=readdirSync(ULB).filter(f=>f.toLowerCase().endsWith(".usfm")).sort();
const histo=new Map(); const invIndex=new Map(); // bigram -> count   vs   bigram -> [locators]
for(const f of files){
  const toks=parse(readFileSync(join(ULB,f),"utf8")).tokens();
  let prev=null, prevId=null;
  for(const t of toks){
    if(t.kind!=="text"||!t.source.trim()) continue;
    for(const w of t.source.toLowerCase().match(/\p{L}+/gu)??[]){
      if(prev!==null){const k=prev+" "+w;
        histo.set(k,(histo.get(k)??0)+1);
        (invIndex.get(k)??invIndex.set(k,[]).get(k)).push({book:f,id:prevId,sid:t.sid});}
      prev=w; prevId=t.id;
    }
  }
}
const histoObj=Object.fromEntries(histo);
const invObj=Object.fromEntries(invIndex);
console.log(`distinct bigrams: ${histo.size}`);
console.log(`HISTOGRAM (count what's frequent):     ${kb(v8.serialize(histoObj).length)} KB`);
console.log(`INVERTED INDEX (point at every occ.):  ${kb(v8.serialize(invObj).length)} KB`);
console.log(`ratio: inverted index is ${(v8.serialize(invObj).length/v8.serialize(histoObj).length).toFixed(1)}x the histogram`);
