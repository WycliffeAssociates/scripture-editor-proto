import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);
export const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";

type MyFixtures = {
  editorPage: Page;
  editorWithTwoProjects: Page;
};

// Define custom fixture with proper typing
export const test = base.extend<MyFixtures>({
  editorPage: async ({ page }, use) => {
    // Go to home page
    await page.goto(BASE_URL);

    // Load the project from zip
    const resolvedPath = path.resolve(
      dirname,
      "../",
      "mockData",
      "llx_reg-master.zip",
    );
    await page.getByTestId("file-importer").setInputFiles(resolvedPath);

    // Wait for project to appear in list
    const projectList = page.getByTestId("project-list");
    await expect(projectList).toHaveCount(1);

    // Click on the project to navigate to editor
    await page.getByTestId("project-row-link").click();

    // Wait for navigation to complete (you might need to adjust this selector)
    // This assumes the editor page has some identifiable element

    await page
      .getByTestId(TESTING_IDS.mainEditorContainer)
      .waitFor({ state: "visible" });

    // Use the page in the test
    await use(page);
  },
  editorWithTwoProjects: async ({ page }, use) => {
    // Go to home page
    await page.goto(BASE_URL);

    // Load both projects
    const llxRegPath = path.resolve(
      dirname,
      "../",
      "mockData",
      "llx_reg-master.zip",
    );
    const enUlbPath = path.resolve(
      dirname,
      "../",
      "mockData",
      "en_ulb-master.zip",
    );

    // Load first project
    await page.getByTestId("file-importer").setInputFiles(llxRegPath);
    await expect(page.getByTestId("project-list")).toHaveCount(1);

    // Load second project
    await page.getByTestId("file-importer").setInputFiles(enUlbPath);
    await expect(page.getByTestId("project-list")).toHaveCount(2);

    await page.getByTestId("project-row-link").first().click();
    await page
      .getByTestId("lexical-editor-container")
      .waitFor({ state: "visible" });
    // Use the page in the test
    await use(page);
  },
});

export { expect };
