#!/usr/bin/env node

/**
 * Patch the in-tree app version across package.json, Cargo.toml, and
 * tauri.conf.json in one pass.
 *
 * Used by release.yml's nightly path: the standard release-please version
 * (e.g. "0.1.4") is rewritten to a semver-with-prerelease form
 * (e.g. "0.1.4-20260521-abc1234") so the binary reports the nightly identity
 * to the Tauri updater plugin. Without this, all nightlies between two
 * stable releases would share the same Cargo.toml version and the plugin's
 * semver comparison would never offer an update on the Nightly channel.
 *
 * The Cargo.toml replacement preserves any trailing comment on the version
 * line (e.g. the `# x-release-please-version` marker added in Stage 1).
 *
 * usage: node scripts/patchAppVersion.mjs <semver-string>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const newVersion = process.argv[2];
if (!newVersion) {
    console.error("usage: patchAppVersion.mjs <version>");
    process.exit(1);
}

const pkgPath = path.join(repoRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = newVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);

const confPath = path.join(repoRoot, "src/tauri/rust/tauri.conf.json");
const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
conf.version = newVersion;
fs.writeFileSync(confPath, `${JSON.stringify(conf, null, 4)}\n`);

const cargoPath = path.join(repoRoot, "src/tauri/rust/Cargo.toml");
const cargo = fs.readFileSync(cargoPath, "utf8");
const replaced = cargo.replace(
    /^version = "[^"]*"/m,
    `version = "${newVersion}"`,
);
fs.writeFileSync(cargoPath, replaced);

console.log(`Patched app version to ${newVersion}`);
