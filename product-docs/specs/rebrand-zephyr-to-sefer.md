# Rebrand: Zephyr → Sefer

The product was renamed from Zephyr to Sefer. This pass covers what changed and — more importantly — what was deliberately left alone, because a few "Zephyr" strings are load-bearing identifiers, not display text.

## Changed (cosmetic — display name, docs, comments)

- Tauri `productName` and window `title`, both channels (`tauri.conf.json`, `tauri.conf.nightly.json`)
- Rust crate name (`Cargo.toml`) — cosmetic, only affects the built binary filename
- Root `package.json` name
- `index.html` / `web.html` titles; web favicon swapped to the new Sefer mark (`public/sefer.svg`, replacing `public/zephyr.svg`)
- User-facing strings + i18n catalogs (en/es `.po` + compiled `.ts`)
- Doc-comments, `product-docs/**` prose, `PRODUCT.md`, `AGENTS.MD`, `.browserslistrc`, agent/skill configs (`.opencode/**`, `.claude/skills/**`)
- Android display strings (`gen/android/.../strings.xml` `app_name` / `main_activity_title`)
- A cosmetic git reflog message in `git.rs`

## Deliberately NOT changed — pending a decision

Everything below still says "zephyr" on purpose. Sefer is alpha (not in the field yet), but **internal testers are already running it with in-app auto-update wired up**, and Tauri's updater treats a changed `identifier` or a changed updater endpoint as a *different app* — existing installs would stop seeing updates silently, not fail loudly.

**Bundle identity + update channel:**
- `identifier` in `tauri.conf.json` / `tauri.conf.nightly.json`: `org.bibletranslationtools.zephyr[.nightly]`
- Updater endpoints: `updater.zephyr.bibletranslationtools.org`, `updater.zephyr.bttdev.org`
- Cloudflare Worker names/routes: `zephyr-spa`, `zephyr-updater` (`wrangler.jsonc`, `workers/zephyr-updater/**`)
- R2 backup bucket `zephyr-releases`, release asset filenames in `.github/workflows/release.yml`
- Android `applicationId`/`namespace` and the `gen/android` Java package dirs (`org/bibletranslationtools/zephyr`)
- `gen/apple` entirely (Xcode project/target/scheme names, `PRODUCT_BUNDLE_IDENTIFIER`) — this is Tauri-scaffolded and normally regenerated via `tauri ios init` rather than hand-edited; touching it by hand risks corrupting the `.pbxproj`

**Persisted data identifiers** (changing these needs a migration path, not a rename, since they affect existing local data for internal testers):
- IndexedDB database name `zephyr-editor` (`DexieProjectIndex.ts`)
- localStorage key `zephyr.storageNamespace` (`storageNamespace.ts`)
- Git commit author identity `Zephyr <zephyr@wycliffeassociates.org>` (`gitConstants.ts`)
- Git commit trailer keys `x-zephyr-version` / `x-zephyr-op` / `x-zephyr-chapters` (`gitVersionUtils.ts`) — parsed back out of existing commit history
- Session token key prefix `zephyr` (`FsBackedAuthSessionProvider.ts`)
- Fallback noreply email domain `@users.noreply.zephyr.local` (`gitCommitAuthorResolver.ts`)
- Temp-file naming pattern `zephyr-import-*` (`import.rs`)
- Project metadata `softwareName: "Zephyr"` written into saved files (`metadataEditor.ts`)
- The corresponding test assertions in `tests/unit/**` (mirror the constants above)

## The open decision

Pick one before touching the items above:

1. **Leave them.** No break, no migration work, but "zephyr" persists indefinitely in URLs, the bundle ID, and on-disk data — invisible to users, but real for anyone reading infra config or repo history.
2. **Cut over deliberately.** Ship one last Zephyr build whose only job is "go download Sefer," then rename identifier/endpoints/workers/persisted keys together in a single coordinated release, with a known one-time manual-reinstall step for internal testers.
3. **Partial rename with compatibility shims** — e.g. new endpoint hostnames that alias to the old ones for a deprecation window, or read-old/write-new for the persisted keys — more work, avoids the hard cutover.

Since Sefer hasn't shipped externally yet, option 2 is cheapest while the blast radius is still just internal testers.



# User (me will) message: 
(for later)

 Since it's all internal, I think I just want to update everything everywhere.

  I can go update the dns names
  I just need an old -> new table for the updaters to make sure I get the all

  Obv can't change the workers names easily, those would be redeploy and are internal so no biggie there.
  Can't change the r2 backup bucket name too easily, so that should likely stay no?

  Persisted data identifiers -> I think I just want to migrate these internal usages as well.
