import { TESTING_IDS } from "@/app/data/constants.ts";
import { BASE_URL, expect, test } from "./fixtures.ts";

test.describe("ProjectList Component", () => {
  test("opens app drawer and displays project list", async ({
    editorPage: page,
  }) => {
    // Open the app drawer
    await page.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Verify Projects accordion is open by default
    await expect(page.getByText("Projects")).toBeVisible();

    // Verify project list items are present
    await expect(
      page.getByTestId(TESTING_IDS.appDrawer.projectsList),
    ).toBeVisible();
  });

  test("navigates to project when clicking project item button", async ({
    editorPage: page,
  }) => {
    // Open the app drawer
    await page.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Click on the project button
    await page.getByTestId("project-list-item-button").first().click();

    // Verify navigation occurred - should be on the project page
    await expect(
      page.getByTestId(TESTING_IDS.mainEditorContainer),
    ).toBeVisible();

    // Verify URL contains the project name
    expect(page.url()).toContain("/llx_reg");
  });

  test("shows export button when opener is available", async ({
    editorPage: page,
  }) => {
    // Open the app drawer
    await page.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Verify export button is present
    await expect(
      page.getByTestId("project-list-item-export").first(),
    ).toBeVisible();
  });

  test("triggers export when clicking download icon", async ({
    editorPage: page,
  }) => {
    // Open the app drawer
    await page.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();
    const downloadPromise = page.waitForEvent("download");

    // Click the export button
    await page.getByTestId(TESTING_IDS.appDrawer.itemExport).first().click();
    const download = await downloadPromise;
    download.suggestedFilename();
    expect(download).toBeTruthy();
    // Note: The actual download might not work in test environment due to file system restrictions,
    // but we can verify the click action and that no errors occur
    // In a real implementation, you might need to mock the opener.export function
  });

  test("shows new project link at bottom of list", async ({
    editorPage: page,
  }) => {
    // Open the app drawer
    await page.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Verify "New Project" link is present
    await expect(page.getByText("New Project")).toBeVisible();

    // Click the new project link
    await page.getByTestId(TESTING_IDS.appDrawer.newProject).click();

    // Should navigate to home page
    expect(page.url()).toBe(`${BASE_URL}/`);
  });

  test("handles multiple projects correctly", async ({
    editorWithTwoProjects: page,
  }) => {
    // This test assumes multiple projects are loaded
    // For now, we'll test with whatever projects are available

    // Open the app drawer
    await page.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Count project items
    const projectItems = page.locator('[data-testid^="project-list-item-"]');
    const count = await projectItems.count();

    // Should have at least one project
    expect(count).toBeGreaterThan(1);

    // Each project should have a button
    const projectButtons = page.getByTestId("project-list-item-button");
    await expect(projectButtons.first()).toBeVisible();

    // Each project should have an export button
    const exportButtons = page.getByTestId("project-list-item-export");
    await expect(exportButtons.first()).toBeVisible();
  });
});
