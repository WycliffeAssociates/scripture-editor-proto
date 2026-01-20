# Progress: Context Menu & Action Palette Refactor

## Status
- [x] Design validated
- [x] PRD created
- [x] Task 1: Define Types and Action Registry
- [x] Task 2: Implement Core Editor Actions
- [x] Task 3: Implement Context Gathering Hook
- [x] Task 4: Build the Action Palette UI
- [x] Task 5: Integrate and Replace Old Plugin
- [x] Task 6: E2E Testing and Verification

## Decisions
- Using Mantine Combobox for the UI to handle search and keyboard navigation.
- Action Registry is a flat list with categories.
- Multi-step actions return an `ActionStep` to transition the UI.
- Wrapped action execution in `editor.update` within the UI layer.
- Maintained existing test IDs to ensure E2E tests continue to pass.

## Blockers
- None.

## Next Steps
- Implement `types.ts` and `registry.ts`.
- Extract core actions (markers, modes, search).
