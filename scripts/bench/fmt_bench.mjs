import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import v8 from "node:v8";
const PKG="/home/user/scripture-editor-proto/node_modules/usfm-onion-web/pkg-web";
const ULB="/tmp/ulb/en_ulb";
const wasm=readFileSync(join(PKG,"usfm_onion_web_bg.wasm"));
const mod=await import(join(PKG,"usfm_onion_web.js"));
mod.initSync({module:new WebAssembly.Module(wasm)});
const {parse,formatTokens}=mod;
const med=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const t=(fn,n=7,w=2)=>{for(let i=0;i<w;i++)fn();const a=[];for(let i=0;i<n;i++){const s=performance.now();fn();a.push(performance.now()-s);}return med(a);};
const ms=n=>n.toFixed(2);
const files=readdirSync(ULB).filter(f=>f.toLowerCase().endsWith(".usfm")).sort();
const books=files.map(f=>({name:f,toks:parse(readFileSync(join(ULB,f),"utf8")).tokens()}));
books.sort((a,b)=>b.toks.length-a.toks.length);
const big=books[0];
const avg=books.reduce((p,c)=>Math.abs(c.toks.length-3857)<Math.abs(p.toks.length-3857)?c:p);
for(const [lbl,bk] of [["biggest "+big.name,big],["avg "+avg.name,avg]]){
  const compute=t(()=>formatTokens(bk.toks,{insertStructuralLinebreaks:false}));
  const out=formatTokens(bk.toks,{insertStructuralLinebreaks:false}).tokens;
  const serOut=t(()=>v8.serialize(out));
  console.log(`${lbl.padEnd(22)} n=${String(bk.toks.length).padStart(6)} compute=${ms(compute).padStart(7)}ms  result-serialize=${ms(serOut).padStart(6)}ms (return tax on main)`);
}
