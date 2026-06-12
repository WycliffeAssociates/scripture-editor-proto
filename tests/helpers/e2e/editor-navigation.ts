import { expect, type Page } from "@playwright/test";

import { TESTING_IDS } from "@/app/data/constants.ts";

export async function appendToEditor(page: Page, text: string) {
  const editor = page.getByRole("textbox", { name: "USFM Editor" });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

export async function moveChapter(
  page: Page,
  direction: "next" | "prev",
  count = 1,
) {
  const name = direction === "next" ? "Next chapter" : "Previous chapter";
  for (let i = 0; i < count; i++) {
    await page.getByRole("button", { name }).click();
  }
}

export async function openSaveReview(page: Page) {
  // The save toolbar button is reachable via its aria-label; the modal
  // (overlayShell) carries the save.modal testid. Previously this helper
  // pointed at a save.trigger testid that's no longer wired in source.
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByTestId(TESTING_IDS.save.modal)).toBeVisible();
}
