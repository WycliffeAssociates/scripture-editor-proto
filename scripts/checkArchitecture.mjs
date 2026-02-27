import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const coreDir = path.join(rootDir, "src", "core");

const forbiddenPrefixes = ["@/app/", "@/web/", "@/tauri/"];
const allowedRelativePrefixes = ["./", "../"];
const allowedNodePrefixes = ["node:"];

const violations = [];
const allowedLegacyViolations = new Set([
  "src/core/persistence/ProjectRepository.ts:@/app/data/parsedProject.ts",
  "src/core/persistence/repositories/ProjectRepository.ts:@/app/data/parsedProject.ts",
  "src/core/persistence/repositories/ProjectRepository.ts:@/app/db/api.ts",
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
      continue;
    }

    const text = fs.readFileSync(fullPath, "utf8");
    const importMatches = [...text.matchAll(/from\s+"([^"]+)"|from\s+'([^']+)'/g)];

    for (const match of importMatches) {
      const specifier = match[1] || match[2] || "";
      if (!specifier) continue;

      if (forbiddenPrefixes.some((prefix) => specifier.startsWith(prefix))) {
        const relativeFile = path.relative(rootDir, fullPath);
        const key = `${relativeFile}:${specifier}`;
        if (!allowedLegacyViolations.has(key)) {
          violations.push({ file: fullPath, specifier });
        }
        continue;
      }

      if (
        allowedRelativePrefixes.some((prefix) => specifier.startsWith(prefix)) ||
        allowedNodePrefixes.some((prefix) => specifier.startsWith(prefix)) ||
        specifier.startsWith("@/core/")
      ) {
        continue;
      }
    }
  }
}

walk(coreDir);

if (violations.length > 0) {
  console.error("Architecture boundary violations found (src/core cannot import app/web/tauri):");
  for (const violation of violations) {
    console.error(`- ${path.relative(rootDir, violation.file)} -> ${violation.specifier}`);
  }
  process.exit(1);
}

console.log("Architecture boundary check passed.");
