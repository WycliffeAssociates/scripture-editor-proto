# UI Refresh Plan (Design Audit + Proposal)

## Context
Dovetail is a local‑first scripture editor used by largely non‑technical users. The UI must feel calm, predictable, and “obvious” without training. This refresh is primarily about **hierarchy, consistency, and reducing cognitive load**, while preserving all existing functionality.

Inputs reviewed:
- `design-prompt/prompt.md` (audit protocol + scope rules)
- `design-prompt/image.png` (reference for table/search hierarchy)
- Live app (captured screenshots across desktop/tablet/mobile for Home, Project, Search, Save/Diff, and Dark Mode)
- Current stack: Mantine + Vanilla Extract, with some Tailwind usage and Mantine default vars mixed in.

## High-Level Diagnosis
The app is functional, but visually noisy and inconsistent:
- **Mixed styling paradigms** (Tailwind + Mantine defaults + Vanilla Extract) create “almost the same” components across screens.
- **Controls sometimes compete with content** (notably Search panel + Home/Create Project block).
- **Location awareness is weak** (book/chapter is subtle unless you stare at the reference picker).
- **Dark-mode interaction states are inconsistent**, especially hover/selected states on dark surfaces.

## Design Principles (for this refresh)
- Content first: scripture + results should dominate; controls should support quietly.
- One consistent interaction model: hover/focus/active states match across the app.
- Fewer “surfaces”: reduce borders/shadows; rely on spacing + typography for structure.
- Mobile and desktop should feel intentionally designed, not resized.

---

# DESIGN AUDIT RESULTS

## Overall Assessment
Good foundation (Mantine + theme vars are in place), but the UI currently reads as a prototype: inconsistent spacing/typography, heavy control chrome, and a lack of a coherent component hierarchy across screens.

---

## PHASE 1 — Critical (Hierarchy, usability, consistency)

### Home / Projects
- Home mixes “Current Projects” and “Create Project” in one route, causing clutter and decision fatigue.
  - **Proposal**: Home becomes a clean Projects list route. “New Project” becomes a dedicated route. (This is a navigation change but not a new feature.)

### Toolbar / Navigation clarity
- Toolbar is crowded with icon actions; primary tasks are not clearly prioritized.
  - **Proposal**: Re‑group actions by importance. Promote “Review & Save” and “Search”, move secondary items to overflow.
- Current book/chapter is not obvious enough for quick orientation.
  - **Proposal**: Add a persistent, high-contrast book/chapter indicator (desktop + mobile) separate from the picker control.

### Search panel hierarchy (major UX complaint)
- Search controls take too much attention; results don’t feel like the primary object.
  - **Proposal**: “Search Projects” reference image style:
    - Search field prominent in header.
    - Options tucked under an “Options” disclosure.
    - Results list becomes the dominant region with strong row affordance.

### Dark-mode interaction consistency
- Hover/focus states over dark surfaces are inconsistent.
  - **Proposal**: define shared interactive tokens for hover/active/focus on both light/dark surfaces and use them everywhere.

**Review (Phase 1 priority rationale)**: These changes directly address current user pain: clutter on home, difficulty staying oriented in scripture navigation, and search usability.

---

## PHASE 2 — Refinement (Spacing, typography, component system)

### Design tokens + system documentation
- There is a Mantine theme, but no single “DESIGN_SYSTEM.md” defining tokens/usage rules.
  - **Proposal**: add a `product-docs/DESIGN_SYSTEM.md` that documents:
    - color palette + semantic roles (bg/surface/text/border/accent/danger/warn/success)
    - typography scale
    - spacing scale
    - radii, shadows (minimal)
    - focus ring spec (accessibility)

### Page layout & density
- Introduce a consistent page shell (max widths, gutters, vertical rhythm).
- Reduce incidental borders/shadows and rely more on spacing + type hierarchy.

### Component consistency
- Standardize: buttons, action icons, chips/badges, list rows, empty states, drawers, and modals.

**Review (Phase 2 sequencing)**: Once Phase 1 establishes better hierarchy, Phase 2 makes the system consistent and easier to maintain.

---

## PHASE 3 — Polish (Motion, micro-interactions, states)
- Micro-interactions: subtle hover transitions, pressed states, focus rings.
- Empty/loading/error states for Search, Projects list, Save/Diff.
- Notification styling + placement so toasts don’t obscure scripture content.
- Fine-grained alignment pass (“off by 1–2px” cleanup).

**Review (Phase 3 impact)**: This is what makes it feel “inevitable” and premium without changing behavior.

---

# DESIGN_SYSTEM (.md) UPDATES REQUIRED
Proposed additions (must be approved before implementation):
- Semantic surfaces: `appBg`, `surface1`, `surface2`, `surfaceInset`
- Semantic text: `textPrimary`, `textSecondary`, `textMuted`
- Semantic borders: `borderSubtle`, `borderStrong`
- Semantic interactive states: `hoverBg`, `activeBg`, `focusRing`
- “List row” spec (height, padding, hover, selected)
- “Toolbar” spec (height, grouping, icon sizing, overflow behavior)

---

# Implementation Notes (No Work Without Approval)
This refresh requires some non-visual refactors that are still UX-driven:
- **Move “New Project” to a dedicated route** (navigation change).
- **Remove Tailwind** gradually (convert Tailwind usage to Vanilla Extract first; remove deps/plugins last).

Next step: approve Phase 1 scope (screens/components) so implementation can proceed surgically.

