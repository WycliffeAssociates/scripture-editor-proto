# Handoff — start the Findings & Annotation Layer

**Goal for the next session:** begin implementing the plan in
`agent-tmp/plans/findings-annotation-layer.md`, starting with **Phase 1 (the spine)**.

This handoff is orientation only — **the plan is the source of truth.** Read it first; don't
re-derive it. This file just says how we got here, where to start, and what the plan assumes you
already know.

## What this is

A source-agnostic editor "findings" layer: one `EditorAnnotation` shape
(`message + actions[] + optional details`) produced by a `(source, code) → provider` registry,
so onion lint issues, scripture-sous-chef content findings, and app heuristics (chapter-label)
all render through one `AnnotationPopover`. Two anchor shapes: `token` (structural lint, today)
and `content` `(sid, Utf16Span)` (sub-token findings, resolved to DOM rects via onion's
`vref_index`). Full rationale, verified facts, phases, deferrals, and open questions are in the
plan.

## Read in this order

1. `agent-tmp/plans/findings-annotation-layer.md` — the plan (this work).
2. onion companion docs (context for the addressing substrate; onion side already landed):
   `~/Documents/Work/Code/usfm_onion/plans/handoff-vref-index-vision.md`, then `plan-vref-index.md`.
3. Auto-memory (already loaded each session): `project_findings_annotation_layer`,
   `project_lint_highlight_direction`, `feedback_review_dirty_buffer`, `feedback_form_mode_lexical`.

## Where to start — Phase 1 (the spine), low-risk, behavior-preserving

Refactor `src/app/ui/components/blocks/LintFixPopover.tsx` → an `AnnotationPopover` that renders
`EditorAnnotation[]`, plus the `(source, code) → provider` registry with a **default onion
provider** that reproduces today's behavior exactly (lint message + the single `issue.fix` as one
action). `useEditorLintTooltip.ts` and `LintDomAnnotatorPlugin.tsx`'s rect layer are reused as-is.
**This phase is a no-op for the user** — existing lint-fix tests must pass untouched. See the plan's
"Phase 1" and "Provider shapes" for the exact types and PR boundary.

Phases 2 (chapter-label) and 3 (content-findings PoC with onion+sous as local path deps) come
after and are independent of each other; don't start them until the spine lands.

## Key things the plan assumes you verified (so you don't re-litigate)

- onion is the segmenter of record; it ships `vrefIndex()/vrefIndexUsfm/vrefIndexTokens` +
  `lintTokens`. sous (`crates/wasm`) ships `analyze_vref(Record<sid,string>) → Finding[]` (UTF-16).
- Editor deps pin published onion tags **without** the vref work (Tauri `usfm_onion` git `v0.0.4`;
  web `usfm-onion-web#v0.0.5`) — Phase 3 swaps these to local path/`file:` deps (PoC-only, mark them).
- sous integrates as a **parallel `WorkingFilesStore` subscriber** (`makeSousPipeline`, sibling of
  `makeLintPipeline`), NOT a tee on the lint IPC. The lint path is untouched.
- The two result streams union at `lint.filteredVisibleIssues` (`LintDomAnnotatorPlugin.tsx:416`),
  keyed by the token-ids each annotation touches.

## Constraints / working style (from the user)

- **Leave applied work in the dirty buffer; do not auto-commit.** The user reviews diffs in the editor.
- **Verify against current code before asserting behavior** — name patterns precisely; don't trust
  stale memory file:line cites without checking.
- Branch off `master` before committing anything. Plans live in `agent-tmp/`.
- This is a CodeGraph repo (`codegraph_*` MCP tools) — prefer it for structural lookups over grep.

## Suggested skills for the next session

- `engineering-values` — the user's human-in-the-loop constraints (surgical changes, assumptions,
  testing intent). Apply when planning/implementing.
- `tdd` — Phase 1 is a behavior-preserving refactor with an existing test suite; red-green is a good fit.
- `tools-pseudocode` — optional, if you want to nail the `EditorAnnotation`/registry interfaces and
  call paths before writing production code.
