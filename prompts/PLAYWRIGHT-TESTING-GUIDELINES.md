Playwright Testing Guidelines
Locator Strategy
✅ Preferred

Use data-testid for all targeting
This ensures stable, language-independent selectors.

Use page.getByTestId(id) whenever possible.

Use positional helpers when needed:

.first()

.last()

.nth(i)

Scope elements using chained locators:

const panel = editorPage.getByTestId("chapter-panel");
await panel.getByTestId("chapter-button").click();


Prefer locator expectations (await expect(locator).toBeVisible()) which trigger auto-waiting.

❌ Avoid

CSS class selectors (.mantine-*, .css-*)

getByText() for app logic (internationalization breaks tests)

Global unscoped queries (page.getByTestId("chapter-button").last() without narrowing)

waitForTimeout() or manual delays

locator.all(), locator.count() for readiness checks (they do not auto-wait)

Auto-Waiting (Critical Rule)
What auto-waits

Playwright automatically waits for:

actions: click, fill, type, press

locator expectations: toBeVisible, toHaveText, toBeAttached, etc.

navigation events: page loads, redirects

element readiness: attached → visible → stable

What does NOT auto-wait

These return instant snapshots of the DOM:

locator.count()

locator.all()

locator.elementHandles()

locator.nth(i).elementHandle()

If the UI is still rendering, these may return 0 or empty arrays even if elements appear moments later.

Rule:

Never use .count() or .all() to determine whether the UI has finished updating. Use locator expectations instead.

Examples that do wait:

await expect(results.first()).toBeVisible(); // waits for ≥1
await expect(results.nth(5)).toBeVisible(); // waits for ≥6

Test Structure
Navigation & Interaction

Always interact using testid-based locators.

Auto-waiting guarantees stable behavior without timeouts.

Example:

await editorPage.getByTestId("reference-picker").click();

await editorPage.getByTestId("book-control").last().click();
await editorPage.getByTestId("chapter-accordion-button").last().click();

Boundary Testing (show/hide logic)

Use attachment for existence and visibility for on-screen state:

await expect(editorPage.getByTestId("next-chapter-button-hidden"))
  .toBeAttached();     // element exists in DOM

await expect(editorPage.getByTestId("next-chapter-button"))
  .not.toBeAttached(); // element does not exist


Rules:

Use toBeAttached() / not.toBeAttached() for "exists in DOM".

Use toBeVisible() / not.toBeVisible() for "is shown to user".

Auto-Waiting Patterns
Correct
const results = page.getByTestId("search-result");

await expect(results.first()).toBeVisible();  // waits until at least one result exists

// now counting is safe
const count = await results.count();
expect(count).toBeGreaterThan(5);

Incorrect
const results = page.getByTestId("search-result");
const count = await results.count(); // ❌ snapshot: may be 0 even if results load soon

TestId Conventions

Kebab-case always
search-result-item
prev-chapter-button

Use -hidden suffix for logical hidden states
next-chapter-button-hidden

Use explicit names that describe function, not appearance

Common Good Patterns
Scoped interactions
const panel = editorPage.getByTestId("accordion-panel");
await panel.getByTestId("chapter-button").last().click();

Avoid global collisions
// ❌ Might pick a hidden button elsewhere
await page.getByTestId("chapter-button").last().click();

Visibility & readiness
await expect(page.getByTestId("search-input")).toBeVisible();
await page.getByTestId("search-input").fill("vola");

const results = page.getByTestId("search-result-item");
await expect(results.nth(5)).toBeVisible();  // waits for ≥6 results

Key Principles (Summary)

Prefer testids always for stable and language-independent locators.

Never manually wait – rely entirely on Playwright’s auto-waiting.

Use expectations on locators, not .count() or .all(), to wait for UI updates.

Scope carefully—query inside panels or containers whenever possible.

Test boundary logic with correct expectations (attached, visible).