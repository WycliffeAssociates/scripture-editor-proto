import type { Locator, Page } from "@playwright/test";

import { TESTING_IDS } from "@/app/data/constants.ts";

import {
  appendToEditor,
  moveChapter,
  openSaveReview,
} from "../helpers/e2e/editor-navigation.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";

function changedRow(page: Page, text: string): Locator {
  return page
    .locator("article[data-compare-unit-id]")
    .filter({ hasText: text });
}

test.describe("Save and Option C review", () => {
  test("unsaved review defaults to Working and stages Saved without mutating the editor", async ({
    editorPage,
  }) => {
    await appendToEditor(editorPage, " An addition ");
    await moveChapter(editorPage, "next", 2);
    await appendToEditor(editorPage, " Another addition ");

    await openSaveReview(editorPage);

    const firstChange = changedRow(editorPage, "An addition");
    const laterChange = changedRow(editorPage, "Another addition");
    await expect(firstChange).toHaveCount(1);
    await expect(laterChange).toHaveCount(1);
    await expect(
      firstChange.getByRole("radio", { name: "Working copy" }),
    ).toBeChecked();
    await expect(
      laterChange.getByRole("radio", { name: "Working copy" }),
    ).toBeChecked();

    await laterChange.getByRole("radio", { name: "Saved copy" }).check();
    await expect(
      laterChange.getByRole("radio", { name: "Saved copy" }),
    ).toBeChecked();

    // A decision only changes the frozen projection. Opening the corresponding
    // editor location exits review without rewriting the dirty buffer.
    await laterChange.getByRole("button", { name: "Open in editor" }).click();
    await expect(
      editorPage.getByTestId(TESTING_IDS.save.modal),
    ).not.toBeVisible();
    await expect(
      editorPage.getByTestId(TESTING_IDS.currentLocation),
    ).toContainText("3");
    await expect(
      editorPage.getByRole("textbox", { name: "USFM Editor" }),
    ).toContainText("Another addition");
  });

  test("Apply persists the exact staged result and replaces the diff with a receipt", async ({
    editorPage,
  }) => {
    await appendToEditor(editorPage, " Discard this addition ");
    await openSaveReview(editorPage);

    const change = changedRow(editorPage, "Discard this addition");
    await expect(change).toHaveCount(1);
    await change.getByRole("radio", { name: "Saved copy" }).check();

    const apply = editorPage.getByRole("button", { name: "Apply result" });
    await expect(apply).toBeEnabled();
    await apply.click();

    await expect(editorPage.getByRole("status")).toContainText(
      "Changes applied",
    );
    await expect(changedRow(editorPage, "Discard this addition")).toHaveCount(
      0,
    );

    await editorPage.getByRole("button", { name: "Close" }).click();
    await editorPage.reload();
    await expect(
      editorPage.getByRole("textbox", { name: "USFM Editor" }),
    ).not.toContainText("Discard this addition");
    await openSaveReview(editorPage);
    await expect(changedRow(editorPage, "Discard this addition")).toHaveCount(
      0,
    );
  });

  test("default Working result persists after Apply and reload", async ({
    editorPage,
  }) => {
    await appendToEditor(editorPage, " Persisted addition ");
    await openSaveReview(editorPage);

    const change = changedRow(editorPage, "Persisted addition");
    await expect(change).toHaveCount(1);
    await expect(
      change.getByRole("radio", { name: "Working copy" }),
    ).toBeChecked();

    await editorPage.getByRole("button", { name: "Apply result" }).click();
    await expect(editorPage.getByRole("status")).toContainText(
      "Changes applied",
    );
    await editorPage.getByRole("button", { name: "Close" }).click();

    await editorPage.reload();
    await expect(
      editorPage.getByRole("textbox", { name: "USFM Editor" }),
    ).toContainText("Persisted addition");
  });

  test("chapter view shows the full comparison and reading result preview", async ({
    editorPage,
  }) => {
    await appendToEditor(editorPage, " chapter preview change ");
    await openSaveReview(editorPage);

    const modal = editorPage.getByTestId(TESTING_IDS.save.modal);
    await modal.getByRole("button", { name: "Chapter", exact: true }).click();
    const chapter = editorPage.getByRole("region", { name: /Maciu 1/ });
    await expect(chapter).toBeVisible();
    await expect(chapter).toContainText("chapter preview change");

    await modal.getByRole("button", { name: "Preview" }).click();
    await expect(chapter).not.toBeVisible();
    const preview = editorPage.getByRole("region", { name: "Result preview" });
    await expect(preview).toContainText("Maciu 1");
    await expect(preview).toContainText("chapter preview change");

    await editorPage.getByRole("button", { name: "Close preview" }).click();
    await expect(chapter).toBeVisible();
  });
});
