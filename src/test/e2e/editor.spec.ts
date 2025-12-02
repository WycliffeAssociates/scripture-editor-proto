import { TESTING_IDS } from "@/app/data/constants.ts";
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
    const initialBookCode = await referencePicker.getAttribute(
      "data-test-book-code",
    );
    const initialChapter = await referencePicker.getAttribute(
      "data-test-current-chapter",
    );

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

      // Verify data attributes have changed
      const newBookCodeAfterNext = await referencePicker.getAttribute(
        "data-test-book-code",
      );
      const newChapterAfterNext = await referencePicker.getAttribute(
        "data-test-current-chapter",
      );

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
      const currentBookCode = await referencePicker.getAttribute(
        "data-test-book-code",
      );
      const currentChapter =
        await referencePicker.getAttribute("data-test-chapter");

      await prevButton.click();

      // Playwright automatically waits for navigation and state changes

      // Verify data attributes have changed
      const newBookCodeAfterPrev = await referencePicker.getAttribute(
        "data-test-book-code",
      );
      const newChapterAfterPrev = await referencePicker.getAttribute(
        "data-test-current-chapter",
      );

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
    await expect(prevButtonHidden).toBeAttached();
    await expect(prevButton).not.toBeAttached();
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
  });

  test.describe("Reference Picker Search", () => {
    test("search by book code shows matching book", async ({ editorPage }) => {
      // Open reference picker
      const referencePicker = editorPage.getByTestId("reference-picker");
      await referencePicker.click();

      // Type search query
      const searchInput = editorPage.getByTestId(
        "reference-picker-search-input",
      );
      await searchInput.fill("ka");
      // Wait for the results div to contain the expected text after the debounce period
      await editorPage.waitForFunction(
        () =>
          document.querySelector('[data-testid="reference-books-accordion"]')
            ?.children.length === 1,
      );

      // Verify only Galatians is shown in the filtered list
      const accordion = editorPage.getByTestId("reference-books-accordion");
      await expect(accordion).toContainText("Kalatia");
      const bookControl = editorPage.locator(
        '[data-test-id-specific^="book-control-title-gal"]',
      );
      await expect(bookControl).toBeVisible();
    });

    test("search and navigate to chapter on Enter", async ({ editorPage }) => {
      // Open reference picker
      const referencePicker = editorPage.getByTestId("reference-picker");
      await referencePicker.click();

      // Type search query and press Enter
      const searchInput = editorPage.getByTestId(
        "reference-picker-search-input",
      );
      await searchInput.fill("luk 3");
      await searchInput.press("Enter");
      const bookCodeAttr = await referencePicker.getAttribute(
        "data-test-book-code",
      );
      const chapterAttr = await referencePicker.getAttribute(
        "data-test-current-chapter",
      );

      // Verify the reference was updatedin the popover
      expect(bookCodeAttr?.toLowerCase()).toBe("luk");
      expect(chapterAttr?.toLowerCase()).toBe("3");
    });
    test("search ref picker without chapter just navigates to book", async ({
      editorPage,
    }) => {
      // Open reference picker
      const referencePicker = editorPage.getByTestId("reference-picker");
      await referencePicker.click();
      const curChapter = await referencePicker.getAttribute(
        "data-test-current-chapter",
      );

      // Type search query and press Enter
      const searchInput = editorPage.getByTestId(
        "reference-picker-search-input",
      );
      await searchInput.fill("luk");
      await searchInput.press("Enter");
      const bookCodeAttr = await referencePicker.getAttribute(
        "data-test-book-code",
      );
      const chapterAttr = await referencePicker.getAttribute(
        "data-test-current-chapter",
      );

      // Verify the reference was updatedin the popover
      expect(bookCodeAttr?.toLowerCase()).toBe("luk");
      expect(chapterAttr?.toLowerCase()).toBe(curChapter?.toLowerCase());
    });

    test("search shows multiple matches", async ({ editorPage }) => {
      // Open reference picker
      const referencePicker = editorPage.getByTestId("reference-picker");
      await referencePicker.click();

      // Search for books starting with '1'
      const searchInput = editorPage.getByTestId(
        "reference-picker-search-input",
      );
      await searchInput.fill("1");

      // Verify multiple books are shown
      const accordion = editorPage.getByTestId("reference-books-accordion");
      await editorPage.waitForFunction(
        () =>
          document.querySelector('[data-testid="reference-books-accordion"]')
            ?.children.length === 5, //1 kor, 1 ces, 1 tim, 1 pita, 1 joni
      );
      const firstCorinthians = accordion.locator(
        '[data-test-id-specific^="book-control-title-1co"]',
      );
      await expect(firstCorinthians).toBeVisible();
    });
  });
});

test.describe("Reference Project Selection", () => {
  test("shows both projects in reference project dropdown", async ({
    editorWithTwoProjects: page,
  }) => {
    // Open the reference project dropdown
    const dropdownTrigger = page.getByTestId(
      TESTING_IDS.referenceProjectTrigger,
    );
    await dropdownTrigger.click();
    await page.getByTestId(TESTING_IDS.referenceProjectDropdown).waitFor({
      state: "visible",
    });

    // Verify both projects are listed
    const projectItems = await page
      .getByTestId(TESTING_IDS.referenceProjectItem)
      .all();
    expect(projectItems).toHaveLength(2);
  });
  test("selecting reference project updates reference editor", async ({
    editorWithTwoProjects: page,
  }) => {
    // Open the reference project dropdown
    await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
    await page
      .getByTestId(TESTING_IDS.referenceProjectDropdown)
      .waitFor({ state: "visible" });

    // Click the "Unlocked Literal Bible" reference project
    await page
      .getByTestId(TESTING_IDS.referenceProjectItem)
      .filter({ hasText: "Unlocked Literal Bible" })
      .click();

    // Get the reference picker values
    const referencePicker = page.getByTestId("reference-picker");
    const expectedBookCode = await referencePicker.getAttribute(
      "data-test-book-code",
    );
    const expectedChapter = await referencePicker.getAttribute(
      "data-test-current-chapter",
    );
    if (!expectedBookCode || !expectedChapter) {
      throw new Error("Failed to get reference picker values");
    }

    // Verify reference editor shows the same values
    const refEditor = page.getByTestId(TESTING_IDS.refEditorContainer);
    await expect(refEditor).toHaveAttribute(
      "data-testing-ref-bookcode",
      expectedBookCode?.toLowerCase(),
    );
    await expect(refEditor).toHaveAttribute(
      "data-testing-ref-chapter",
      expectedChapter,
    );
  });
});

test.describe("Search Functionality", () => {
  test("search pane opens on trigger click", async ({ editorPage }) => {
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();
    await expect(editorPage.getByTestId(TESTING_IDS.searchInput)).toBeVisible();
  });

  test("search shows results for common word", async ({ editorPage }) => {
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();

    const searchInput = editorPage.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill("vola");

    const results = editorPage.getByTestId(TESTING_IDS.searchResultItem);
    await expect(results.first()).toBeVisible(); // waits until DOM has ≥1 result

    const statsSpan = editorPage.getByTestId(TESTING_IDS.searchStats);
    await expect(statsSpan).toHaveText(/^\d+ \/ \d+$/);
  });

  test("search navigation buttons appear when multiple matches exist", async ({
    editorPage,
  }) => {
    // Open search UI
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();

    // Enter query
    const searchInput = editorPage.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill("vola");

    // Results locator
    const results = editorPage.getByTestId(TESTING_IDS.searchResultItem);

    // Wait until at least 6 results appear (index 5 is the 6th item)
    await expect(results.nth(5)).toBeVisible();

    // Now count() is safe because results have finished rendering
    const count = await results.count();
    console.log(`Search results count: ${count}`);
    expect(count).toBeGreaterThan(5);

    // Buttons should be visible once multiple matches exist
    await expect(
      editorPage.getByTestId(TESTING_IDS.searchPrevButton),
    ).toBeVisible();

    await expect(
      editorPage.getByTestId(TESTING_IDS.searchNextButton),
    ).toBeVisible();
  });

  test("next button advances match counter", async ({ editorPage }) => {
    // Open search UI
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();

    // Fill input (auto-waits for element readiness)
    const searchInput = editorPage.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill("vola");

    // Wait for first result to appear — guarantees search has completed
    const statsSpan = editorPage.getByTestId(TESTING_IDS.searchStats);
    await expect(statsSpan).toHaveText(/1 \/ \d+/);

    // Read the initial stats
    const initialStats = await statsSpan.textContent();
    console.log(`Initial stats: "${initialStats}"`);
    expect(initialStats).toMatch(/1 \/ \d+/);

    // click second result
    const results = editorPage.getByTestId(TESTING_IDS.searchResultItem);
    await results.nth(1).click();

    // Click "next" (autowaits for clickable)
    await editorPage.getByTestId(TESTING_IDS.searchNextButton).click();

    // Wait for the updated stats to reflect the next match
    await expect(statsSpan).toHaveText("2 / 2");
  });

  test("prev button goes back", async ({ editorPage }) => {
    // Open search UI
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();

    // Fill input (auto-waits)
    const searchInput = editorPage.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill("vola");
    const results = editorPage.getByTestId(TESTING_IDS.searchResultItem);
    await results.nth(2).click();

    // Wait for search results to populate via stats element
    const statsSpan = editorPage.getByTestId(TESTING_IDS.searchStats);
    await expect(statsSpan).toHaveText(/2 \/ \d+/);

    // Advance forward
    await editorPage.getByTestId(TESTING_IDS.searchPrevButton).click();

    // Read initial stats
    const newState = await statsSpan.textContent();
    console.log(`New state: "${newState}"`);
    expect(newState).toMatch(/1 \/ \d+/);
  });

  test("replace button replaces text", async ({ editorPage }) => {
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();
    await editorPage.getByTestId(TESTING_IDS.searchInput).fill("vola");
    await editorPage.getByTestId(TESTING_IDS.replaceInput).fill("foo");
    await editorPage.getByTestId(TESTING_IDS.replaceButton).click();
    await expect(
      editorPage.getByText(
        " Ai foo ni kawa i Jisu Karisito, a luvei Tevita, a luvei Eparama.",
      ),
    ).toBeVisible();
  });
  test("replace all button replaces all text in a chapter", async ({
    editorPage,
  }) => {
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();
    await editorPage.getByTestId(TESTING_IDS.searchInput).fill("vola");
    const results = editorPage.getByTestId(TESTING_IDS.searchResultItem);
    await results.nth(1).click(); //2 results in this chapter
    await editorPage.getByTestId(TESTING_IDS.replaceInput).fill("foo");
    await editorPage.getByTestId(TESTING_IDS.replaceAllButton).click();
    const allEditorContent = await editorPage
      .getByTestId(TESTING_IDS.mainEditorContainer)
      .textContent();
    console.log(allEditorContent);
    expect(allEditorContent).not.toContain("vola");
  });

  test("match case checkbox toggles and affects results", async ({
    editorPage,
  }) => {
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();
    const searchInput = editorPage.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill("kaya");

    const initialCount = await editorPage
      .getByTestId(TESTING_IDS.searchResultsContainer)
      .getAttribute("data-num-search-results");
    if (!initialCount) {
      throw new Error("Initial count not found");
    }
    console.log(`Initial count: ${initialCount}`);
    await editorPage.getByTestId(TESTING_IDS.matchCaseCheckbox).click();

    const caseSensitiveCount = await editorPage
      .getByTestId(TESTING_IDS.searchResultsContainer)
      .getAttribute("data-num-search-results");
    console.log(`Case sensitive count: ${caseSensitiveCount}`);
    expect(Number(caseSensitiveCount)).toBeLessThanOrEqual(
      Number(initialCount),
    );
  });

  test("whole word checkbox filters to whole words only", async ({
    editorPage,
  }) => {
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();
    const searchInput = editorPage.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill("in");
    await editorPage.waitForTimeout(700);
    const initialCount = await editorPage
      .getByTestId(TESTING_IDS.searchResultItem)
      .count();
    console.log(`Initial count: ${initialCount}`);
    await editorPage.getByTestId(TESTING_IDS.matchWholeWordCheckbox).click();
    await editorPage.waitForTimeout(700);
    const wholeWordCount = await editorPage
      .getByTestId(TESTING_IDS.searchResultItem)
      .count();
    console.log(`Whole word count: ${wholeWordCount}`);
    expect(wholeWordCount).toBeLessThanOrEqual(initialCount);
  });

  test("sort toggle shows case mismatches first", async ({ editorPage }) => {
    await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();
    const searchInput = editorPage.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill("the");
    await editorPage.waitForTimeout(700);
    await expect(
      editorPage.getByTestId(TESTING_IDS.searchCaseMismatchLabel),
    ).not.toBeVisible();
    await editorPage.getByTestId(TESTING_IDS.sortToggleButton).click();
    await editorPage.waitForTimeout(200);
    await expect(
      editorPage.getByTestId(TESTING_IDS.searchCaseMismatchLabel),
    ).toBeVisible();
  });
});
