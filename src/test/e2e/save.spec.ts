// tests/save.spec.ts
import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";

test.describe("Save and Diff Functionality", () => {
  test("modifying text creates a diff, can be reverted, and saves persistently", async ({
    editorPage,
  }) => {
    const v1 = editorPage.getByText("Ai vola ni kawa i Jisu");
    await v1.click();
    await editorPage.keyboard.press("End");
    await editorPage.keyboard.type(" An addition ");

    await editorPage.waitForTimeout(1000);
    await editorPage.getByTestId("next-chapter-button").click();
    await editorPage.getByTestId("next-chapter-button").click();
    const chap3OriginalContent = await editorPage
      .getByRole("textbox", { name: "USFM Editor" })
      .textContent();
    const c3v1 = editorPage.getByText(
      "Ena gama moi KoJoni na dauveipapitaisotaki ea vunau roli ena vanua lala e Jiutia, ka kaya jiko.",
    );
    await c3v1.click();
    await editorPage.keyboard.press("End");
    await editorPage.keyboard.type(" Another addition ");
    await editorPage.waitForTimeout(1000);

    // 3. Open Review Modal
    const saveTrigger = editorPage.getByTestId(TESTING_IDS.save.trigger);
    await saveTrigger.click();

    // 4. Verify Modal and Diff Item
    const modal = editorPage.getByTestId(TESTING_IDS.save.modal);
    await expect(modal).toBeVisible();

    const diffItems = editorPage.getByTestId(TESTING_IDS.save.diffItem);
    await expect(diffItems).toHaveCount(2);

    // Verify specific content in the diff
    const diffHeader = diffItems
      .first()
      .getByTestId(TESTING_IDS.save.diffSidHeader);
    await expect(diffHeader).toHaveText("Maciu 1:1");

    const currentPanel = diffItems
      .nth(0)
      .getByTestId(`${TESTING_IDS.save.diffCurrentPre}-current`);
    await expect(currentPanel).toContainText("An addition");

    const goToFirstChapterAgain = diffItems
      .nth(0)
      .getByTestId(`${TESTING_IDS.save.goToChapterButton}`);
    await goToFirstChapterAgain.click();

    // assert we went to mat one by checking that the reference picker is on mat one
    const referencePicker = editorPage.getByTestId("reference-picker");
    await expect(referencePicker).toHaveAttribute(
      "data-test-current-chapter",
      "1",
    );

    // open the modal back up
    await saveTrigger.click();

    // 5. Test Revert Logic
    const revertButton = diffItems
      .nth(1)
      .getByTestId(TESTING_IDS.save.revertButton);
    await revertButton.click();

    // Modal should ideally close or list should empty.
    // Based on hook logic, if list is empty, modal might stay open with "No changes" or close.
    // Let's check if the specific diff item is gone.
    await expect(diffItems).toHaveCount(1);

    // Close modal manually if it's still open (click outside or close button - not defined in IDs, so we press Escape)
    await editorPage.keyboard.press("Escape");

    // go back to chapter 3
    await editorPage.getByTestId("next-chapter-button").click();
    await editorPage.getByTestId("next-chapter-button").click();

    // Verify editor content is reverted
    const revertedContent = await editorPage
      .getByRole("textbox", { name: "USFM Editor" })
      .textContent();
    expect(revertedContent).toBe(chap3OriginalContent);

    // Open modal again
    await saveTrigger.click();
    await expect(diffItems).toHaveCount(1);

    // Click Save All
    const saveAllBtn = editorPage.getByTestId(TESTING_IDS.save.saveAllButton);
    await saveAllBtn.click();
    // wait til there are 0 diff items
    await expect(diffItems).toHaveCount(0);

    // Expect successful save notification or modal close
    // For this test, we verify persistence by reloading
    await editorPage.reload();

    // make sure to navigae to chapter 1
    await editorPage.getByTestId("prev-chapter-button").click();
    await editorPage.getByTestId("prev-chapter-button").click();

    // Verify content persists after reload
    const textBox = await editorPage
      .getByRole("textbox", { name: "USFM Editor" })
      .textContent();
    const hasAnAddition = textBox?.includes("An addition");
    expect(hasAnAddition).toBe(true);
  });
});
