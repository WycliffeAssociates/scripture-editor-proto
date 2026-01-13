---
name: testing
description: Guidelines for writing high-confidence, implementation-agnostic tests (Testing Trophy philosophy).
license: MIT
compatibility: opencode
metadata:
  philosophy: "Implementation Detail Free"
  priority: "Integration > Unit"
---

## Core Philosophy - Confidence over Coverage
We do **not** chase 100% coverage. We chase **Confidence**.
*   **Avoid Implementation Details:** Do not test internal state, private methods, or specific class names. Test the *observable output* (rendered DOM, disk IO, return values).
*   **The User is King:** Tests should resemble how the software is used.
    *   *Unit:* Input -> Output.
    *   *Integration:* Component + Providers + DOM interaction.
    *   *E2E:* Full app flow.

## When to Write a Test
*   **High Risk:** Data corruption, Save logic, Authentication, Core Parsers. (MUST TEST).
*   **Medium Risk:** Complex UI interactions, Form submissions. (SHOULD TEST).
*   **Low Risk:** CSS tweaks, Static content, "Button color". (SKIP).

## How to Write Tests (React/Dovetail)

### 1. Integration (Preferred)
Use `vitest` with `testing-library`. Render the component with its necessary providers.
*   ✅ **Do:** `userEvent.click(screen.getByRole('button', { name: /save/i }))`
*   ✅ **Do:** `expect(await screen.findByText(/saved successfully/i)).toBeInTheDocument()`
*   ❌ **Don't:** `wrapper.instance().saveData()`
*   ❌ **Don't:** `expect(component.state.isSaved).toBe(true)`

### 2. E2E (Playwright)
Use for critical flows (Save to Disk, App Startup).
*   Use `data-testid` only when semantic queries (Role, Label, Text) fail.
*   Do not mock the file system if checking persistence; use a temporary directory.

### 3. Unit (Pure Logic)
Use for complex algorithmic helpers (e.g., `parseUSFM`).
*   Input -> Output.
*   Do not mock internal helpers unless they are external IO.

## The "Refactor Friendly" Rule
If I rename a function or refactor a component's internal structure, **the test should still pass**. If the test breaks but the app works, the test was bad.