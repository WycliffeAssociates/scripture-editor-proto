# Dovetail AGENTS Guide

Dovetail is a local-first scripture editor for USFM, with shared core logic across Web (OPFS) and Desktop (Tauri).

## Repository-wide essentials
- Package manager: `pnpm`
- Primary dev commands:
  - `pnpm dev.web`
  - `pnpm dev.tauri`
  - `pnpm test:unit`
  - `pnpm test.e2e`
  - `pnpm run format`

## Architecture boundaries
- `src/core/`: domain logic only (no React/UI)
- `src/app/`: React UI and app integration
- `src/web/`: web platform adapters
- `src/tauri/`: desktop platform adapters

## Working style in this repo
- Prefer small, focused changes over broad rewrites.
- Preserve existing architecture and naming patterns unless explicitly asked to refactor.
- Validate changes with the smallest relevant test scope first.

## Progressive disclosure
Use the docs below when relevant to the task instead of adding large rule sets here.

- Product behavior and feature expectations:
  - `product-docs/specs/`
- Save/diff/revert behavior:
  - `product-docs/specs/save-diff-revert-functionality.md`
- Editor mode behavior:
  - `product-docs/specs/usfm-editing-modes.md`
- Custom history behavior:
  - `product-docs/specs/custom-history.md`
- Current and archived plans:
  - `plans/`

## Notes for maintainers
Keep this root file short and stable. Add domain-specific guidance to dedicated docs and link it here.
