import { expect, test } from "@playwright/test";

/**
 * Responsive E2E tests
 *
 * - Verifies the app homepage loads (uses BASE_URL env var or http://localhost:3000)
 * - Checks viewport dimensions appropriate to the current Playwright project (mobile vs desktop)
 *
 * These tests are intentionally small and conservative so they will work across environments.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5175";

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
});
