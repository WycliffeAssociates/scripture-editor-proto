import type { Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { BASE_URL, expect, test } from "./fixtures.ts";

async function openProjectDrawer(page: Page) {
    await page.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();
}

test.describe("Project Drawer Workflows", () => {
    test("lists projects and supports export + open actions", async ({
        editorPage: page,
    }) => {
        await openProjectDrawer(page);

        const projectsList = page.getByTestId(
            TESTING_IDS.appDrawer.projectsList,
        );
        await expect(projectsList).toBeVisible();

        const exportButton = projectsList
            .getByTestId(TESTING_IDS.appDrawer.itemExport)
            .first();
        await expect(exportButton).toBeVisible();
        const downloadPromise = page.waitForEvent("download");
        await exportButton.click();
        const download = await downloadPromise;
        expect(download).toBeTruthy();

        await projectsList
            .getByTestId(TESTING_IDS.project.listItemButton)
            .first()
            .click();
        await expect(
            page.getByTestId(TESTING_IDS.mainEditorContainer),
        ).toBeVisible();
        expect(page.url()).toContain("/llx_reg");
    });

    test("navigates to create route from new project action", async ({
        editorPage: page,
    }) => {
        await openProjectDrawer(page);
        await expect(page.getByText("New Project")).toBeVisible();
        await page.getByTestId(TESTING_IDS.appDrawer.newProject).click();
        expect(page.url()).toBe(`${BASE_URL}/create`);
    });

    test("handles multiple projects in drawer", async ({
        editorWithTwoProjects: page,
    }) => {
        await openProjectDrawer(page);

        const projectsList = page.getByTestId(
            TESTING_IDS.appDrawer.projectsList,
        );
        const projectItems = await projectsList
            .locator('[data-testid^="project-list-item-"]')
            .all();
        expect(projectItems.length).toBeGreaterThan(1);

        await expect(
            projectsList
                .getByTestId(TESTING_IDS.project.listItemButton)
                .first(),
        ).toBeVisible();
        await expect(
            projectsList.getByTestId(TESTING_IDS.appDrawer.itemExport).first(),
        ).toBeVisible();
    });
});
