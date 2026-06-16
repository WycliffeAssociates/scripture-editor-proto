import { TESTING_IDS } from "@/app/data/constants.ts";

import { expect, test } from "../helpers/e2e/fixtures.ts";
import {
  gotoCreate,
  gotoHomeAndExpectProjectCount,
  importDirectoryProject,
  importZipProject,
  MOCK_DIRS,
  MOCK_ZIPS,
} from "../helpers/e2e/project-import.ts";

test.describe("Project Creation Workflows", () => {
  test("create route renders import surfaces", async ({ page }) => {
    await gotoCreate(page);
    await expect(page.getByTestId(TESTING_IDS.import.importer)).toBeAttached();
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
    await page.getByTestId(TESTING_IDS.project.nameInput).fill(renamedProject);
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
        .getByRole("dialog")
        .filter({ hasText: "File imported successfully!" }),
    ).toBeVisible();

    // The success toast exposes "Open project" as a button (no longer a link).
    const openProjectAction = page.getByRole("button", {
      name: "Open project",
    });
    await expect(openProjectAction).toBeVisible();
    await openProjectAction.click();

    await expect(page).toHaveURL(/\/llx_reg/);
  });

  test("directory import and language importer interactions", async ({
    page,
  }) => {
    // The importer discovers projects from the live consolidated-repos API.
    // Stub it so the search is deterministic (and doesn't depend on the
    // network / the catalog actually containing Spanish entries today).
    await page.route(/consolidated-repos/, (route) =>
      route.fulfill({
        json: {
          vw_consolidated_repos: [
            {
              language_ietf: "es-419",
              language_name: "español",
              language_english_name: "Spanish",
              repo_url: "https://content.example/es_glt",
              repo_name: "es_glt",
              username: "wa",
              title: "Spanish GLT",
            },
            {
              language_ietf: "es",
              language_name: "español",
              language_english_name: "Spanish",
              repo_url: "https://content.example/es_gst",
              repo_name: "es_gst",
              username: "wa",
              title: "Spanish GST",
            },
          ],
        },
      }),
    );

    await gotoCreate(page);
    await importDirectoryProject(page, MOCK_DIRS.llxReg);
    await gotoHomeAndExpectProjectCount(page, 1);

    await gotoCreate(page);
    const importer = page.getByTestId(TESTING_IDS.language.apiImporter);
    const input = importer.locator('input[type="text"]');

    await input.fill("spanish");
    // Results render as virtualized `div` rows (not a table); each row carries
    // a download button. Its presence + enabled state is the actionable signal.
    const downloadButton = importer
      .getByTestId(TESTING_IDS.language.importerDownload)
      .first();
    await expect(downloadButton).toBeVisible({ timeout: 15_000 });
    await expect(downloadButton).toBeEnabled();

    const clearButton = page.getByTestId(TESTING_IDS.language.importerClear);
    await expect(clearButton).toBeVisible();
    await clearButton.click();
    await expect(input).toHaveValue("");
  });
});
