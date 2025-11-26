import { expect, test } from "@playwright/test";

/**
 * Responsive E2E tests
 *
 * - Verifies the app homepage loads (uses BASE_URL env var or http://localhost:3000)
 * - Checks viewport dimensions appropriate to the current Playwright project (mobile vs desktop)
 *
 * These tests are intentionally small and conservative so they will work across environments.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";

test.describe("responsive checks", () => {
  test("homepage loads and returns OK response", async ({ page }) => {
    const response = await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
    });
    // If the server isn't running, response may be null. Assert we at least got a response.
    expect(response).not.toBeNull();
    if (response) {
      expect(response.ok()).toBeTruthy();
    }

    // Ensure document finished loading and page has a (possibly empty) title string
    await page.waitForLoadState("load");
    const title = await page.title();
    expect(typeof title).toBe("string");
  });

  test("viewport size matches expected mobile / desktop profile", async ({
    page,
  }) => {
    // Ensure page context is ready; some devices apply viewport at new page creation.
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    // Playwright exposes configured viewport via page.viewportSize()
    const viewport = page.viewportSize() || { width: 0, height: 0 };

    // Use the current project's name to infer whether this is a mobile project.
    const projectName = test.info().project?.name ?? "";

    const isMobileProject =
      /mobile/i.test(projectName) || /iphone|pixel/i.test(projectName);

    if (isMobileProject) {
      // Mobile devices typically have narrow widths. Allow a reasonable upper bound.
      expect(viewport.width).toBeGreaterThan(0);
      expect(viewport.width).toBeLessThanOrEqual(900);
      // Height should be taller than width for phones in portrait most of the time.
      expect(viewport.height).toBeGreaterThanOrEqual(viewport.width);
    } else {
      // Desktop projects should have larger widths (commonly 1024+).
      expect(viewport.width).toBeGreaterThanOrEqual(1024);
      expect(viewport.height).toBeGreaterThanOrEqual(600);
    }
  });
});
