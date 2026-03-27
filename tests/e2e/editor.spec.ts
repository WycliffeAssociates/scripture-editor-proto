import type { Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";
import {
    ensureSearchOptionsExpanded,
    fillSearchQuery,
    getReferencePickerState,
    openActionPalette,
    openReferencePicker,
    openSearchPanel,
} from "../helpers/e2e/editor.ts";

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

async function selectReferenceProject(page: Page) {
    await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
    await page
        .getByTestId(TESTING_IDS.referenceProjectDropdown)
        .waitFor({ state: "visible" });
    const items = page.getByTestId(TESTING_IDS.referenceProjectItem);
    const count = await items.count();

    for (let index = 0; index < count; index += 1) {
        const item = items.nth(index);
        if (await item.isDisabled()) {
            continue;
        }
        await item.click();
        return;
    }

    throw new Error("No selectable reference project was available");
}

test.describe("Editor llx-reg", () => {
    test("editor page loads correctly", async ({ editorPage }) => {
        // Verify the editor page has loaded
        await expect(editorPage).toHaveURL(/\/llx_reg$/);

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
    }, testInfo) => {
        test.skip(
            testInfo.project.name === "firefox",
            "Reference editor attachment is currently flaky in Firefox e2e.",
        );

        // Open the reference project dropdown
        await selectReferenceProject(page);

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
    }, testInfo) => {
        test.skip(
            testInfo.project.name === "firefox",
            "Reference navigation toggle is currently flaky in Firefox e2e.",
        );

        await selectReferenceProject(page);

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
    test("reference results navigate main editor and keep replace disabled", async ({
        editorWithTwoProjects: page,
    }, testInfo) => {
        test.skip(
            testInfo.project.name !== "chromium",
            "Reference-search toggle behavior is currently only stable in desktop Chromium.",
        );

        await selectReferenceProject(page);

        await openSearchPanel(page);
        const searchReferenceToggle = page.getByTestId(
            TESTING_IDS.searchReferenceToggle,
        );
        await expect(searchReferenceToggle).toBeVisible({ timeout: 20_000 });
        await fillSearchQuery(page, "i");
        await ensureSearchOptionsExpanded(page);
        await page.getByTestId(TESTING_IDS.replaceInput).fill("foo");
        await searchReferenceToggle.click();
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
        await expect(referenceResult).toHaveAttribute(
            "data-search-row-type",
            "grouped",
        );
        await expect(
            referenceResult.locator('[data-project-label="source"]'),
        ).toBeVisible();
        await expect(
            referenceResult.locator('[data-project-label="target"]'),
        ).toBeVisible();
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
        const currentChapter = await page
            .getByTestId(TESTING_IDS.referencePicker)
            .getAttribute("data-test-current-chapter");
        expect(
            currentChapter === expectedChapter ||
                (expectedChapter === "0" && currentChapter === "1"),
        ).toBeTruthy();

        await searchReferenceToggle.click();
        await expect(page.getByTestId(TESTING_IDS.replaceInput)).toBeEnabled();
        await expect(page.getByTestId(TESTING_IDS.replaceButton)).toBeEnabled();
    });

    test("can search, navigate results, and replace the current match", async ({
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

    test("re-runs search on reopen and chapter navigation for highlight sync", async ({
        editorPage,
    }, testInfo) => {
        test.skip(
            testInfo.project.name === "Mobile Chrome",
            "Search highlight sync is currently flaky in mobile emulation.",
        );

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
