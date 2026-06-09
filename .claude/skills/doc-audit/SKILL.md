---
name: doc-audit
description: Audit this repo's docs against the work landed since the last release tag. Use when the user says "doc audit", "audit the docs", "documentation pass", or wants docs brought current before/at a release. Refreshes product-docs/specs, adds specs for new subsystems, purges ephemeral code comments, and updates TECH_STACK / agent-learnings / the architecture overview.
---

# Documentation audit

Bring the docs current with the code as it stands **today**, scoped to the work
since the last release tag. The guiding rule everywhere: **docs and comments
tell the as-of-today story.** Forward-looking notes (TODO/HACK/FIXME, "eventual
upgrade path") are fine. Migration history ("used to", "previously", "we changed
X to Y", "see §N", plan-doc pointers, stale "PoC"/"REVERT BEFORE MERGE") is
noise — purge it.

## Doc locations

| What | Where |
|---|---|
| Lightweight per-subsystem specs | `product-docs/specs/*.md` |
| Pivotal / ADR-like core abstractions | `product-docs/TECH_STACK.md` |
| Big gotchas, debug seams | `product-docs/agent-learnings.md` |
| One rich whole-system overview (dated, tagged) | `product-docs/<date>-codebase-architecture-<tag>.html` |
| Forward-looking idea notes (not audited for currency) | `product-docs/ideas/` |

## Steps

### 1. Establish the range
Find the last release tag and survey what changed:
`git --no-pager log --oneline <lastTag>..HEAD`,
`git --no-pager diff --stat <lastTag>..HEAD`,
`git --no-pager diff --name-only <lastTag>..HEAD`. Group the changed files by
subsystem — that grouping drives the spec partition below.

### 2. Spec freshness (steps 1–2 of the ask)
Partition `product-docs/specs/*.md` into a few non-overlapping clusters by
subsystem and **fan out one subagent per cluster** (sonnet, general-purpose).
Each agent: reads its specs fully, verifies every factual claim against current
code (prefer codegraph for structural lookups), edits stale/wrong content in
place to describe today's behavior, preserves the existing voice/structure
(these are concise — don't bloat), strips ephemeral references, and **reports**
(does not create) any new-spec need. Add one "sweep" agent over the specs you
expect to be untouched, to confirm cheaply and only edit genuine staleness.
Keep new-spec *decisions* and writing centralized in the orchestrator for
consistency; review the agents' diffs afterward (`git diff product-docs/specs/`).

### 3. New specs for new subsystems
For any whole new module/behavior/feature with no coverage, add a
`product-docs/specs/<topic>.md`. Match the lightweight house style: a short
intro, current-state prose sections, and a "Key files" list. Ground every claim
in real code (file:symbol).

### 4. Comment audit (step 3 of the ask)
Launch a **haiku subagent** to codegraph/grep source changed since the tag (and
broadly across `src/`) for ephemeral comments — patterns like `used to`,
`previously`, `formerly`, `no longer`, `see §`, `see section`, plan-doc
references, `PoC`, `REVERT BEFORE MERGE`. It **reports only** (`path:line` +
text + why + suggested rewrite); the orchestrator applies the fixes, because
rewrites need judgment. Keep genuine current-state notes and forward-looking
TODOs.

### 5. Gotchas and pivotal decisions (step 5 — can happen before 4)
Super-large gotchas → `product-docs/agent-learnings.md`. Brand-new or pivotal
ADR-like decisions → `product-docs/TECH_STACK.md`. Also treat TECH_STACK as a
keep-current doc: refresh its core-abstraction sections (node list, mode model,
state/pipeline inventory) if the landed work changed them.

### 6. The rich overview (step 4 — last)
`product-docs/<date>-codebase-architecture-<tag>.html` is the single
whole-system overview, dated and tagged for the state it was good for. Update or
regenerate it to reflect the audited state. **Confirm with the user** whether to
do this now (a new dated file at the current HEAD) or defer to the next tag cut,
and whether to update in place vs. create a new dated file — the tag/date stamp
is a deliberate marker.

## Notes
- Leave the result in the working tree for the user's editor review unless they
  ask to commit; if committing, group logically (spec refresh vs comment purge
  vs overview).
- Don't run the full test suite for doc/comment-only changes — comments are
  comment-only edits; `tsc` is unaffected.
