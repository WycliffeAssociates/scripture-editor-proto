# Release Pipeline & Auto-Updater

## What this covers
- Two release channels (Stable, Nightly) sharing one channel-aware workflow.
- Tauri auto-updater (desktop only) end-to-end: signing, manifest serving, in-app UX.
- Cloudflare topology (two Workers, one R2 bucket).
- Tag/version scheme that keeps semver comparison honest across both channels.

## Channels

| Channel | Trigger              | Tag format                                   | Audience       |
| ------- | -------------------- | -------------------------------------------- | -------------- |
| Stable  | push of `v*` tag     | `v0.1.5`                                     | Public users.  |
| Nightly | push to `master`     | `nightly-0.1.4-<YYYYMMDD>.<run>.sha<sha7>`   | Internal only. |

Tags for Stable are cut by **release-please** when its Release PR is merged. Tags for Nightly are derived inside `release.yml`'s `compute-channel` job and pushed by `tauri-action`.

## Workflows

| File                            | Purpose                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `.github/workflows/verify.yml`  | Required check on `master`. Architecture, typecheck, knip, unit, cargo check, frontend + web build, Playwright. |
| `.github/workflows/release.yml` | Channel-aware build + publish. See "Job graph" below.                                                |
| `.github/workflows/release-please.yml` | Maintains the Stable Release PR (versions + CHANGELOG) from Conventional Commit PR titles.    |
| `.github/workflows/pr-title.yml`       | Conventional Commits lint on PR titles only.                                                  |
| `.github/workflows/nightly-cleanup.yml` | Daily cron that deletes Nightly GH Releases older than 30 days (R2 retains an extra 30 days). |

Branch protection on `master` requires the `verify` check; tag pushes are exempt so release-please can land a tag without re-running PR review.

## release.yml job graph

```
compute-channel
        |
        v
build-frontend  -> uploads frontend-dist + web-dist artifacts
        |
        +--- build-desktops (matrix: macOS universal, Windows, Linux)
        |          - downloads frontend-dist
        |          - tauri-action: sign + bundle + publish to GH Release
        |
        +--- build-android   (Stable only)
        |          - downloads frontend-dist
        |          - APK + AAB published to GH Release
        |
        +--- deploy-web
        |          - downloads web-dist
        |          - wrangler deploy zephyr-spa     (--env production|nightly)
        |          - wrangler deploy zephyr-updater (--env production|nightly)
        |          - refreshes updater worker's GH_TOKEN secret from 1Password
        |
        v
mirror-r2 (after build-desktops + build-android + deploy-web)
        - rclone to r2:zephyr-releases/<channel>/<tag>/
```

`compute-channel` resolves the channel from the trigger (`refs/tags/v*` → Stable, else Nightly) and exports outputs every downstream job consumes:

- `channel` — `stable` | `nightly`
- `tag` — the GH tag we'll create
- `app_version` — the semver that gets baked into the binary (more on this below)
- `prerelease` — true on Nightly
- `config_args` — tauri-action `--config` overlay flags (Nightly appends `tauri.conf.nightly.json`)
- `wrangler_env` — `production` | `nightly`

Quality gates (typecheck/knip/unit/Playwright) live in `verify.yml` and only run on PR/push to feature branches. `release.yml` trusts that those passed before merge to master; it does not re-run them.

## Versioning and the patch script

Stable's `app_version` is the tag minus the leading `v` (release-please bumps `package.json`, `Cargo.toml`, and `tauri.conf.json` together inside the Release PR, so the in-tree value already matches).

Nightly's `app_version` is `<base>-<YYYYMMDD>.<github.run_number>.sha<sha7>`, e.g. `0.1.4-20260521.42.shaabc1234`. Three dot-separated pre-release identifiers give the Tauri updater plugin's semver comparator a monotonic ordering:

1. `YYYYMMDD` — numeric, monotonic per day.
2. `github.run_number` — numeric, monotonic per `release.yml` dispatch.
3. `sha<sha7>` — alphanumeric tail. The `sha` prefix avoids the semver-invalid case of an all-digit short SHA being parsed as a numeric identifier with a leading zero.

`scripts/patchAppVersion.mjs` rewrites `package.json`, `Cargo.toml` (preserving the `# x-release-please-version` marker comment), and `tauri.conf.json` to that value before each build job's frontend/Tauri compile. Without this, every Nightly between two Stable releases would carry the same Cargo.toml version and the updater plugin's `gt` check would never offer an update.

## Cloudflare topology

| Worker             | Location                                  | Role                                                                  |
| ------------------ | ----------------------------------------- | --------------------------------------------------------------------- |
| `zephyr-spa`       | Root `wrangler.jsonc`                     | Static SPA. Two envs: production (`zephyr.bibletranslationtools.org`), nightly (`zephyr-nightly.bttdev.org`). |
| `zephyr-updater`   | `workers/zephyr-updater/wrangler.toml`    | Updater manifest endpoint. Two envs: production (`updater.zephyr.bibletranslationtools.org`), nightly (`updater.zephyr.bttdev.org`). |

The split is structural: Cloudflare disallows env vars / secrets on workers that only serve static assets, so the SPA stays code-free and the updater (which needs `GH_TOKEN` and channel-scoped vars) is a sibling.

Both workers use `custom_domain: true` in their route bindings — wrangler creates the DNS records automatically on first deploy.

R2 bucket `zephyr-releases` mirrors every release under `<channel>/<tag>/` via rclone in CI. Lifecycle rules: Stable transitions to IA at 90 days (no expiration); Nightly expires at 60 days. The updater worker does not read from R2 — it queries the GitHub Releases API. R2 exists as an audit + recovery mirror, not the primary serving location.

## Updater manifest endpoints

`zephyr-updater` serves three paths off the `updater.zephyr.*` hostnames:

| Endpoint                                    | Purpose                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| `/{target}/{current_version}`               | Auto-check at launch. 204 if no newer; manifest otherwise. |
| `/versions`                                 | List recent releases for the manual picker.                |
| `/{target}/at/{specific_version}`           | Manifest for an exact version (manual switch).             |

`{target}` follows Tauri's convention: `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, `windows-x86_64`. The Tauri OS plugin returns `macos` for darwin, so `TauriUpdaterService.resolveUpdaterTarget()` maps that to `darwin` before building manifest URLs.

The worker fetches the `.sig` file contents inline at manifest-build time and embeds them in the `signature` field (Tauri expects file contents as a base64 minisign signature string, not a URL). Manifest lookups are edge-cached for 60 seconds to absorb update-check stampedes. `GH_TOKEN` (a public-repo-read PAT, sourced from 1Password and re-applied via `wrangler secret put` on every deploy) raises the GH API rate limit from 60/hr to 5000/hr.

## Signing

A single Tauri minisign keypair signs both channels. The private key + password live in 1Password (`op://DevOps/Scripture-Editor/tauri-updater-private-key`, `…-password`). `release.yml` pulls both at build time and forwards them as `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to `tauri-apps/tauri-action@v0`. The public key is embedded in `src/tauri/rust/tauri.conf.json` and shipped with every binary.

The Nightly overlay `src/tauri/rust/tauri.conf.nightly.json` overrides `productName` (`Zephyr Nightly`), `identifier` (`org.bibletranslationtools.zephyr.nightly`), and the updater endpoint URL — but **not** the pubkey. Same key, two channels, side-by-side install on the same machine via the distinct bundle identifier.

## In-app updater UX

Desktop-only — `IUpdaterService` is injected via `src/tauri/main.tsx`; web passes `null` and the UI hides itself.

Three surfaces, all sharing one React Query cache (`["updater", "available"]`):

- **Launch banner** (`src/app/ui/components/blocks/UpdateBanner.tsx`): fires once at app boot. Non-modal top-of-viewport. `Later` is per-session; `Install` downloads, verifies, applies, relaunches.
- **Settings → Advanced** (`src/app/ui/components/blocks/ProjectSettings/UpdateSettingsSection.tsx`): shows current version + channel; `Check for updates` button revalidates the shared query (banner reappears if an update is found); inline `Install` button on the same surface so users don't have to scroll back to the banner; version-switch dropdown for manual downgrades.
- **Manual switch via Rust command** (`src/tauri/rust/src/updater.rs::install_update_from_endpoint`): the JS plugin doesn't expose endpoint override, so this thin command builds an `UpdaterBuilder` pinned to a specific manifest URL with a `version_comparator` that always accepts. Same minisign verification and atomic install as the auto path.

Install failures surface via `useInstallUpdate`'s `onError` toast (localized via Lingui). Both banner and Settings inherit the same UX automatically.

## Out of scope (bookmarks)

- Windows code signing (Azure Trusted Signing). Currently unsigned — SmartScreen warning accepted.
- WebDriverIO Linux smoke tests for the Tauri shell.
- iOS builds.
- Per-branch experimental web preview deploys via `wrangler versions upload`.
- Cutting 1.0.0 (separate product-readiness decision).

## Operator runbook (terse)

| Task                                  | How                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Cut a Stable release                  | Merge the open release-please PR. Tag pushes automatically; `release.yml` runs Stable.       |
| Trigger a Nightly                     | Push (or merge) to `master`. `release.yml` runs Nightly automatically.                       |
| Rotate `GH_TOKEN`                     | Update `updater-gh-token` in 1Password. Next `release.yml` run refreshes the worker secret.  |
| Manually deploy a worker              | `cd workers/zephyr-updater && pnpm wrangler deploy --env <env>` (or root for `zephyr-spa`).  |
| Force a nightly cleanup               | `workflow_dispatch` on `nightly-cleanup.yml` with the `retention_days` input.                |
| Switch a desktop user to old version  | They open Settings → Advanced → Switch version → pick the older tag → confirm downgrade.     |
