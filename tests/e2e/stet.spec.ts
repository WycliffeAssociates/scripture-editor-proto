import { TESTING_IDS } from "@/app/data/constants.ts";

import { openSearchPanel } from "../helpers/e2e/editor.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";

// Catalog is ~1.7MB baked JSON served from /public; give the first load room.
const CATALOG_TIMEOUT = 25_000;

async function openStet(page: Parameters<typeof openSearchPanel>[0]) {
  await page.getByTestId(TESTING_IDS.stet.toolbarTrigger).click();
  await expect(page.getByTestId(TESTING_IDS.stet.panel)).toBeVisible();
}

test.describe("Spiritual Terms Evaluation", () => {
  test("opens from the sidebar, selects a term, and renders GL/HL rows", async ({
    editorPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "STET is verified in desktop Chromium.",
    );

    await openStet(editorPage);

    // A term is auto-selected and its coverage line + a result row appear once
    // the catalog resolves.
    await expect(editorPage.getByTestId(TESTING_IDS.stet.coverage)).toBeVisible(
      {
        timeout: CATALOG_TIMEOUT,
      },
    );
    await expect(
      editorPage.getByTestId(TESTING_IDS.stet.resultItem).first(),
    ).toBeVisible({ timeout: CATALOG_TIMEOUT });

    // The pinned reference provenance is shown (header + per-row source label).
    // Scope to visible matches: the reference-guide <select> also carries an
    // <option> with this exact text, which Playwright treats as hidden, so an
    // unscoped .first() would resolve to the option and fail visibility.
    await expect(
      editorPage
        .getByText("English ULB (en_ulb)")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });

  test("is reachable from the toolbar on a small screen", async ({
    editorPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "Mobile Chrome",
      "Mobile entry point check.",
    );

    // The only STET trigger is the toolbar action, which must render on mobile.
    await editorPage.getByTestId(TESTING_IDS.stet.toolbarTrigger).click();
    await expect(editorPage.getByTestId(TESTING_IDS.stet.panel)).toBeVisible();
    await expect(editorPage.getByTestId(TESTING_IDS.stet.coverage)).toBeVisible(
      {
        timeout: CATALOG_TIMEOUT,
      },
    );
  });

  test("is mutually exclusive with Find", async ({ editorPage }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "STET is verified in desktop Chromium.",
    );

    // Find first, then STET → Find is gone.
    await openSearchPanel(editorPage);
    await expect(editorPage.getByTestId(TESTING_IDS.searchInput)).toBeVisible();
    await openStet(editorPage);
    await expect(editorPage.getByTestId(TESTING_IDS.searchInput)).toHaveCount(
      0,
    );

    // STET open, then Find → STET is gone.
    await openSearchPanel(editorPage);
    await expect(editorPage.getByTestId(TESTING_IDS.stet.panel)).toHaveCount(0);
    await expect(editorPage.getByTestId(TESTING_IDS.searchInput)).toBeVisible();
  });

  test("navigating a row docks STET and reveals the editor", async ({
    editorPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "STET is verified in desktop Chromium.",
    );

    await openStet(editorPage);
    const firstRow = editorPage
      .getByTestId(TESTING_IDS.stet.resultItem)
      .first();
    await expect(firstRow).toBeVisible({ timeout: CATALOG_TIMEOUT });

    // Click the row's navigate arrow → editor is revealed (STET docks, so the
    // toolbar/location label disappears) and stays mounted; STET remains open.
    await firstRow.getByRole("button", { name: /Navigate to/ }).click();
    await expect(
      editorPage.getByTestId(TESTING_IDS.currentLocation),
    ).toHaveCount(0);
    await expect(
      editorPage.getByTestId(TESTING_IDS.mainEditorContainer),
    ).toBeVisible();
    await expect(editorPage.getByTestId(TESTING_IDS.stet.panel)).toBeVisible();
  });

  test("docks beside the editor and undocks", async ({
    editorPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "STET is verified in desktop Chromium.",
    );

    await openStet(editorPage);
    await expect(
      editorPage.getByTestId(TESTING_IDS.stet.resultItem).first(),
    ).toBeVisible({ timeout: CATALOG_TIMEOUT });

    // Dock: the toolbar (and its location label) is hidden, STET stays open,
    // and the editor container remains mounted throughout.
    await editorPage.getByTestId(TESTING_IDS.stet.dockToggle).click();
    await expect(
      editorPage.getByTestId(TESTING_IDS.currentLocation),
    ).toHaveCount(0);
    await expect(editorPage.getByTestId(TESTING_IDS.stet.panel)).toBeVisible();
    await expect(
      editorPage.getByTestId(TESTING_IDS.mainEditorContainer),
    ).toBeVisible();

    // Undock: the toolbar returns.
    await editorPage.getByTestId(TESTING_IDS.stet.dockToggle).click();
    await expect(
      editorPage.getByTestId(TESTING_IDS.currentLocation),
    ).toBeVisible();
  });
});
