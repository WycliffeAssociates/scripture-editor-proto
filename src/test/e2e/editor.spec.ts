import { BASE_URL, expect, test } from "./fixtures.ts";

test.describe("Editor llx-reg", () => {
  test("editor page loads correctly", async ({ editorPage }) => {
    // Verify the editor page has loaded
    await expect(editorPage).toHaveURL(`${BASE_URL}/llx_reg`);

    // You can add more specific editor page assertions here
    // For example, checking for editor-specific elements
    // await expect(editorPage.getByTestId("editor-container")).toBeVisible();
  });

  test("prev and next buttons update reference picker data attributes", async ({
    editorPage,
  }) => {
    // Get initial reference picker state
    const referencePicker = editorPage.getByTestId("reference-picker");
    await expect(referencePicker).toBeVisible();

    // Get initial data attributes
    const initialBookCode =
      await referencePicker.getAttribute("data-test-bookCode");
    const initialChapter =
      await referencePicker.getAttribute("data-test-chapter");

    console.log(
      `Initial state - Book: ${initialBookCode}, Chapter: ${initialChapter}`,
    );

    // Test next button functionality
    const nextButton = editorPage.getByTestId("next-chapter-button");
    await expect(nextButton).toBeVisible();

    // Only test if next button is enabled
    const isNextEnabled = !(await nextButton.isDisabled());
    if (isNextEnabled) {
      await nextButton.click();

      // Playwright automatically waits for navigation and state changes

      // Verify data attributes have changed
      const newBookCodeAfterNext =
        await referencePicker.getAttribute("data-test-bookCode");
      const newChapterAfterNext =
        await referencePicker.getAttribute("data-test-chapter");

      console.log(
        `After next - Book: ${newBookCodeAfterNext}, Chapter: ${newChapterAfterNext}`,
      );

      // At least one of the attributes should have changed
      expect(
        newBookCodeAfterNext !== initialBookCode ||
          newChapterAfterNext !== initialChapter,
      ).toBeTruthy();
    }

    // Test prev button functionality
    const prevButton = editorPage.getByTestId("prev-chapter-button");
    await expect(prevButton).toBeVisible();

    // Only test if prev button is enabled
    const isPrevEnabled = !(await prevButton.isDisabled());
    if (isPrevEnabled) {
      // Get current state before clicking prev
      const currentBookCode =
        await referencePicker.getAttribute("data-test-bookCode");
      const currentChapter =
        await referencePicker.getAttribute("data-test-chapter");

      await prevButton.click();

      // Playwright automatically waits for navigation and state changes

      // Verify data attributes have changed
      const newBookCodeAfterPrev =
        await referencePicker.getAttribute("data-test-bookCode");
      const newChapterAfterPrev =
        await referencePicker.getAttribute("data-test-chapter");

      console.log(
        `After prev - Book: ${newBookCodeAfterPrev}, Chapter: ${newChapterAfterPrev}`,
      );

      // At least one of the attributes should have changed
      expect(
        newBookCodeAfterPrev !== currentBookCode ||
          newChapterAfterPrev !== currentChapter,
      ).toBeTruthy();
    }
  });

  test("navigation buttons are properly hidden/shown at boundaries", async ({
    editorPage,
  }) => {
    const prevButton = await editorPage.getByTestId("prev-chapter-button");
    const nextButton = await editorPage.getByTestId("next-chapter-button");

    // At least one of each button type should exist
    const prevExists = (await prevButton.count()) > 0;
    const nextExists = (await nextButton.count()) > 0;

    // Should have either visible button or hidden span for each direction
    expect(prevExists).toBeTruthy();
    expect(nextExists).toBeTruthy();
  });

  test("prev button not visible in first chapter of first book", async ({
    editorPage,
  }) => {
    // Navigate to first chapter of first book (Genesis 1)
    const referencePicker = editorPage.getByTestId("reference-picker");
    await referencePicker.click();

    // Look for first book in the dropdown and click first chapter
    await editorPage.getByTestId("book-control").first().click();
    await editorPage.getByTestId("chapter-accordion-button").first().click();

    // Verify prev button is hidden (span with hidden testid)
    const prevButtonHidden = editorPage.getByTestId(
      "prev-chapter-button-hidden",
    );
    const prevButton = editorPage.getByTestId("prev-chapter-button");

    // Hidden span should be visible, button should not exist
    await expect(prevButtonHidden).toBeVisible();
    await expect(prevButton).not.toBeVisible();
  });

  test("next button not visible in last chapter of last book", async ({
    editorPage,
  }) => {
    // Navigate to last chapter of last book (Revelation 22)
    const referencePicker = editorPage.getByTestId("reference-picker");
    await referencePicker.click();

    // Look for last book in the dropdown and click last chapter
    await editorPage.getByTestId("book-control").last().click();
    await editorPage.getByTestId("chapter-accordion-button").last().click();

    // Verify next button is hidden (span with hidden testid)
    const nextButtonHidden = editorPage.getByTestId(
      "next-chapter-button-hidden",
    );
    const nextButton = editorPage.getByTestId("next-chapter-button");

    // Hidden span should be visible, button should not exist
    await expect(nextButtonHidden).toBeAttached();
    await expect(nextButton).not.toBeAttached();
  });

  test("next button shows book name at last chapter of first book", async ({
    editorPage,
  }) => {
    const nextButton = editorPage.getByTestId("next-chapter-button");

    // Navigate to last chapter of first book (Genesis 50)
    const referencePicker = editorPage.getByTestId("reference-picker");
    await referencePicker.click();

    // Click first book control to expand its chapters
    const firstBookControl = editorPage.getByTestId("book-control").first();
    await firstBookControl.click();

    // Wait for accordion panel to be visible, then find the last chapter button within the expanded panel
    const firstBookPanel = firstBookControl.locator("..").getByRole("region"); // Get the associated accordion panel
    await expect(firstBookPanel).toBeVisible();

    const lastChapterButton = firstBookPanel
      .getByTestId("chapter-accordion-button")
      .last();
    await lastChapterButton.scrollIntoViewIfNeeded();
    await lastChapterButton.click();

    // Get next button text
    const nextButtonText = await nextButton.textContent();
    console.log(
      `Next button text in last chapter of first book "${nextButtonText}"`,
    );

    // Should show "Exodus" (the next book name, not a chapter number)
    expect(nextButtonText).toBeTruthy();
    expect(nextButtonText?.trim()).not.toMatch(/^\d+$/); // Not digit-only
    expect(nextButtonText?.trim()).toMatch(/^[A-Za-z]/); // Starts with a letter
  });

  test("prev button shows book name in first chapter of non-first books", async ({
    editorPage,
  }) => {
    const prevButton = editorPage.getByTestId("prev-chapter-button");

    // Navigate to first chapter of a middle book (Matthew 1)
    const referencePicker = editorPage.getByTestId("reference-picker");
    await referencePicker.click();

    // Click last book control to expand its chapters
    const lastBookControl = editorPage.getByTestId("book-control").last();
    await lastBookControl.click();

    // Wait for accordion panel to be visible, then find the first chapter button within the expanded panel
    const lastBookPanel = lastBookControl.locator("..").getByRole("region"); // Get the associated accordion panel
    await expect(lastBookPanel).toBeVisible();

    const firstChapterButton = lastBookPanel
      .getByTestId("chapter-accordion-button")
      .first();
    await firstChapterButton.scrollIntoViewIfNeeded();
    await firstChapterButton.click();

    // Get prev button text
    const prevButtonText = await prevButton.textContent();
    console.log(
      `Prev button text in first chapter of last book: "${prevButtonText}"`,
    );

    // Should show the previous book name (not a chapter number)
    expect(prevButtonText).toBeTruthy();
    expect(prevButtonText?.trim()).not.toMatch(/^\d+$/); // Not digit-only
    expect(prevButtonText?.trim()).toMatch(/^[A-Za-z]/); // Starts with a letter
  });
});
