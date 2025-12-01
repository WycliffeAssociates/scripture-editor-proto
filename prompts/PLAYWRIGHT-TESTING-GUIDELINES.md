# Playwright Testing Guidelines

## Locator Strategy

### ✅ Preferred Approaches
- **Always use `data-testid`** as primary locator method
- Use `getByTestId()` for direct element targeting
- Use `.first()`, `.last()`, `.nth()` for positioning when needed
- Chain locators to scope elements (e.g., `panel.getByTestId("button")`)

### ❌ Avoid
- **Never use CSS class locators** (`.mantine-*`, `.css-*`)
- Never use `getByText()` for non-English content
- Never use `waitForTimeout()` - rely on Playwright's auto-waiting

## Test Structure

### Navigation Tests
- Navigate using position-based selectors for language independence
- For accordions: click control → wait for panel → target buttons within panel
- Example pattern:
```typescript
const bookControl = getByTestId("book-control").first();
await bookControl.click();
const panel = bookControl.locator('..').getByRole('region');
await expect(panel).toBeVisible();
const chapterButton = panel.getByTestId("chapter-accordion-button").last();
await chapterButton.scrollIntoViewIfNeeded();
await chapterButton.click();
```

### Boundary Testing
- Test hidden spans vs visible buttons at boundaries
- Use `toBeAttached()`/`not.toBeAttached()` for non-existent elements
- Use `toBeVisible()`/`not.toBeVisible()` for visibility states

## Auto-Waiting
- Playwright automatically waits for elements to be ready
- No manual timeouts needed
- Trust auto-waiting for navigation, visibility, and state changes

## TestIds Convention
- Use kebab-case: `prev-chapter-button`, `book-control`
- Add `-hidden` suffix for hidden elements: `prev-chapter-button-hidden`
- Be specific but consistent across similar components

## Common Patterns
```typescript
// Good: Testid-based with positioning
await getByTestId("book-control").first().click();

// Bad: CSS class-based
await locator('.mantine-Accordion-control').first().click();

// Good: Scoped to parent container
const panel = bookControl.locator('..').getByRole('region');
await panel.getByTestId("chapter-button").last().click();

// Bad: Global search that finds hidden elements
await getByTestId("chapter-button").last().click();
```

## Key Principles
1. **Testid-first** - Always prefer semantic testids
2. **Language-agnostic** - Don't rely on text content
3. **No manual waits** - Trust Playwright's auto-waiting
4. **Scope properly** - Target elements within their containers
5. **Test boundaries** - Verify show/hide behavior at limits
