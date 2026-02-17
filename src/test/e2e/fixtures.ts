import { test as base, expect, type Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";
import {
    BASE_URL,
    gotoCreate,
    gotoHomeAndExpectProjectCount,
    importZipProject,
    MOCK_ZIPS,
} from "./helpers/project-import.ts";

export { BASE_URL };

type MyFixtures = {
    editorPage: Page;
    editorWithTwoProjects: Page;
};

// Define custom fixture with proper typing
export const test = base.extend<MyFixtures>({
    editorPage: async ({ page }, use) => {
        await gotoCreate(page);
        await importZipProject(page, MOCK_ZIPS.llxReg, 15_000);
        await gotoHomeAndExpectProjectCount(page, 1, 10_000);

        await page.getByTestId(TESTING_IDS.project.rowLink).click();
        await page
            .getByTestId(TESTING_IDS.mainEditorContainer)
            .waitFor({ state: "visible" });
        await use(page);
    },
    editorWithTwoProjects: async ({ page }, use) => {
        await gotoCreate(page);
        await importZipProject(page, MOCK_ZIPS.llxReg, 15_000);
        await gotoHomeAndExpectProjectCount(page, 1, 15_000);

        await gotoCreate(page);
        await importZipProject(page, MOCK_ZIPS.enUlb, 15_000);
        await gotoHomeAndExpectProjectCount(page, 2, 15_000);

        await page.getByTestId(TESTING_IDS.project.rowLink).first().click();
        await page
            .getByTestId(TESTING_IDS.mainEditorContainer)
            .waitFor({ state: "visible" });
        await use(page);
    },
});

export { expect };
