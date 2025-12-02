// tests/save.spec.ts
import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";

test.describe("Save and Diff Functionality", () => {
  test("modifying text creates a diff, can be reverted, and saves persistently", async ({
    editorPage,
  }) => {
    // 1. Setup: Navigate to a known location (e.g., GEN 1)
    // Assuming the editor loads in Genesis 1 or we navigate there
    const referencePicker = editorPage.getByTestId("reference-picker");
    await referencePicker.click();
    await editorPage.getByTestId("book-control").first().click(); // Open Matthew
    // the 0th chap is intro material.
    await editorPage.getByTestId("chapter-accordion-button").nth(1).click(); // Click Ch 1

    // 2. Modify content: Find a verse and change its text
    // Utilizing the knowledge that the editor renders elements with data-sid
    const verseOneLocator = editorPage.locator('[data-sid="MAT 1:1"]');
    await expect(verseOneLocator).toBeVisible();

    // Click into the verse and type
    await verseOneLocator.click();
    await editorPage.keyboard.press("End");
    await editorPage.keyboard.type(" - TEST CHANGE");

    // 3. Open Review Modal
    const saveTrigger = editorPage.getByTestId(TESTING_IDS.save.trigger);
    await saveTrigger.click();

    // 4. Verify Modal and Diff Item
    const modal = editorPage.getByTestId(TESTING_IDS.save.modal);
    await expect(modal).toBeVisible();

    const diffItems = editorPage.getByTestId(TESTING_IDS.save.diffItem);
    await expect(diffItems).toHaveCount(1);

    // Verify specific content in the diff
    const diffHeader = diffItems
      .first()
      .getByTestId(TESTING_IDS.save.diffSidHeader);
    await expect(diffHeader).toHaveText("GEN 1:1");

    const currentPanel = diffItems
      .first()
      .getByTestId(TESTING_IDS.save.diffCurrentPanel);
    await expect(currentPanel).toContainText(" - TEST CHANGE");

    // 5. Test Revert Logic
    const revertButton = diffItems
      .first()
      .getByTestId(TESTING_IDS.save.revertButton);
    await revertButton.click();

    // Modal should ideally close or list should empty.
    // Based on hook logic, if list is empty, modal might stay open with "No changes" or close.
    // Let's check if the specific diff item is gone.
    await expect(diffItems).toHaveCount(0);

    // Close modal manually if it's still open (click outside or close button - not defined in IDs, so we press Escape)
    await editorPage.keyboard.press("Escape");

    // Verify editor content is reverted
    await expect(verseOneLocator).not.toContainText(" - TEST CHANGE");

    // 6. Test Save Logic
    // Re-apply the change
    await verseOneLocator.click();
    await editorPage.keyboard.press("End");
    await editorPage.keyboard.type(" - SAVED CHANGE");

    // Open modal again
    await saveTrigger.click();
    await expect(diffItems).toHaveCount(1);

    // Click Save All
    const saveAllBtn = editorPage.getByTestId(TESTING_IDS.save.saveAllButton);
    await saveAllBtn.click();

    // Expect successful save notification or modal close
    // For this test, we verify persistence by reloading
    await editorPage.reload();

    // Verify content persists after reload
    await expect(verseOneLocator).toContainText(" - SAVED CHANGE");
  });

  test("navigation from diff modal works", async ({ editorPage }) => {
    // Navigate to GEN 1
    const referencePicker = editorPage.getByTestId("reference-picker");
    await referencePicker.click();
    await editorPage.getByTestId("book-control").first().click();
    await editorPage.getByTestId("chapter-accordion-button").first().click();

    // Make a change in GEN 1:1
    const verseOneLocator = editorPage.locator('[data-sid="GEN 1:1"]');
    await verseOneLocator.click();
    await editorPage.keyboard.type("Navigation Test");

    // Navigate away to a different chapter (GEN 2)
    const nextBtn = editorPage.getByTestId("next-chapter-button");
    await nextBtn.click();

    // Verify we are in Chapter 2 (Reference picker update)
    await expect(referencePicker).toHaveAttribute(
      "data-test-current-chapter",
      "2",
    );

    // Open Save Modal (The change in Ch 1 should still be there)
    await editorPage.getByTestId(TESTING_IDS.save.trigger).click();

    // Find the diff item
    const diffItem = editorPage.getByTestId(TESTING_IDS.save.diffItem).first();
    await expect(diffItem).toBeVisible();
    await expect(
      diffItem.getByTestId(TESTING_IDS.save.diffSidHeader),
    ).toHaveText("GEN 1:1");

    // Click "Switch to this chapter" (Go To)
    const goToBtn = diffItem.getByTestId(TESTING_IDS.save.goToChapterButton);
    await goToBtn.click();

    // Modal should close automatically on navigation (based on `scrollToClickedRef` logic in DiffModal)
    await expect(
      editorPage.getByTestId(TESTING_IDS.save.modal),
    ).not.toBeVisible();

    // Verify we are back in Chapter 1
    await expect(referencePicker).toHaveAttribute(
      "data-test-current-chapter",
      "1",
    );

    // Verify the element is highlighted (Logic: background-color yellow)
    // We wait a moment for the scroll/highlight logic
    await expect(verseOneLocator).toHaveCSS(
      "background-color",
      "rgb(255, 255, 0)",
    ); // Yellow
  });
});
