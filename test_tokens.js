import { lexUsfm } from "./src/core/domain/usfm/lex.ts";

console.log("Test: \\\\v 8 8");
const tokens = lexUsfm("\\\\v 8 8");
console.log("Number of tokens:", tokens.length);
console.log("Tokens:");
tokens.forEach((t, i) => {
    console.log(`  [${i}] type="${t.type}" text="${t.text}"${t.value ? ` value="${t.value}"` : ''}`);
});
