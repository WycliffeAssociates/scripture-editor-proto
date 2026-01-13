import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const dirname = path.dirname(__filename); // get the name of the directory

test.describe("home page (empty state)", () => {
    test("shows project creation UI when there are no projects", async ({
        page,
    }) => {
        const response = await page.goto(BASE_URL, {
            waitUntil: "domcontentloaded",
        });
        expect(response).not.toBeNull();
        if (response) expect(response.ok()).toBeTruthy();

        await page.waitForLoadState("load");
        await page.waitForTimeout(500);

        await expect(page.locator("text=Create a new project")).toBeVisible();
        await expect(
            page.locator("text=Search for a scripture repository"),
        ).toBeVisible();
        await expect(page.locator("text=Upload a folder")).toBeVisible();
        await expect(page.locator("text=Or select a ZIP file")).toBeVisible();

        const projectListItems = page.locator("ul.flex.flex-col.gap-3 > li");
        await expect(projectListItems).toHaveCount(0);
    });

    test("has accessible heading and basic layout", async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load");
        await page.waitForTimeout(500);

        await expect(page.locator("text=Current Projects")).toBeVisible();

        const createHeading = page.getByRole("heading", {
            name: /Create a new project/i,
        });
        await expect(createHeading).toBeVisible();
    });
});

test.describe("home page - load projects", () => {
    test("loads project from zip", async ({ page }) => {
        await page.goto(BASE_URL);
        const resolvedPath = path.resolve(
            dirname,
            "../",
            "mockData",
            "llx_reg-master.zip",
        );
        await page
            .getByTestId(TESTING_IDS.import.importer)
            .setInputFiles(resolvedPath);
        const projectList = page.getByTestId(TESTING_IDS.project.list);
        await expect(projectList).toHaveCount(1);
        await page.reload({
            waitUntil: "domcontentloaded",
        }); //should still be there
        await expect(projectList).toHaveCount(1);
        expect(
            await page
                .getByTestId(TEST_ID_GENERATORS.projectListGroup("Lauan"))
                .textContent(),
        ).toBe("Lauan");
    });
    test("delete Project removes from ui", async ({ page }) => {
        await page.goto(BASE_URL);
        const resolvedPath = path.resolve(
            dirname,
            "../",
            "mockData",
            "llx_reg-master.zip",
        );
        await page
            .getByTestId(TESTING_IDS.import.importer)
            .setInputFiles(resolvedPath);
        const projectList = page.getByTestId(TESTING_IDS.project.list);
        await expect(projectList).toHaveCount(1);
        await page
            .getByRole("listitem")
            .filter({ hasText: "Lauan" })
            .getByTestId(TESTING_IDS.project.editButton)
            .click();
        await page
            .getByTestId(TESTING_IDS.project.nameInput)
            .fill("Lauan - New Name");
        await page.getByTestId(TESTING_IDS.project.saveName).click();
        const newName = page.getByTestId("Lauan - New Name");
        await expect(newName).toHaveText("Lauan - New Name");

        await page.reload({
            waitUntil: "domcontentloaded",
        }); //should have changed name
        await expect(newName).toHaveText("Lauan - New Name");
        await page.getByTestId(TESTING_IDS.project.delete).click();
        const confirmBtn = page.getByTestId(TESTING_IDS.project.deleteConfirm);
        await confirmBtn.click();
        await expect(projectList).toHaveCount(0);
    });
    test("loads project from unzipped folder", async ({ page }) => {
        await page.goto(BASE_URL);

        const resolvedPath = path.resolve(
            dirname,
            "../",
            "mockData",
            "llx_reg/",
        );
        await page
            .getByTestId(TESTING_IDS.import.dirImporter)
            .setInputFiles(resolvedPath);
        const projectList = page.getByTestId(TESTING_IDS.project.list);
        await expect(projectList).toHaveCount(1);
    });
});
test("home page localization works", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByTestId(TESTING_IDS.settings.languageSelector).click();
    await page.getByRole("option", { name: "Español" }).click();
    const label = page.getByTestId(TESTING_IDS.settings.languageSelectorLabel);
    await expect(label).toHaveText("Localización de la interfaz");
});

test.describe("Language API Importer", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
    });

    test("searches for language and displays results", async ({ page }) => {
        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator('input[type="text"]')
            .fill("english");

        await expect(
            page.getByTestId(TESTING_IDS.language.apiImporter).locator("ul"),
        ).toBeVisible();
    });

    test("enables download button after selecting a repo", async ({ page }) => {
        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator('input[type="text"]')
            .fill("spanish");

        await page
            .getByTestId(TESTING_IDS.language.apiImporter)
            .locator("ul li")
            .nth(2)
            .click();

        await expect(
            page.getByTestId(TESTING_IDS.language.importerDownload),
        ).toBeEnabled();
    });

    test("shows loading state while fetching repos", async ({ page }) => {
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

    test("clears selection when clicking clear button", async ({ page }) => {
        const importer = page.getByTestId(TESTING_IDS.language.apiImporter);
        await importer.locator('input[type="text"]').fill("spanish");

        // Wait for results to appear before clicking
        await expect(importer.locator("ul li").nth(2)).toBeVisible();
        await importer.locator("ul li").nth(2).click();

        // Wait for clear button to be visible (appears after selection)
        const clearButton = page.getByTestId(
            TESTING_IDS.language.importerClear,
        );
        await expect(clearButton).toBeVisible();
        await clearButton.click();

        await expect(importer.locator('input[type="text"]')).toHaveValue("");
    });
});
