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


## Tauri tests
- Due to much of the functionality being idempotent in tauri/web, most tests have targeted but, however:
- Tauri offers support for both unit and integration testing utilizing a mock runtime. Under the mock runtime, native webview libraries are not executed. When writing your frontend tests, having a “fake” Tauri environment to simulate windows or intercept IPC calls is common, so-called mocking. The @tauri-apps/api/mocks module provides some helpful tools to make this easier for you:
- Tauri also provides support for end-to-end testing support utilizing the WebDriver protocol. Both desktop and mobile work with it, except for **macOS which does not provide a desktop WebDriver client**. See more about WebDriver support here.
- THEREFORE, we usually just e2e test via vitest integrations and playwright e2e tests. 





## The "Refactor Friendly" Rule
If I rename a function or refactor a component's internal structure, **the test should still pass**. If the test breaks but the app works, the test was bad.

## Dovetail-Specific Patterns

### Lexical Editor Testing
Use the `testEditor.ts` helper to create headless Lexical editors for integration tests:
```typescript
import { createTestEditor, getEditorTextContent } from "@/test/helpers/testEditor.ts";

const editor = createTestEditor(usfmContent);
const text = getEditorTextContent(editor);
```
- Lexical tests may use internal APIs (`$getSelection`, `$getRoot`) - this is acceptable since there's no DOM in headless mode
- Test observable behavior (cursor moves to editable node) not internal state

### E2E Test Stability
Use `TEST_ID_GENERATORS` from `@/app/data/constants.ts` for dynamic test IDs:
```typescript
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";

// Static IDs
page.getByTestId(TESTING_IDS.editor.container)

// Dynamic IDs for list items, etc.
page.getByTestId(TEST_ID_GENERATORS.project.listItem("project-id"))
```
The `constants.test.ts` file tests these generators - don't delete it, it ensures E2E stability.