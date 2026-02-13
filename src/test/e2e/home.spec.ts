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

        await expect(page.locator("text=Projects")).toBeVisible();
        await expect(page.locator("text=No projects yet")).toBeVisible();
        await expect(
            page.locator("text=Create your first project"),
        ).toBeVisible();

        await expect(page.getByTestId(TESTING_IDS.project.list)).toHaveCount(0);
    });

    test("has accessible heading and basic layout", async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load");
        await page.waitForTimeout(500);

        await expect(page.locator("text=Projects")).toBeVisible();

        await expect(
            page.getByRole("heading", { name: /^Projects$/i }),
        ).toBeVisible();
    });
});

test.describe("home page - load projects", () => {
    test("loads project from zip", async ({ page }) => {
        await page.goto(`${BASE_URL}/create`, {
            waitUntil: "domcontentloaded",
        });
        const resolvedPath = path.resolve(
            dirname,
            "../",
            "mockData",
            "llx_reg-master.zip",
        );
        await page
            .getByTestId(TESTING_IDS.import.importer)
            .setInputFiles(resolvedPath);

        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
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
        await page.goto(`${BASE_URL}/create`, {
            waitUntil: "domcontentloaded",
        });
        const resolvedPath = path.resolve(
            dirname,
            "../",
            "mockData",
            "llx_reg-master.zip",
        );
        await page
            .getByTestId(TESTING_IDS.import.importer)
            .setInputFiles(resolvedPath);

        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
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
        await page.goto(`${BASE_URL}/create`, {
            waitUntil: "domcontentloaded",
        });

        const resolvedPath = path.resolve(
            dirname,
            "../",
            "mockData",
            "llx_reg/",
        );
        await page
            .getByTestId(TESTING_IDS.import.dirImporter)
            .setInputFiles(resolvedPath);

        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
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
        await page.goto(`${BASE_URL}/create`, {
            waitUntil: "domcontentloaded",
        });
    });

    test("searches for language and displays results", async ({ page }) => {
        const importer = page.getByTestId(TESTING_IDS.language.apiImporter);
        await importer.locator('input[type="text"]').fill("english");

        await expect(
            importer
                .locator("tbody")
                .getByRole("button", { name: "Add" })
                .first(),
        ).toBeVisible({ timeout: 15_000 });
    });

    test("enables download button after selecting a repo", async ({ page }) => {
        const importer = page.getByTestId(TESTING_IDS.language.apiImporter);
        await importer.locator('input[type="text"]').fill("spanish");

        const firstDataRow = importer
            .locator("tbody tr")
            .filter({
                has: importer.getByRole("button", { name: "Add" }),
            })
            .first();
        await expect(firstDataRow).toBeVisible({ timeout: 15_000 });
        await firstDataRow.click();

        await expect(
            page.getByTestId(TESTING_IDS.language.importerDownload),
        ).toBeEnabled();
    });

    test("shows loading state while fetching repos", async ({ page }) => {
        const importer = page.getByTestId(TESTING_IDS.language.apiImporter);
        await importer.locator('input[type="text"]').fill("e");

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
        const firstDataRow = importer
            .locator("tbody tr")
            .filter({
                has: importer.getByRole("button", { name: "Add" }),
            })
            .first();
        await expect(firstDataRow).toBeVisible({ timeout: 15_000 });
        await firstDataRow.click();

        // Wait for clear button to be visible (appears after selection)
        const clearButton = page.getByTestId(
            TESTING_IDS.language.importerClear,
        );
        await expect(clearButton).toBeVisible();
        await clearButton.click();

        await expect(importer.locator('input[type="text"]')).toHaveValue("");
    });
});
