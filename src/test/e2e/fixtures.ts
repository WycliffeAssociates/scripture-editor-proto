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
    editorPage: async ({ page, browserName }, use) => {
        const importTimeout = browserName === "firefox" ? 45_000 : 15_000;
        const projectCountTimeout = browserName === "firefox" ? 30_000 : 10_000;

        await gotoCreate(page);
        await importZipProject(page, MOCK_ZIPS.llxReg, importTimeout);
        await gotoHomeAndExpectProjectCount(page, 1, projectCountTimeout);

        await page.getByTestId(TESTING_IDS.project.rowLink).click();
        await page
            .getByTestId(TESTING_IDS.mainEditorContainer)
            .waitFor({ state: "visible" });
        await use(page);
    },
    editorWithTwoProjects: async ({ page, browserName }, use) => {
        const importTimeout = browserName === "firefox" ? 45_000 : 15_000;
        const projectCountTimeout = browserName === "firefox" ? 30_000 : 15_000;

        await gotoCreate(page);
        await importZipProject(page, MOCK_ZIPS.llxReg, importTimeout);
        await gotoHomeAndExpectProjectCount(page, 1, projectCountTimeout);

        await gotoCreate(page);
        await importZipProject(page, MOCK_ZIPS.enUlb, importTimeout);
        await gotoHomeAndExpectProjectCount(page, 2, projectCountTimeout);

        await page.getByTestId(TESTING_IDS.project.rowLink).first().click();
        await page
            .getByTestId(TESTING_IDS.mainEditorContainer)
            .waitFor({ state: "visible" });
        await use(page);
    },
});

export { expect };
