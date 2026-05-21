# zephyr-updater worker

Cloudflare Worker serving the Tauri auto-updater manifest, backed by the
GitHub Releases API. Two envs: `production` (Stable, v* tags) and `nightly`
(Nightly, nightly-* tags).

Pair worker for the SPA static assets lives at the repo root
(`/wrangler.jsonc`, named `zephyr-spa`). They deploy independently because
Cloudflare's static-assets-only Workers can't accept env vars or secrets,
so bundling them was hitting that restriction.

## Layout

- `wrangler.toml` — env config, hostname routes, channel vars
- `src/index.ts` — fetch handler (path-routed manifest endpoints)
- `package.json` — local dev scripts

## Local dev

```bash
cd workers/zephyr-updater
pnpm install
pnpm dev
```

## Deploy

Normally driven by `.github/workflows/release.yml`. Manual:

```bash
pnpm deploy:production
pnpm deploy:nightly
```

Both envs require:
- `GH_TOKEN` as a Worker secret (`wrangler secret put GH_TOKEN --env production`,
  same for nightly). Public-release-read PAT. Raises the GH API rate limit from
  60/hr (unauth) to 5000/hr.
- Custom domain routes pre-bound in the Cloudflare dashboard.

## Endpoints

| Endpoint                              | Purpose                                     |
| ------------------------------------- | ------------------------------------------- |
| `/{target}/{current_version}`         | Auto-check. 204 if no newer; manifest otherwise. |
| `/versions`                           | List recent releases for the manual picker. |
| `/{target}/at/{specific_version}`     | Manifest for a specific version.            |

Target values follow Tauri convention: `darwin-aarch64`, `darwin-x86_64`,
`linux-x86_64`, `windows-x86_64`.

Manifest lookups are edge-cached for 60s.
