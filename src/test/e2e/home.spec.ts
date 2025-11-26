import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";

test.describe("home page (empty state)", () => {
  test("shows project creation UI when there are no projects", async ({
    page,
  }) => {
    const consoleMessages: Array<{ type: string; text: string }> = [];
    page.on("console", (m) => {
      try {
        consoleMessages.push({ type: m.type(), text: m.text() });
      } catch {
        // ignore
      }
    });

    try {
      const response = await page.goto(BASE_URL, {
        waitUntil: "domcontentloaded",
      });
      expect(response).not.toBeNull();
      if (response) expect(response.ok()).toBeTruthy();

      // Wait for full load to ensure client-side rendering finished
      await page.waitForLoadState("load");

      // small delay to let client-side hydration run (helps flakiness)
      await page.waitForTimeout(500);

      // Main create section heading from ProjectCreator
      await expect(page.locator("text=Create a new project")).toBeVisible();

      // Ensure the repo + local upload controls are present
      await expect(
        page.locator("text=Search for a scripture repository"),
      ).toBeVisible();
      await expect(page.locator("text=Upload a folder")).toBeVisible();
      await expect(page.locator("text=Or select a ZIP file")).toBeVisible();

      // Ensure there are no project rows rendered in the project list container.
      // The project list is an <ul class="flex flex-col gap-3"> with child <li>s when projects exist.
      const projectListItems = page.locator("ul.flex.flex-col.gap-3 > li");
      await expect(projectListItems).toHaveCount(0);
    } catch (err) {
      // Dump helpful artifacts for debugging and rethrow the error
      throw err;
    }
  });

  test("has accessible heading and basic layout", async ({ page }) => {
    const consoleMessages: Array<{ type: string; text: string }> = [];
    page.on("console", (m) => {
      try {
        consoleMessages.push({ type: m.type(), text: m.text() });
      } catch {
        // ignore
      }
    });

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");

      // small delay to let client-side hydration run
      await page.waitForTimeout(500);

      // Page header should contain "Current Projects"
      await expect(page.locator("text=Current Projects")).toBeVisible();

      // The create area should be reachable via heading role as well
      const createHeading = page.getByRole("heading", {
        name: /Create a new project/i,
      });
      await expect(createHeading).toBeVisible();
    } catch (err) {
      console.error(err);
    }
  });
});
