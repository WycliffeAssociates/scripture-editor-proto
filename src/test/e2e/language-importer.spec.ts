import { expect, test } from "./fixtures.ts";

test.describe("LanguageApiImporter Component", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/");
        await page.getByText("New Project").click();
    });

    test("should search for language and display results", async ({ page }) => {
        await page
            .getByTestId("language-api-importer")
            .locator('input[type="text"]')
            .fill("english");

        await expect(
            page.getByTestId("language-api-importer").locator("ul"),
        ).toBeVisible();
    });

    test("should enable download button after selecting a repo", async ({
        page,
    }) => {
        await page
            .getByTestId("language-api-importer")
            .locator('input[type="text"]')
            .fill("spanish");

        await page.waitForTimeout(500);

        await page
            .getByTestId("language-api-importer")
            .locator("ul li")
            .first()
            .click();

        await expect(
            page.getByTestId("language-importer-download"),
        ).toBeEnabled();
    });

    test("should show loading state while fetching repos", async ({ page }) => {
        await page
            .getByTestId("language-api-importer")
            .locator('input[type="text"]')
            .fill("e");

        await expect(
            page
                .getByTestId("language-api-importer")
                .locator("text=Loading..."),
        ).toBeVisible({ timeout: 5000 });
    });

    test("should clear selection when clicking clear button", async ({
        page,
    }) => {
        await page
            .getByTestId("language-api-importer")
            .locator('input[type="text"]')
            .fill("spanish");

        await page.waitForTimeout(500);

        await page
            .getByTestId("language-api-importer")
            .locator("ul li")
            .first()
            .click();

        await page
            .getByTestId("language-api-importer")
            .locator('button[aria-label="Clear"]')
            .click();

        await expect(
            page
                .getByTestId("language-api-importer")
                .locator('input[type="text"]'),
        ).toHaveValue("");
    });
});
