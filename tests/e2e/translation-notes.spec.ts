import { TESTING_IDS } from "@/app/data/constants.ts";

import { expect, test } from "../helpers/e2e/fixtures.ts";
import {
  gotoCreate,
  importDirectoryProject,
  MOCK_DIRS,
} from "../helpers/e2e/project-import.ts";
import { selectReferenceProject } from "../helpers/e2e/reference.ts";

test.describe("Translation Notes import verification", () => {
  test("web import surfaces progress and the packed TN resource is usable in the reference panel", async ({
    editorPage: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "TN import verification is only stable in Chromium.",
    );

    testInfo.setTimeout(120_000);

    await gotoCreate(page);
    await importDirectoryProject(page, MOCK_DIRS.enTnCondensed, 120_000);

    await page.goto("/llx_reg", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId(TESTING_IDS.mainEditorContainer),
    ).toBeVisible();

    // Open the reference pane and pick the imported TN resource. It is
    // surfaced as an on-device resource under whatever displayName the
    // metadata provides (no longer guaranteed to contain "Translation Notes").
    await selectReferenceProject(page);

    // The user-visible contract is that the TN resource is available and
    // renders into the reference column. A translationNotes resource mounts
    // the dedicated notes pane (not the scripture ref editor), so assert that
    // pane attaches.
    await expect(page.getByTestId(TESTING_IDS.refNotesContainer)).toBeAttached({
      timeout: 30_000,
    });
  });
});
