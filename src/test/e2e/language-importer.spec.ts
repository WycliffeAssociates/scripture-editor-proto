import { TESTING_IDS } from "@/app/data/constants.ts";
import { BASE_URL, expect, test } from "./fixtures.ts";

test.describe("LanguageApiImporter Component", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
    });

    test("should search for language and display results", async ({ page }) => {
        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator('input[type="text"]')
            .fill("english");

        await expect(
            page.getByTestId(TESTING_IDS.language.apiImporter).locator("ul"),
        ).toBeVisible();
    });

    test("should enable download button after selecting a repo", async ({
        page,
    }) => {
        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator('input[type="text"]')
            .fill("spanish");

        await page.waitForTimeout(500);

        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator("ul li")
            .nth(2)
            .click();

        await expect(
            page.getByTestId(TESTING_IDS.language.importerDownload),
        ).toBeEnabled();
    });

    test("should show loading state while fetching repos", async ({ page }) => {
        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator('input[type="text"]')
            .fill("e");

        await expect(
            page
                .getByTestId(TESTING_IDS.language.apiImporter)
                .locator("text=Loading..."),
        ).toBeVisible({ timeout: 5000 });
    });

    test("should clear selection when clicking clear button", async ({
        page,
    }) => {
        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator('input[type="text"]')
            .fill("spanish");

        await page.waitForTimeout(500);

        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator("ul li")
            .nth(2)
            .click();

        await page.getByTestId(TESTING_IDS.language.importerClear).click();

        await expect(
            page
                .getByTestId(TESTING_IDS.language.apiImporter)
                .locator('input[type="text"]'),
        ).toHaveValue("");
    });
});
