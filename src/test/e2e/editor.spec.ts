import type { Page } from "@playwright/test";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import { BASE_URL, expect, test } from "./fixtures.ts";
import {
    ensureSearchOptionsExpanded,
    fillSearchQuery,
    getReferencePickerState,
    openActionPalette,
    openReferencePicker,
    openSearchPanel,
} from "./helpers/editor.ts";

async function selectWordInEditor(page: Page) {
    await page.evaluate(() => {
        const root =
            document.querySelector('[contenteditable="true"]') ?? document.body;
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            null,
        );
        let node: Node | null = null;

        // biome-ignore lint/suspicious/noAssignInExpressions: TreeWalker iteration pattern.
        while ((node = walker.nextNode())) {
            const value = node.nodeValue ?? "";
            const startOffset = value.indexOf("Jisu");
            if (startOffset >= 0) {
                const range = document.createRange();
                range.setStart(node, startOffset);
                range.setEnd(node, startOffset + 4);
                const selection = window.getSelection();
                if (!selection) return;
                selection.removeAllRanges();
                selection.addRange(range);
                (
                    document.querySelector(
                        '[contenteditable="true"]',
                    ) as HTMLElement | null
                )?.focus();
                return;
            }
        }
    });
}

async function waitForContextMenuSelectionHighlight(page: Page) {
    await page.waitForFunction(() => {
        const highlight = CSS.highlights.get("context-menu-selection");
        return Boolean(highlight && highlight.size > 0);
    });
}

async function waitForContextMenuSelectionHighlightCleared(page: Page) {
    await page.waitForFunction(() => {
        const highlight = CSS.highlights.get("context-menu-selection");
        return !highlight || highlight.size === 0;
    });
}

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
        const referencePicker = await openReferencePicker(editorPage);
        await expect(referencePicker).toBeVisible();

        const { bookCode: initialBookCode, chapter: initialChapter } =
            await getReferencePickerState(editorPage);

        // Test next button functionality
        const nextButton = editorPage.getByTestId(
            TESTING_IDS.navigation.nextChapterButton,
        );
        await expect(nextButton).toBeVisible();

        // Only test if next button is enabled
        const isNextEnabled = !(await nextButton.isDisabled());
        if (isNextEnabled) {
            await nextButton.click();

            const {
                bookCode: newBookCodeAfterNext,
                chapter: newChapterAfterNext,
            } = await getReferencePickerState(editorPage);

            // At least one of the attributes should have changed
            expect(
                newBookCodeAfterNext !== initialBookCode ||
                    newChapterAfterNext !== initialChapter,
            ).toBeTruthy();
        }

        // Test prev button functionality
        const prevButton = editorPage.getByTestId(
            TESTING_IDS.navigation.prevChapterButton,
        );
        await expect(prevButton).toBeVisible();

        // Only test if prev button is enabled
        const isPrevEnabled = !(await prevButton.isDisabled());
        if (isPrevEnabled) {
            const { bookCode: currentBookCode, chapter: currentChapter } =
                await getReferencePickerState(editorPage);

            await prevButton.click();

            const {
                bookCode: newBookCodeAfterPrev,
                chapter: newChapterAfterPrev,
            } = await getReferencePickerState(editorPage);

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
        const prevButton = await editorPage.getByTestId(
            TESTING_IDS.navigation.prevChapterButton,
        );
        const nextButton = await editorPage.getByTestId(
            TESTING_IDS.navigation.nextChapterButton,
        );

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
        await openReferencePicker(editorPage);

        // Look for first book in the dropdown and click first chapter
        await editorPage
            .getByTestId(TESTING_IDS.reference.bookControl)
            .first()
            .click();
        await editorPage
            .getByTestId(TESTING_IDS.reference.chapterAccordionButton)
            .first()
            .click();

        // Verify prev button is hidden (span with hidden testid)
        const prevButtonHidden = editorPage.getByTestId(
            TESTING_IDS.navigation.prevChapterButtonHidden,
        );
        const prevButton = editorPage.getByTestId(
            TESTING_IDS.navigation.prevChapterButton,
        );

        // Hidden span should be visible, button should not exist
        await expect(prevButtonHidden).toBeAttached();
        await expect(prevButton).not.toBeAttached();
    });

    test("next button not visible in last chapter of last book", async ({
        editorPage,
    }) => {
        // Navigate to last chapter of last book (Revelation 22)
        await openReferencePicker(editorPage);

        // Look for last book in the dropdown and click last chapter
        await editorPage
            .getByTestId(TESTING_IDS.reference.bookControl)
            .last()
            .click();
        await editorPage
            .getByTestId(TESTING_IDS.reference.chapterAccordionButton)
            .last()
            .click();

        // Verify next button is hidden (span with hidden testid)
        const nextButtonHidden = editorPage.getByTestId(
            TESTING_IDS.navigation.nextChapterButtonHidden,
        );
        const nextButton = editorPage.getByTestId(
            TESTING_IDS.navigation.nextChapterButton,
        );

        // Hidden span should be visible, button should not exist
        await expect(nextButtonHidden).toBeAttached();
        await expect(nextButton).not.toBeAttached();
    });

    test("prev button shows book name in first chapter of non-first books", async ({
        editorPage,
    }) => {
        const prevButton = editorPage.getByTestId(
            TESTING_IDS.navigation.prevChapterButton,
        );

        // Navigate to first chapter of a middle book (Matthew 1)
        await openReferencePicker(editorPage);

        // Click last book control to expand its chapters
        const lastBookControl = editorPage
            .getByTestId(TESTING_IDS.reference.bookControl)
            .last();
        await lastBookControl.click();

        // Wait for accordion panel to be visible, then find the first chapter button within the expanded panel
        const lastBookPanel = lastBookControl.locator("..").getByRole("region"); // Get the associated accordion panel
        await expect(lastBookPanel).toBeVisible();

        const firstChapterButton = lastBookPanel
            .getByTestId(TESTING_IDS.reference.chapterAccordionButton)
            .first();
        await firstChapterButton.scrollIntoViewIfNeeded();
        await firstChapterButton.click();

        // Should show the previous book name (not a chapter number)
        const prevButtonText = await prevButton.textContent();
        expect(prevButtonText).toBeTruthy();
    });

    test.describe("Reference Picker Search", () => {
        test("search by book code shows matching book", async ({
            editorPage,
        }) => {
            // Open reference picker
            await openReferencePicker(editorPage);

            // Type search query
            const searchInput = editorPage.getByTestId(
                TESTING_IDS.reference.pickerSearchInput,
            );
            await searchInput.fill("ka");
            // Wait for the results div to contain the expected text after the debounce period
            await editorPage.waitForFunction(
                () =>
                    document.querySelector(
                        `[data-testid="reference-books-accordion"`,
                    )?.children.length === 1,
            );

            // Verify only Galatians is shown in the filtered list
            const accordion = editorPage.getByTestId(
                TESTING_IDS.reference.booksAccordion,
            );
            await expect(accordion).toContainText("Kalatia");
            const bookControl = editorPage.locator(
                `[data-test-id-specific="${TEST_ID_GENERATORS.bookTitle("gal")}"]`,
            );
            await expect(bookControl).toBeVisible();
        });

        test("search and navigate to chapter on Enter", async ({
            editorPage,
        }) => {
            const referencePicker = await openReferencePicker(editorPage);

            // Type search query and press Enter
            const searchInput = editorPage.getByTestId(
                TESTING_IDS.reference.pickerSearchInput,
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
            const referencePicker = await openReferencePicker(editorPage);
            const curChapter = await referencePicker.getAttribute(
                "data-test-current-chapter",
            );

            // Type search query and press Enter
            const searchInput = editorPage.getByTestId(
                TESTING_IDS.reference.pickerSearchInput,
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
            await openReferencePicker(editorPage);

            // Search for books starting with '1'
            const searchInput = editorPage.getByTestId(
                TESTING_IDS.reference.pickerSearchInput,
            );
            await searchInput.fill("1");

            // Verify multiple books are shown
            const accordion = editorPage.getByTestId(
                TESTING_IDS.reference.booksAccordion,
            );

            await editorPage.waitForFunction(
                () =>
                    document.querySelector(
                        `[data-testid="reference-books-accordion"]`,
                    )?.children.length === 5, //1 kor, 1 ces, 1 tim, 1 pita, 1 joni
            );
            const firstCorinthians = accordion.locator(
                `[data-test-id-specific="${TEST_ID_GENERATORS.bookTitle("1co")}"]`,
            );
            await expect(firstCorinthians).toBeVisible();
        });
    });
});

test.describe("Editor Action Palette", () => {
    test("opens with keyboard and closes on escape", async ({ editorPage }) => {
        await openActionPalette(editorPage);
        await editorPage.keyboard.press("Escape");
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).not.toBeVisible();
    });

    test("shows search action for selected text", async ({ editorPage }) => {
        await selectWordInEditor(editorPage);

        await openActionPalette(editorPage);
        const searchAction = editorPage.getByTestId(
            TESTING_IDS.contextMenu.searchAction,
        );
        await expect(searchAction).toBeVisible();
        await expect(searchAction).toContainText('Find "');
    });

    test("keeps selected range highlighted while palette is open (keyboard)", async ({
        editorPage,
    }) => {
        await selectWordInEditor(editorPage);
        await editorPage.keyboard.press("Control+k");
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).toBeVisible();
        await waitForContextMenuSelectionHighlight(editorPage);

        await editorPage.keyboard.press("Escape");
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).not.toBeVisible();
        await waitForContextMenuSelectionHighlightCleared(editorPage);
    });

    test("keeps selected range highlighted while palette is open (right-click + tab)", async ({
        editorPage,
    }) => {
        await selectWordInEditor(editorPage);
        const point = await editorPage.evaluate(() => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return null;
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
        });
        if (!point) {
            throw new Error("Failed to resolve selected text coordinates");
        }

        await editorPage.mouse.click(point.x, point.y, { button: "right" });
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).toBeVisible();
        await waitForContextMenuSelectionHighlight(editorPage);

        await editorPage.keyboard.press("Escape");
        await waitForContextMenuSelectionHighlightCleared(editorPage);

        await selectWordInEditor(editorPage);
        await editorPage.keyboard.press("Tab");
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).toBeVisible();
        await waitForContextMenuSelectionHighlight(editorPage);

        await editorPage.keyboard.press("Escape");
        await waitForContextMenuSelectionHighlightCleared(editorPage);
    });

    test("supports multi-step change marker flow", async ({ editorPage }) => {
        await editorPage.getByText("Ai vola ni kawa i Jisu").first().click();
        await openActionPalette(editorPage);
        await editorPage.keyboard.type("Change previous paragraph");
        await editorPage.keyboard.press("Enter");

        const stepHeader = editorPage.locator(".mantine-Pill-root");
        await expect(stepHeader).toBeVisible();
        await expect(stepHeader).toContainText(
            "Change previous paragraph marker to...",
        );

        await editorPage
            .getByRole("option", { name: "Margin Paragraph" })
            .click();

        await editorPage.keyboard.press("Escape");
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).not.toBeVisible();
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
        const referencePicker = page.getByTestId(TESTING_IDS.referencePicker);
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
        await expect(refEditor).toBeAttached({ timeout: 15000 });
        await expect(refEditor).toHaveAttribute(
            "data-testing-ref-bookcode",
            expectedBookCode?.toLowerCase(),
        );
        await expect(refEditor).toHaveAttribute(
            "data-testing-ref-chapter",
            expectedChapter,
        );

        const referenceTab = page.getByTestId(
            TESTING_IDS.mobile.referenceEditorTab,
        );
        if ((await referenceTab.count()) > 0) {
            await referenceTab.first().click();
        }

        // Reference editor should always remain read-only.
        await expect(
            refEditor.locator('[contenteditable="false"]').first(),
        ).toBeVisible();
    });

    test("reference navigation can move independently when sync navigation is off", async ({
        editorWithTwoProjects: page,
    }) => {
        await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
        await page
            .getByTestId(TESTING_IDS.referenceProjectItem)
            .filter({ hasText: "Unlocked Literal Bible" })
            .click();

        const mainPicker = page.getByTestId(TESTING_IDS.referencePicker);
        const mainBookBefore = await mainPicker.getAttribute(
            "data-test-book-code",
        );
        const mainChapterBefore = await mainPicker.getAttribute(
            "data-test-current-chapter",
        );
        if (!mainBookBefore || !mainChapterBefore) {
            throw new Error("Missing main picker location state");
        }

        const referenceTab = page.getByTestId(
            TESTING_IDS.mobile.referenceEditorTab,
        );
        if ((await referenceTab.count()) > 0) {
            await referenceTab.first().click();
        }

        await page
            .getByTestId(TESTING_IDS.reference.syncNavigationToggle)
            .click();

        const targetReference =
            mainBookBefore.toLowerCase() === "gen" && mainChapterBefore === "1"
                ? "rev 1"
                : "gen 1";

        const referenceStickyPicker = page.getByTestId(
            TESTING_IDS.reference.stickyPicker,
        );
        await referenceStickyPicker.click();

        const stickySearchInput = page
            .getByTestId(TESTING_IDS.reference.pickerSearchInput)
            .last();
        await stickySearchInput.fill(targetReference);
        await stickySearchInput.press("Enter");

        await expect(mainPicker).toHaveAttribute(
            "data-test-book-code",
            mainBookBefore,
        );
        await expect(mainPicker).toHaveAttribute(
            "data-test-current-chapter",
            mainChapterBefore,
        );

        const refEditor = page.getByTestId(TESTING_IDS.refEditorContainer);
        const [targetBook, targetChapter] = targetReference.split(" ");
        await expect(refEditor).toHaveAttribute(
            "data-testing-ref-bookcode",
            targetBook,
        );
        await expect(refEditor).toHaveAttribute(
            "data-testing-ref-chapter",
            targetChapter,
        );
    });
});

test.describe("Search Functionality", () => {
    test("search reference toggle appears only when a reference project is selected", async ({
        editorWithTwoProjects: page,
    }) => {
        await openSearchPanel(page);
        await expect(
            page.getByTestId(TESTING_IDS.searchReferenceToggle),
        ).toHaveCount(0);

        await page.getByTestId(TESTING_IDS.searchTrigger).click();
        await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
        await page
            .getByTestId(TESTING_IDS.referenceProjectItem)
            .filter({ hasText: "Unlocked Literal Bible" })
            .click();

        await openSearchPanel(page);
        await expect(
            page.getByTestId(TESTING_IDS.searchReferenceToggle),
        ).toBeVisible();
    });

    test("enabling search reference shows one grouped clickable row per hit", async ({
        editorWithTwoProjects: page,
    }) => {
        await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
        await page
            .getByTestId(TESTING_IDS.referenceProjectItem)
            .filter({ hasText: "Unlocked Literal Bible" })
            .click();

        await openSearchPanel(page);
        await fillSearchQuery(page, "j");
        await page.getByTestId(TESTING_IDS.searchReferenceToggle).click();

        const firstResult = page
            .getByTestId(TESTING_IDS.searchResultItem)
            .first();
        await expect(firstResult).toBeVisible({ timeout: 15000 });
        await expect(firstResult).toHaveAttribute(
            "data-search-row-type",
            "grouped",
        );
        await expect(
            firstResult.locator('[data-project-label="source"]'),
        ).toBeVisible();
        await expect(
            firstResult.locator('[data-project-label="target"]'),
        ).toBeVisible();
    });

    test("reference results navigate main editor and keep replace disabled", async ({
        editorWithTwoProjects: page,
    }) => {
        await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
        await page
            .getByTestId(TESTING_IDS.referenceProjectItem)
            .filter({ hasText: "Unlocked Literal Bible" })
            .click();

        await openSearchPanel(page);
        await fillSearchQuery(page, "i");
        await ensureSearchOptionsExpanded(page);
        await page.getByTestId(TESTING_IDS.replaceInput).fill("foo");
        await page.getByTestId(TESTING_IDS.searchReferenceToggle).click();
        await expect(page.getByTestId(TESTING_IDS.replaceInput)).toBeDisabled();
        await expect(
            page.getByTestId(TESTING_IDS.replaceButton),
        ).toBeDisabled();
        await expect(
            page.getByTestId(TESTING_IDS.searchResultItem).first(),
        ).toBeVisible({ timeout: 15000 });

        const resultsContainer = page.getByTestId(
            TESTING_IDS.searchResultsContainer,
        );
        const referenceResult = resultsContainer
            .locator('[data-search-source="reference"]')
            .first();
        await expect(referenceResult).toBeVisible({ timeout: 15000 });
        const expectedBook =
            await referenceResult.getAttribute("data-search-book");
        const expectedChapter = await referenceResult.getAttribute(
            "data-search-chapter",
        );
        if (!expectedBook || !expectedChapter) {
            throw new Error(
                "Missing expected search result location attributes",
            );
        }

        await referenceResult.click();
        await expect(
            page.getByTestId(TESTING_IDS.replaceButton),
        ).toBeDisabled();
        await expect(
            page.getByTestId(TESTING_IDS.referencePicker),
        ).toHaveAttribute("data-test-book-code", expectedBook);
        await expect(
            page.getByTestId(TESTING_IDS.referencePicker),
        ).toHaveAttribute("data-test-current-chapter", expectedChapter);

        await page.getByTestId(TESTING_IDS.searchReferenceToggle).click();
        await expect(page.getByTestId(TESTING_IDS.replaceInput)).toBeEnabled();
        await expect(page.getByTestId(TESTING_IDS.replaceButton)).toBeEnabled();
    });

    test("search reference toggle persists across close and reopen", async ({
        editorWithTwoProjects: page,
    }) => {
        await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
        await page
            .getByTestId(TESTING_IDS.referenceProjectItem)
            .filter({ hasText: "Unlocked Literal Bible" })
            .click();

        await openSearchPanel(page);
        await fillSearchQuery(page, "j");
        await page.getByTestId(TESTING_IDS.searchReferenceToggle).click();
        await expect(
            page.getByTestId(TESTING_IDS.searchResultItem).first(),
        ).toBeVisible({ timeout: 15000 });

        await page.getByTestId(TESTING_IDS.searchTrigger).click();
        await openSearchPanel(page);

        await expect(
            page.getByTestId(TESTING_IDS.searchResultItem).first(),
        ).toBeVisible({ timeout: 15000 });
        const firstSource = await page
            .getByTestId(TESTING_IDS.searchResultItem)
            .first()
            .getAttribute("data-search-source");
        expect(firstSource).toBe("reference");
    });

    test("can open search and navigate among results", async ({
        editorPage,
    }) => {
        await openSearchPanel(editorPage);
        await expect(
            editorPage.getByTestId(TESTING_IDS.searchInput),
        ).toBeVisible();
        await fillSearchQuery(editorPage, "vola");

        const results = editorPage.getByTestId(TESTING_IDS.searchResultItem);
        await expect(results.nth(5)).toBeVisible();

        const stats = editorPage.getByTestId(TESTING_IDS.searchStats);
        await expect(stats).toHaveText(/\d+ of \d+ results|\d+ results/);
        const before = await stats.textContent();

        await editorPage.getByTestId(TESTING_IDS.searchNextButton).click();
        const afterNext = await stats.textContent();
        expect(afterNext).not.toBe(before);

        await editorPage.getByTestId(TESTING_IDS.searchPrevButton).click();
        const afterPrev = await stats.textContent();
        expect(afterPrev).not.toBe(afterNext);
    });

    test("search results are deduped by verse and select first occurrence", async ({
        editorPage,
    }) => {
        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "vola");
        await expect(
            editorPage.getByTestId(TESTING_IDS.searchResultItem).first(),
        ).toBeVisible();

        const visibleOccurrences = await editorPage
            .getByTestId(TESTING_IDS.searchResultItem)
            .evaluateAll((rows) =>
                rows
                    .map((row) => row.getAttribute("data-search-occurrence"))
                    .filter((value): value is string => value !== null),
            );
        expect(visibleOccurrences.length).toBeGreaterThan(0);
        expect(visibleOccurrences.every((value) => value === "0")).toBe(true);
    });

    test("replace can update current match", async ({ editorPage }) => {
        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "vola");
        await ensureSearchOptionsExpanded(editorPage);
        await editorPage.getByTestId(TESTING_IDS.replaceInput).fill("foo");
        await editorPage.getByTestId(TESTING_IDS.replaceButton).click();
        await expect(
            editorPage.getByText(
                " Ai foo ni kawa i Jisu Karisito, a luvei Tevita, a luvei Eparama.",
            ),
        ).toBeVisible();
    });

    test("replace all can update all matches in current chapter", async ({
        editorPage,
    }) => {
        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "jisu");
        await ensureSearchOptionsExpanded(editorPage);
        await editorPage.getByTestId(TESTING_IDS.replaceInput).fill("foo");
        await editorPage.getByTestId(TESTING_IDS.replaceAllButton).click();
        const allEditorContent = await editorPage
            .getByTestId(TESTING_IDS.mainEditorContainer)
            .textContent();
        expect(allEditorContent).not.toMatch(/jisu/i);
    });

    test("search options modify result grouping and filtering", async ({
        editorPage,
    }) => {
        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "Jisu");
        await ensureSearchOptionsExpanded(editorPage);

        const beforeCase = await editorPage
            .getByTestId(TESTING_IDS.searchResultsContainer)
            .getAttribute("data-num-search-results");
        if (!beforeCase) {
            throw new Error("Pre-toggle result count not found");
        }
        await editorPage.getByTestId(TESTING_IDS.matchCaseCheckbox).click();
        const afterCase = await editorPage
            .getByTestId(TESTING_IDS.searchResultsContainer)
            .getAttribute("data-num-search-results");
        expect(Number(afterCase)).toBeLessThanOrEqual(Number(beforeCase));

        await fillSearchQuery(editorPage, "in");
        const wholeWordToggle = editorPage.getByTestId(
            TESTING_IDS.matchWholeWordCheckbox,
        );
        const wholeWordLabel = await wholeWordToggle.getAttribute("aria-label");
        if (wholeWordLabel?.toLowerCase().includes("disable")) {
            await wholeWordToggle.click();
        }

        const beforeWholeWord = await editorPage
            .getByTestId(TESTING_IDS.searchResultsContainer)
            .getAttribute("data-num-search-results");
        if (!beforeWholeWord) {
            throw new Error("Pre-toggle whole-word result count not found");
        }
        await wholeWordToggle.click();
        const afterWholeWord = await editorPage
            .getByTestId(TESTING_IDS.searchResultsContainer)
            .getAttribute("data-num-search-results");
        expect(Number(afterWholeWord)).not.toBe(Number(beforeWholeWord));

        await expect(
            editorPage.getByTestId(TESTING_IDS.searchCaseMismatchLabel),
        ).not.toBeVisible();
        await editorPage.getByTestId(TESTING_IDS.sortToggleButton).click();
        await expect(
            editorPage.getByTestId(TESTING_IDS.searchCaseMismatchLabel),
        ).toBeVisible();
    });

    test("re-runs search on reopen and chapter navigation for highlight sync", async ({
        editorPage,
    }) => {
        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "a");
        await expect(
            editorPage.getByTestId(TESTING_IDS.searchResultItem).first(),
        ).toBeVisible();

        await editorPage.waitForFunction(() => {
            const highlight = CSS.highlights.get("matched-search");
            return Boolean(highlight && highlight.size > 0);
        });

        // Close search, navigate chapter, then reopen. Highlights should be reapplied.
        await editorPage.getByTestId(TESTING_IDS.searchTrigger).click();

        const nextButton = editorPage.getByTestId(
            TESTING_IDS.navigation.nextChapterButton,
        );
        await expect(nextButton).toBeVisible();
        await nextButton.click();
        const chapterAfterNext = await editorPage
            .getByTestId(TESTING_IDS.referencePicker)
            .getAttribute("data-test-current-chapter");

        await openSearchPanel(editorPage);
        await expect(
            editorPage.getByTestId(TESTING_IDS.searchInput),
        ).toHaveValue("a");
        await editorPage.waitForFunction(() => {
            const highlight = CSS.highlights.get("matched-search");
            return Boolean(highlight && highlight.size > 0);
        });
        await expect(
            editorPage.getByTestId(TESTING_IDS.referencePicker),
        ).toHaveAttribute("data-test-current-chapter", chapterAfterNext ?? "");
    });
});
