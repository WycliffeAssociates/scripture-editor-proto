# Design System / Base UI Migration Plan

## Objective

Move Dovetail off Mantine incrementally and onto a Base UI + custom design-system foundation, without a broad visual rewrite and with minimal behavior changes.

This is not a merge-from-playground project. The parallel checkout at `/Users/willkelly/Documents/Work/Code/Dovetail` is a reference implementation and component source, not the source of truth for this branch.

## What Success Looks Like

- Mantine and Base UI can coexist during the migration.
- New shared UI primitives and tokens live in our code, not in Mantine theme configuration.
- Existing screens keep their current behavior unless a deliberate migration requires a small change.
- We can develop and review primitives in an isolated style guide route before using them in production screens.
- Mantine is removed in stages, with the smallest relevant validation at each stage.

## Non-Goals

- Rebuilding the entire app UI at once.
- Waiting for a fully finished design before starting.
- Forcing the auth branch to conform to the playground branch structure where that would create merge pressure.
- Removing every Mantine dependency in the first pass.

## Current State

The runtime app shell is now on the app-owned design system and Base UI primitives.

- Mantine styles and `MantineProvider` have been removed from [`src/app/entrypoint.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/entrypoint.tsx).
- [`src/app/ui/styles/mantineTheme.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/styles/mantineTheme.ts) has been deleted.
- The old Mantine search implementation [`src/app/ui/components/blocks/Search.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/Search.tsx) and its stylesheet have been deleted, with the surviving functionality moved under [`src/app/ui/components/views/search-panel/`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/views/search-panel).
- Responsive/theme context is app-owned in [`src/app/ui/contexts/MediaQuery.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/contexts/MediaQuery.tsx).
- Notifications are app-owned and Base UI-backed in [`src/app/ui/components/primitives/Notifications.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/primitives/Notifications.tsx).
- Remaining Mantine work is now mostly dependency cleanup and any straggling tests or stale generated references, not active runtime UI wiring.

The playground checkout already proves out a partial migration:

- `@base-ui/react` added.
- A custom token contract in `src/app/ui/styles/designSystem.css.ts`.
- A dev-only style guide route.
- Initial primitives for `Button`, `Kbd`, `RadioGroup`, `Select`, `Slider`, `Switch`, `Tabs`, `ToggleGroup`, `EditorToolbar`.
- Base UI toast infrastructure replacing Mantine notifications.
- Some migrated call sites such as `ReferencePicker` and `ActionPalette`.

It is still transitional, not final:

- Mantine remains in the playground entrypoint and some style-guide code.
- Some file moves in the playground are not appropriate to copy directly into this branch.
- The current branch has auth work and other branch-specific changes that must remain the primary integration target.

## Status Update

Last updated: 2026-04-06

### Done

- `@base-ui/react` is available in this branch.
- The shared design-system token contract is landed in [`src/app/ui/styles/designSystem.css.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/styles/designSystem.css.ts).
- Shared breakpoint tokens and query helpers are landed in:
  - [`src/app/ui/styles/designSystem.css.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/styles/designSystem.css.ts)
  - [`src/app/ui/styles/breakpoints.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/styles/breakpoints.ts)
- The style guide route is present:
  - [`src/app/routes/style-guide.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/routes/style-guide.tsx)
  - [`src/app/routes/style-guide.lazy.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/routes/style-guide.lazy.tsx)
- Base UI toast infrastructure has replaced Mantine notifications:
  - [`src/app/ui/components/primitives/Notifications.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/primitives/Notifications.tsx)
  - [`src/app/ui/components/primitives/toastManager.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/primitives/toastManager.ts)
  - [`src/app/ui/styles/modules/Notifications.module.css.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/styles/modules/Notifications.module.css.ts)
- The old Mantine-derived CSS shim is gone:
  - [`src/app/ui/styles/theme.css.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/styles/theme.css.ts)
- The app bootstrap now renders app-owned toasts instead of Mantine `Notifications`:
  - [`src/app/entrypoint.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/entrypoint.tsx)
- Mantine runtime bootstrap has been removed from [`src/app/entrypoint.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/entrypoint.tsx).
- [`src/app/ui/styles/mantineTheme.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/styles/mantineTheme.ts) has been removed.
- Primitive library work has started and the following are landed:
  - `Button`
  - `Kbd`
  - `RadioGroup`
  - `Select`
  - `Slider`
  - `Switch`
  - `Tabs`
  - `ToggleGroup`
  - `EditorToolbar`
- Colocated vanilla-extract styling for primitives is in place under `src/app/ui/components/primitives/**`.
- App-owned color scheme switching is wired through document classes instead of relying purely on Mantine color-scheme state:
  - [`src/app/ui/theme/appTheme.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/theme/appTheme.ts)
  - [`src/web/main.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/web/main.tsx)
  - [`src/tauri/main.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/tauri/main.tsx)
- The project shell has started moving toward the new app layout in [`src/app/ui/components/views/ProjectView.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/views/ProjectView.tsx).
- The left sidebar book/chapter picker exists as a Base UI-era component and is using real workspace data:
  - [`src/app/ui/components/blocks/BookChapterPickerSidebar/BookChapterPickerSidebar.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/BookChapterPickerSidebar/BookChapterPickerSidebar.tsx)
  - [`src/app/ui/components/blocks/BookChapterPickerSidebar/bookChapterPickerSidebar.css.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/BookChapterPickerSidebar/bookChapterPickerSidebar.css.ts)
- Mantine hook replacements are landed under `src/app/ui/hooks/general/**`.
- [`src/app/ui/contexts/MediaQuery.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/contexts/MediaQuery.tsx) is off Mantine.
- [`src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx) is off Mantine, but still needs design tuning.
- [`src/app/ui/components/blocks/ReferencePicker.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ReferencePicker.tsx) has been removed rather than migrated.
- [`src/app/ui/components/blocks/Search.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/Search.tsx) has been removed rather than migrated.
- [`src/app/ui/components/blocks/ProjectSettings/Settings.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ProjectSettings/Settings.tsx) is off Mantine and is now using the workspace overlay model instead of the old drawer path.
- [`src/app/ui/components/blocks/AppDrawer.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/AppDrawer.tsx) has been removed rather than migrated.
- Settings-related controls are off Mantine:
  - [`src/app/ui/components/blocks/ProjectSettings/EditorModeToggle.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ProjectSettings/EditorModeToggle.tsx)
  - [`src/app/ui/components/blocks/ProjectSettings/FontSizeControl.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ProjectSettings/FontSizeControl.tsx)
  - [`src/app/ui/components/blocks/ProjectSettings/ZoomControl.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ProjectSettings/ZoomControl.tsx)
- Locale bootstrapping now uses the persisted app language on load and live locale changes no longer remount the whole app tree:
  - [`src/app/ui/i18n/i18nEntry.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/i18n/i18nEntry.tsx)
  - [`src/app/ui/i18n/loadLocale.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/i18n/loadLocale.tsx)

### In Progress

- `ProjectView` shell decomposition and layout migration are underway, but the screen is still a hybrid and still contains mock/exploratory surfaces.
- A bottom dock/panel proof of concept exists for problems/cloud status, but it is exploratory UI and not final behavior.
- The new primitive library is landed, but most production call sites have not been migrated yet.
- Settings localization is only partially audited. The locale plumbing works, but a later small pass should still wrap remaining hardcoded UI copy in translatable macros/components.
- Search behavior and UI are now app-owned, but still need follow-up polish on the new result-row replace UX and any remaining search tests.

### Still To Do

- Burn down remaining Mantine-backed screens and call sites incrementally.
- Migrate low-risk consumers onto the new primitives, especially:
  - [`src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx) visual tuning and interaction polish
- Replace Mantine layout components in route and composite screens.
- Remove Mantine packages from dependencies after verification.
- Audit and replace remaining `var(--mantine-...)` usages.
- Refresh generated/localized artifacts that still reference deleted Mantine-era files where that matters.

### Immediate Next Recommended Slices

1. Tackle the next visible Mantine-heavy composite that still matters in the new shell, most likely [`src/app/ui/components/blocks/Toolbar.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/Toolbar.tsx) or [`src/app/ui/components/blocks/ReferenceEditor.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ReferenceEditor.tsx), depending on which one you still intend to keep.
2. Remove Mantine packages from `package.json` once dependency-level verification is done.
3. Do a small cleanup pass over newly migrated settings/shell copy for full localization coverage.

## Migration Principles

1. Keep architecture stable.
   `src/core` stays UI-agnostic. Design system work lives in `src/app`.

2. Migrate by seam, not by page rewrite.
   Prefer replacing one primitive or infrastructure concern at a time, then updating consumers.

3. Coexistence is acceptable.
   Mantine and Base UI will coexist for a while. That is a feature of the migration plan, not a failure.

4. Own our tokens.
   Colors, spacing, radius, type, and component states should move into vanilla-extract contracts and local component styles.

5. Preserve behavior first.
   Unless explicitly approved, changes should be visual/infrastructural, not workflow or state-management changes.

6. Validate small.
   For each phase, run the smallest relevant check first, then broader checks only when the seam is stable.

## Proposed Workstreams

### 1. Foundation and Playground Landing

Create the minimum shared foundation in this branch so future migrations have a home.

- Bring over the style guide route as a dev-only route.
- Land the design-system token file and any required supporting CSS variables.
- Add Base UI dependency and any small supporting utilities needed by the primitives.
- Keep Mantine provider in place initially if removing it would expand scope.
- Avoid copying playground-only demo structure that does not help production migration.

Deliverable:

- A working `/style-guide` route in dev.
- A checked-in token contract that can be consumed by both new primitives and old Mantine-backed screens during transition.

### 2. Replace Notification Infrastructure

Notifications are a clean early seam because they are already wrapped behind local helpers.

- Replace Mantine notification plumbing in [`src/app/ui/components/primitives/Notifications.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/primitives/Notifications.tsx) with Base UI toast infrastructure.
- Update [`src/app/utils/createRouteHelpers.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/utils/createRouteHelpers.ts) to use a local notification type instead of Mantine’s `NotificationData`.
- Move app bootstrap from Mantine `Notifications` to app-owned toast provider/rendering.
- Preserve existing notification helper names where possible so call sites do not churn unnecessarily.

Why first:

- Small, well-contained surface area.
- Immediate reduction in direct Mantine dependency.
- Proves the pattern of replacing Mantine infrastructure with app-owned abstractions.

### 3. Land Primitive Library for New Usage

Bring in the primitives that are already reasonably formed in the playground, but do not force-call-site replacement yet.

Candidate primitives:

- `Button`
- `Kbd`
- `Select`
- `Switch`
- `Tabs`
- `ToggleGroup`
- `RadioGroup`
- `Slider`
- `EditorToolbar`

Rules for this phase:

- Preserve existing names and prop shapes where practical.
- Prefer thin compatibility wrappers when that reduces churn.
- Keep APIs intentionally small; do not attempt to clone Mantine’s entire surface area.
- Document known deltas in the style guide instead of hiding them.

### 4. Migrate Low-Risk Consumers

Move focused call sites that already align well with the new primitives.

Good early targets:

- [`src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx)
- [`src/app/ui/components/blocks/ReferencePicker.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ReferencePicker.tsx)
- Simple route-level actions like create/index flows
- Isolated settings controls that map well to `Switch`, `Slider`, `Tabs`, `ToggleGroup`

Avoid initially:

- Large composite editor screens
- Layout-heavy pages that rely on many Mantine layout primitives
- Areas where auth work has active churn

### 5. Replace Mantine Hooks and Context Seams

After primitive adoption starts, remove the less visible Mantine runtime dependencies.

- Replace `useDebouncedCallback`, `useDebouncedValue`, `useDisclosure`, `useClickOutside`, `useThrottledCallback`, and `useMediaQuery` with local hooks or smaller utilities.
- Rewrite [`src/app/ui/contexts/MediaQuery.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/contexts/MediaQuery.tsx) so it no longer depends on Mantine theme/color-scheme state.
- Establish app-owned color-scheme handling and breakpoint definitions.

This is where the migration stops being mostly cosmetic and starts removing framework glue. It should happen after the token layer and a few primitives are already stable.

### 6. Burn Down Mantine Layout and Styling Usage

Once local primitives and utilities exist, replace Mantine component usage in remaining screens.

Common categories:

- Layout primitives: `Group`, `Stack`, `Container`, `Paper`, `Center`, `Grid`
- Overlays: `Popover`, `Drawer`, `Tooltip`, `Portal`
- Form controls and buttons
- Typography helpers like `Text`, `Title`

Approach:

- Replace repeated patterns with app-owned layout/style helpers only when repetition justifies it.
- Do not recreate Mantine as an internal framework.
- Prefer explicit JSX + local CSS over building a 1:1 clone of `Group`/`Stack` semantics everywhere.

### 7. Remove Mantine Theme and Global CSS Dependence

When direct Mantine consumers are nearly gone:

- Delete Mantine CSS imports from the entrypoint.
- Remove `MantineProvider` if nothing else depends on it.
- Remove `mantineTheme.ts` and Mantine-derived theme variable shims.
- Replace remaining `var(--mantine-...)` usages with design-system variables or component-local tokens.

This should be one of the last steps, not one of the first.

### 8. Dependency Cleanup

Only after code usage is effectively gone:

- Remove `@mantine/core`
- Remove `@mantine/hooks`
- Remove `@mantine/notifications`
- Remove `@mantine/vanilla-extract`
- Remove Mantine-specific PostCSS support if no longer needed

## Suggested Phase Order

1. Foundation and style guide landing
2. Notifications migration
3. Primitive library landing
4. Low-risk consumer migrations
5. Hook/context replacement
6. Remaining screen and layout burn-down
7. Mantine provider/theme removal
8. Dependency cleanup

## First Concrete Milestone

The first milestone should be:

- Add Base UI dependency
- Land the design-system token contract
- Add the dev-only style guide route
- Land Base UI toast infrastructure
- Switch existing notification helpers to the new toast system

Why this milestone:

- It creates a durable foundation without forcing a full-screen rewrite.
- It reduces direct Mantine dependency immediately.
- It gives us a reviewable sandbox for future primitives.
- It keeps the scope compatible with ongoing auth work.

## Expected Behavior Changes

Behavior changes should be rare and explicit. The ones most likely to occur during migration are:

- Notification timing/stacking behavior as we move from Mantine notifications to Base UI toasts
- Small differences in keyboard or focus behavior for newly adopted primitives such as select, tabs, toggle groups, or action palettes

When behavior changes happen, they should be called out in PR descriptions and validated intentionally, not discovered accidentally.

## Risks

### 1. Hidden Mantine coupling through CSS vars

There are many `var(--mantine-...)` references across global/editor styles. Removing Mantine provider/theme too early will cause broad regressions.

Mitigation:

- Keep compatibility variables for a while.
- Replace token usage gradually.

### 2. Over-copying from the playground

The playground branch contains useful components, but also branch-specific drift and incomplete migration choices.

Mitigation:

- Cherry-pick concepts and files selectively.
- Integrate into this branch’s architecture instead of mirroring file moves blindly.

### 3. Recreating Mantine internally

If we replace Mantine with a large internal clone of generic layout primitives, we keep the abstraction cost without the dependency benefit.

Mitigation:

- Build only the primitives that express real product patterns.
- Use plain markup and local CSS where generic abstraction is not helping.

### 4. Large PRs that are hard to verify

This migration can become noisy quickly.

Mitigation:

- Keep PRs focused on a seam or a small set of consumers.
- Prefer infrastructure-first PRs followed by call-site migrations.

## Validation Strategy

For each migration step:

1. Verify the style guide or directly affected screen in dev.
2. Run the smallest relevant typecheck/test scope.
3. Only run broader checks when the seam is stable.

Typical validation sequence:

- `pnpm check`
- targeted unit tests where behavior changed
- `pnpm test:unit` when shared primitives or helpers change broadly

For visually sensitive changes, manual verification in both web and Tauri contexts is likely still required.

## Proposed Tracking Structure

Break the work into a parent effort with child tasks roughly like:

- Land Base UI dependency and style guide route
- Land design-system tokens and compatibility layer
- Replace notifications infrastructure
- Land primitive set from playground
- Migrate `ReferencePicker`
- Migrate `ActionPalette`
- Replace Mantine media query/theme hooks
- Replace remaining layout and overlay usage
- Remove Mantine provider/theme files
- Remove Mantine packages




## Burndown file tree

Status legend:

- `done`: off Mantine for current migration purposes
- `partial`: off Mantine or structurally migrated, but still needs design or follow-up cleanup
- `removed`: deleted as part of migration
- `todo`: still in burndown

Mantine-bearing `.tsx` burndown for this migration pass:

- `partial` [`src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/editor/plugins/ContextMenu/ActionPalette.tsx)
- `partial` [`src/app/domain/editor/plugins/ContextMenuPlugin.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/editor/plugins/ContextMenuPlugin.tsx)
- `done` [`src/app/domain/editor/plugins/LintTooltipPlugin.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/editor/plugins/LintTooltipPlugin.tsx)
- `done` [`src/app/domain/editor/plugins/VerseMarkerSuggestPlugin.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/domain/editor/plugins/VerseMarkerSuggestPlugin.tsx)
- `partial` [`src/app/entrypoint.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/entrypoint.tsx)
- `done` [`src/app/routes/$project.index.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/routes/$project.index.tsx)
- `todo` [`src/app/routes/$project.metadata.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/routes/$project.metadata.tsx)
- `done` [`src/app/routes/create.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/routes/create.tsx)
- `done` [`src/app/routes/index.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/routes/index.tsx)
- `todo` [`src/app/routes/playground.lazy.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/routes/playground.lazy.tsx)
- `done` [`src/app/ui/components/blocks/CloudProjectStatus.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/CloudProjectStatus.tsx)
- `done` [`src/app/ui/components/blocks/DiffModal/DiffModal.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/DiffModal/DiffModal.tsx)
- `done` [`src/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/DiffModal/DiffModalChapterView.tsx)
- `done` [`src/app/ui/components/blocks/DiffModal/DiffModalListView.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/DiffModal/DiffModalListView.tsx)
- `done` [`src/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/DiffModal/DiffViewerModal.tsx)
- `partial` [`src/app/ui/components/blocks/LintPopover.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/LintPopover.tsx) - legacy hover surface; lint issues now live in the dock
- `done` [`src/app/ui/components/blocks/MatchFormattingSuggestionsPanel.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/MatchFormattingSuggestionsPanel.tsx) - frontend removed; logic can be revisited for a future editor-mode flow
- `todo` [`src/app/ui/components/blocks/NestedEditor.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/NestedEditor.tsx)
- `done` [`src/app/ui/components/blocks/ProjectImportHub/ProjectImportHub.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ProjectImportHub/ProjectImportHub.tsx)
- `done` [`src/app/ui/components/blocks/ProjectRow.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ProjectRow.tsx)
- `done` [`src/app/ui/components/blocks/ProjectSwitcher/ProjectSwitcher.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ProjectSwitcher/ProjectSwitcher.tsx)
- `done` [`src/app/ui/components/blocks/ProjectSwitcher/projectSwitcher.css.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ProjectSwitcher/projectSwitcher.css.ts)
- `done` [`src/app/ui/components/views/sidebar/DesktopSidebar.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/views/sidebar/DesktopSidebar.tsx)
- `done` [`src/app/ui/styles/modules/projectImportHub.css.ts`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/styles/modules/projectImportHub.css.ts)
- `done` [`src/app/ui/components/blocks/ReferenceEditor.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/ReferenceEditor.tsx)
- `todo` [`src/app/ui/components/blocks/Search.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/Search.tsx)
- `todo` [`src/app/ui/components/blocks/SearchTrigger.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/SearchTrigger.tsx)
- `removed` [`src/app/ui/components/blocks/Toolbar.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/blocks/Toolbar.tsx) — replaced by EditorToolbar primitive
- `todo` [`src/app/ui/components/primitives/ActionIcon.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/primitives/ActionIcon.tsx)
- `done` [`src/app/ui/components/primitives/HistoryButton.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/primitives/HistoryButton.tsx)
- `todo` [`src/app/ui/components/primitives/ProjectList/ProjectList.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/components/primitives/ProjectList/ProjectList.tsx)
- `done` [`src/app/ui/hooks/useActions.tsx`](/Users/willkelly/Documents/Work/Code/scripture-editor-proto-2/src/app/ui/hooks/useActions.tsx)



## gonna follow the same pattern as settings for now:
- Find / replace
- Save Diff


## Into the dock (i.e we'd like to see text while this shows)
- lint
- cloud?
- previous versions
## Overlay (popover) vs dock? hmm: 
