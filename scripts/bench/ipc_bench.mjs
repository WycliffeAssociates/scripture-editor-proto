import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import v8 from "node:v8";
const PKG="/home/user/scripture-editor-proto/node_modules/usfm-onion-web/pkg-web";
const ULB="/tmp/ulb/en_ulb";
const mod=await import(join(PKG,"usfm_onion_web.js"));
mod.initSync({module:new WebAssembly.Module(readFileSync(join(PKG,"usfm_onion_web_bg.wasm")))});
const {parse}=mod;
const med=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const t=(fn,n=7,w=2)=>{for(let i=0;i<w;i++)fn();const a=[];for(let i=0;i<n;i++){const s=performance.now();fn();a.push(performance.now()-s);}return med(a);};
const ms=n=>n.toFixed(2);
const enc=new TextEncoder();
const files=readdirSync(ULB).filter(f=>f.toLowerCase().endsWith(".usfm")).sort();
const books=files.map(f=>({name:f,toks:parse(readFileSync(join(ULB,f),"utf8")).tokens()}));
let proj=[];for(const b of books)proj=proj.concat(b.toks);
books.sort((a,b)=>b.toks.length-a.toks.length);
const big=books[0];
const avg=books.reduce((p,c)=>Math.abs(c.toks.length-3857)<Math.abs(p.toks.length-3857)?c:p);
console.log("scope                  n        v8.ser   JSON.str  TE.encode(str)  stringify+encode  JSON.parse(in)");
for(const [lbl,toks] of [["whole project",proj],["biggest "+big.name,big.toks],["avg "+avg.name,avg.toks]]){
  const vs=t(()=>v8.serialize(toks));
  const js=t(()=>JSON.stringify(toks));
  const s=JSON.stringify(toks);
  const te=t(()=>enc.encode(s));
  const both=t(()=>enc.encode(JSON.stringify(toks)));
  const jp=t(()=>JSON.parse(s));
  console.log(`${lbl.padEnd(20)} ${String(toks.length).padStart(7)}  ${ms(vs).padStart(7)}  ${ms(js).padStart(7)}  ${ms(te).padStart(11)}  ${ms(both).padStart(14)}  ${ms(jp).padStart(11)}`);
}
