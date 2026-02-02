# Progress: Lockless Modes

## Current Status
- Planning complete.
- Plan + PRD validated.

## Decisions
- `editorMode`: `regular | usfm | plain` stored on `project.appSettings`.
- Default: `regular`.
- Markers: hidden in `regular`, visible in `usfm` and `plain`.
- Remove all locking/mutability (no `isMutable`, no locked-node traversal, no input interception).
- Guardrails split:
  - Tier A safety in all modes.
  - Tier B correctness assists only in `regular` and `usfm`.

## Notes / Risks
- Expect broad callsite churn due to removal of legacy mode matrix.
- Keep Tier B conservative to avoid cursor jank.

## Next Steps
1) Start execution with Task 01 (Settings.editorMode) + Task 02 (callsite compile fixes).
