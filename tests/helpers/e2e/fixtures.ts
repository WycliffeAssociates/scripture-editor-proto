import { test as base, expect, type Page } from "@playwright/test";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { WEB_STORAGE_NAMESPACE_KEY } from "@/web/persistence/storageNamespace.ts";

import {
  gotoCreate,
  gotoHomeAndExpectProjectCount,
  importZipProject,
  MOCK_ZIPS,
} from "./project-import.ts";

type MyFixtures = {
  editorPage: Page;
  editorWithTwoProjects: Page;
  storageNamespace: string;
};

// Define custom fixture with proper typing
export const test = base.extend<MyFixtures>({
  storageNamespace: async ({}, use, testInfo) => {
    const titleSlug = testInfo.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    await use(
      `pw-${testInfo.parallelIndex}-${testInfo.retry}-${testInfo.testId.slice(-8)}-${titleSlug || "test"}`,
    );
  },
  page: async ({ page, storageNamespace }, use) => {
    await page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: WEB_STORAGE_NAMESPACE_KEY, value: storageNamespace },
    );
    await use(page);
  },
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

    await page.getByRole("link", { name: "Open project llx_reg" }).click();
    await page
      .getByTestId(TESTING_IDS.mainEditorContainer)
      .waitFor({ state: "visible" });
    await use(page);
  },
});

export { expect };
