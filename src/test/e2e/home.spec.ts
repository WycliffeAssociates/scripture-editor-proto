import { expect, test } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";
import {
    gotoCreate,
    gotoHomeAndExpectProjectCount,
    importDirectoryProject,
    importZipProject,
    MOCK_DIRS,
    MOCK_ZIPS,
} from "./helpers/project-import.ts";

test.describe("Project Creation Workflows", () => {
    test("create route renders import surfaces", async ({ page }) => {
        await gotoCreate(page);
        await expect(
            page.getByTestId(TESTING_IDS.import.importer),
        ).toBeAttached();
        await expect(
            page.getByTestId(TESTING_IDS.import.dirImporter),
        ).toBeAttached();
        await expect(
            page.getByTestId(TESTING_IDS.language.apiImporter),
        ).toBeVisible();
    });

    test("zip import lifecycle: import, rename, delete", async ({ page }) => {
        await gotoCreate(page);
        await importZipProject(page, MOCK_ZIPS.llxReg);
        await gotoHomeAndExpectProjectCount(page, 1);
        const projectList = page.getByTestId(TESTING_IDS.project.list);
        const initialProjectCount = await projectList.count();
        expect(initialProjectCount).toBeGreaterThan(0);

        const renamedProject = "E2E - Renamed Project";
        await page.getByTestId(TESTING_IDS.project.editButton).first().click();
        await page
            .getByTestId(TESTING_IDS.project.nameInput)
            .fill(renamedProject);
        await page.getByTestId(TESTING_IDS.project.saveName).click();
        await expect(
            page.getByRole("link", {
                name: new RegExp(`open project ${renamedProject}`, "i"),
            }),
        ).toBeVisible();

        await page.getByTestId(TESTING_IDS.project.delete).first().click();
        await page.getByTestId(TESTING_IDS.project.deleteConfirm).click();
        await expect(projectList).toHaveCount(initialProjectCount - 1);
    });

    test("zip import keeps user on create and offers open-project link in toast", async ({
        page,
    }) => {
        await gotoCreate(page);
        await importZipProject(page, MOCK_ZIPS.llxReg);

        await expect(page).toHaveURL(/\/create$/);
        await expect(
            page
                .getByRole("alert")
                .filter({ hasText: "File imported successfully!" }),
        ).toBeVisible();
        await expect(
            page
                .getByRole("alert")
                .filter({ hasText: "File imported successfully!" }),
        ).toContainText("File imported successfully!");

        const openProjectLink = page.getByRole("link", {
            name: "Open project",
        });
        await expect(openProjectLink).toBeVisible();
        await openProjectLink.click();

        await expect(page).toHaveURL(/\/llx_reg/);
    });

    test("directory import and language importer interactions", async ({
        page,
    }) => {
        await gotoCreate(page);
        await importDirectoryProject(page, MOCK_DIRS.llxReg);
        await gotoHomeAndExpectProjectCount(page, 1);

        await gotoCreate(page);
        const importer = page.getByTestId(TESTING_IDS.language.apiImporter);
        const input = importer.locator('input[type="text"]');

        await input.fill("spanish");
        const firstDataRow = importer.locator("tbody tr").first();
        await expect(firstDataRow).toBeVisible({ timeout: 15_000 });
        await firstDataRow.click();

        await expect(firstDataRow.getByRole("button")).toBeEnabled();

        const clearButton = page.getByTestId(
            TESTING_IDS.language.importerClear,
        );
        await expect(clearButton).toBeVisible();
        await clearButton.click();
        await expect(input).toHaveValue("");
    });
});
