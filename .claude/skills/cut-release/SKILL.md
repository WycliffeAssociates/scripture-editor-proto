---
name: cut-release
description: Cut a Stable release for the Zephyr repo. Use when the user says "cut a release", "cut X.Y.Z", "ship a release", or asks to tag and release Stable. Drives a four-step flow — release-prep branch, AI-drafted PR body, human merge, tag-and-push to fire release.yml.
---

# Cut Stable release

This repo has two channels, both driven by `.github/workflows/release.yml`:

- **Nightly** fires on every push to `master`. Version is `<base>-<run_number>`, where `<base>` is whatever `package.json` says on master. No human action needed; happens automatically with every merge.
- **Stable** fires on push of a `v*` tag (matches `tags: ["v*"]` in release.yml). The tag is the trigger. Nothing else.

There is **no release-please bot** and **no conventional-commit enforcement**. PR titles can be anything. Commit messages can be anything. The contract between development and release is the version tag.

## When the user asks to cut a release

Run the steps below in order. Stop and report after step 6 (PR opened); the user must merge before you proceed to tagging.

### 1. Confirm the target version

If the user said `cut 0.3.1` or similar, use that. If they said `cut a patch` / `cut a minor` / `cut a release` without a version, read `package.json` to find the current version and propose the next bump:

- patch: `0.3.0` → `0.3.1`
- minor: `0.3.0` → `0.4.0`
- major: `0.3.0` → `1.0.0` (sanity-check this — pre-1.0 majors should be deliberate)

Ask the user to confirm the version before proceeding.

### 2. Branch off master

```bash
git fetch origin master
git checkout -b "release/v${NEW_VERSION}" origin/master
```

Always branch from `origin/master`, not local master, so we're cutting from the actual remote state.

### 3. Patch in-tree manifests

```bash
node scripts/patchAppVersion.mjs "${NEW_VERSION}"
```

This rewrites `package.json`, `src/tauri/rust/Cargo.toml`, and `src/tauri/rust/tauri.conf.json` to the new version. It is the same script `release.yml` uses at build time, so we're guaranteed local and CI agree on what to do.

If `Cargo.lock` was modified incidentally (Rust analyzer touching it), include it in the commit too — those updates are real and benign.

### 4. Commit

```bash
git add package.json src/tauri/rust/Cargo.toml src/tauri/rust/tauri.conf.json src/tauri/rust/Cargo.lock
git commit -m "release: v${NEW_VERSION}"
```

Commit message can be whatever. There is no convention requirement. `release: v0.3.1` is clear.

### 5. Push the branch

```bash
git push -u origin "release/v${NEW_VERSION}"
```

### 6. Open the PR with an AI-drafted body

Find the previous Stable tag (the version we're bumping from) and use it to bound the change set:

```bash
prev_tag=$(git tag -l 'v*' --sort=-v:refname | grep -v -- '-' | head -n1)
git log "${prev_tag}..HEAD" --pretty=format:'- %s (%h)'
```

This excludes Nightly-style tags (which have `-` from the `<base>-<run>` format) and gives a one-line-per-commit summary suitable for the PR body.

**Drafting the body:** group commits into a short narrative — what's new, what's fixed, anything notable. Don't just paste the `git log` output; that's lazy. Look at the commit messages, group them by theme, and write 3-6 bullet points a human can read in 30 seconds. Mention any breaking changes or migration notes if you spot them.

Then open the PR:

```bash
gh pr create \
  --title "release: v${NEW_VERSION}" \
  --body "$(cat <<'EOF'
## Summary

<your drafted summary>

## Changes since v${PREV_VERSION}

<grouped bullet points>

## Test plan

- [ ] Verify Stable build runs after merge + tag push
- [ ] Smoke-test the resulting installers on at least one platform
EOF
)"
```

Report the PR URL to the user. **Stop here.** The user reviews and merges through the GitHub UI; you do not auto-merge.

### 7. After the user merges — tag and push

Only proceed when the user confirms the PR is merged.

```bash
git fetch origin master
git checkout master
git pull --ff-only
# Tag at the merge commit (current HEAD of master)
git tag "v${NEW_VERSION}"
git push origin "v${NEW_VERSION}"
```

The tag push fires `release.yml` on `refs/tags/v${NEW_VERSION}`. `compute-channel` resolves channel = `stable`, which builds:
- Universal macOS (signed + notarized via App Store Connect)
- Windows MSI + NSIS
- Linux AppImage + .deb + .rpm
- Android APK + AAB (build-android only runs on Stable)
- SPA worker + updater worker deployed to production envs
- All artifacts mirrored to R2 under `stable/v${NEW_VERSION}/`

Watch the run:

```bash
gh run watch --repo WycliffeAssociates/scripture-editor-proto $(gh run list --workflow=release.yml --limit=1 --json databaseId --jq '.[0].databaseId')
```

Report the final state (success / which jobs failed) to the user.

## Things to know

- **Branch protection on master is fine.** Tag refs aren't covered by branch protection rules — the `git push origin v0.X.Y` works even when direct pushes to master are blocked.
- **Don't tag before merge.** The release-prep PR's commit becomes part of master only after merge. Tagging before merge would produce a binary whose in-tree version doesn't match the merge commit on master.
- **Nightly base auto-tracks.** Once the release-prep PR merges, `package.json` on master is at `v${NEW_VERSION}`, so subsequent Nightly builds are `${NEW_VERSION}-<run>`. No separate Nightly bump needed.
- **If something goes wrong post-tag**, you can delete the remote tag (`git push origin --delete v0.X.Y`) and the GH Release (`gh release delete v0.X.Y --cleanup-tag`) to retry. Destructive — ask the user first.
- **Skipping a version is fine.** If 0.3.1 fails to build and the user wants to abandon it, cut 0.3.2 next. No need to "fix" the failed 0.3.1.

## Don't

- Don't enforce conventional commits or PR title formats — the repo deliberately doesn't require them.
- Don't auto-merge the release-prep PR. The user reviews diffs before merging.
- Don't tag from a feature branch. Always tag the merge commit on `master`.
- Don't push a tag without first patching `patchAppVersion.mjs` into master via PR. The tag-triggered build re-runs `patchAppVersion.mjs` against the tagged commit, so the version in `package.json` at that commit must match the tag for the binary's reported version to be coherent.
