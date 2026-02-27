import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import { parseBookTextToCachedFileSection } from "@/app/domain/api/loadedProjectToParsedFiles.ts";

function walkUsfm(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            walkUsfm(fullPath, out);
            continue;
        }
        if (entry.name.endsWith(".usfm")) {
            out.push(fullPath);
        }
    }
    return out;
}

async function sha1(bytes: Uint8Array): Promise<ArrayBuffer> {
    return webcrypto.subtle.digest("SHA-1", bytes);
}

async function main() {
    const targetDir = process.argv[2];
    if (!targetDir) {
        throw new Error("Usage: pnpm exec tsx scripts/bench/warm-cache-validation.ts <project-dir>");
    }
    const files = walkUsfm(targetDir).sort();
    const totalBytes = files.reduce((sum, file) => sum + statSync(file).size, 0);

    console.time("warmCache.validate");
    for (const file of files) {
        await sha1(new Uint8Array(readFileSync(file)));
    }
    console.timeEnd("warmCache.validate");

    console.time("warmCache.repair");
    for (const file of files) {
        const text = readFileSync(file, "utf8");
        parseBookTextToCachedFileSection({
            relativePath: file,
            checksumSha1: "",
            bookCode: file.match(/([A-Z]{3})/u)?.[1] ?? "UNK",
            title: file,
            text,
            languageDirection: "ltr",
        });
    }
    console.timeEnd("warmCache.repair");

    console.log(
        JSON.stringify(
            {
                files: files.length,
                totalMiB: +(totalBytes / (1024 * 1024)).toFixed(3),
            },
            null,
            2,
        ),
    );
}

void main();
