# 003. Vanilla Extract and Mantine

## Status
Accepted

## Context
We need a styling solution that is type-safe, performant, and compatible with both light/dark modes and user-defined font settings.

## Decision
1.  **Mantine v7:** For core UI primitives (Modals, Buttons, Inputs).
2.  **Vanilla Extract:** For all custom component styling. This generates static CSS at build time (zero runtime overhead) and provides TypeScript safety for themes.
3.  **Tailwind CSS:** Restricted to utility usage (layout/spacing) where creating a dedicated class is overkill.

## Consequences
*   Developers must define styles in `*.css.ts` files adjacent to components.
*   We avoid runtime CSS-in-JS (like Emotion or Styled Components) to improve editor performance.