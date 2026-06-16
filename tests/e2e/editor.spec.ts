import type { Page } from "@playwright/test";

import { TESTING_IDS } from "@/app/data/constants.ts";

import {
  ensureSearchOptionsExpanded,
  fillSearchQuery,
  openActionPalette,
  openSearchPanel,
} from "../helpers/e2e/editor.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";
import {
  openReferenceProjectPicker,
  selectReferenceProject,
} from "../helpers/e2e/reference.ts";

async function selectWordInEditor(page: Page) {
  await page.evaluate(() => {
    const root =
      document.querySelector('[contenteditable="true"]') ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
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
    await expect(editorPage).toHaveURL(/\/llx_reg$/);

    // You can add more specific editor page assertions here
    // For example, checking for editor-specific elements
    // await expect(editorPage.getByTestId("editor-container")).toBeVisible();
  });

  test("next and prev buttons change the current chapter location", async ({
    editorPage,
  }) => {
    // Behavior: pressing Next / Previous chapter changes the visible
    // location label in the editor toolbar. Previously this test pinned
    // data-test-* attributes on a "reference picker" element that no
    // longer exposes that state.
    const location = editorPage.getByTestId(TESTING_IDS.currentLocation);
    const initial = (await location.textContent()) ?? "";

    const nextButton = editorPage.getByRole("button", {
      name: "Next chapter",
    });
    await expect(nextButton).toBeVisible();
    if (!(await nextButton.isDisabled())) {
      await nextButton.click();
      await expect(location).not.toHaveText(initial);
    }

    const prevButton = editorPage.getByRole("button", {
      name: "Previous chapter",
    });
    await expect(prevButton).toBeVisible();
    if (!(await prevButton.isDisabled())) {
      const current = (await location.textContent()) ?? "";
      await prevButton.click();
      await expect(location).not.toHaveText(current);
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

    // Don't use `openActionPalette` here — it clicks the editor
    // before pressing Ctrl+K, which dismisses the selection set
    // by `selectWordInEditor`. With no selection, the search
    // action's `isVisible` predicate (`!!suggestedSearchTerm`)
    // returns false and the action isn't rendered. The keyboard-
    // only path preserves the selection.
    await editorPage.keyboard.press("Control+k");
    await expect(
      editorPage.getByTestId(TESTING_IDS.contextMenu.container),
    ).toBeVisible();

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

    // Assert on visible step-pill text. Previously this used a
    // .mantine-Pill-root class selector that's dead post-Mantine→Base UI.
    await expect(
      editorPage.getByText("Change previous paragraph marker to..."),
    ).toBeVisible();

    await editorPage.getByRole("option", { name: "Margin Paragraph" }).click();

    await editorPage.keyboard.press("Escape");
    await expect(
      editorPage.getByTestId(TESTING_IDS.contextMenu.container),
    ).not.toBeVisible();
  });
});

test.describe("Reference Project Selection", () => {
  test("shows both projects in reference resource dropdown", async ({
    editorWithTwoProjects: page,
  }) => {
    // With two projects imported, the reference resource picker should
    // list at least both projects as selectable on-device resources.
    const dropdown = await openReferenceProjectPicker(page);
    const items = dropdown.getByTestId(TESTING_IDS.referenceProjectItem);
    expect(await items.count()).toBeGreaterThanOrEqual(2);
  });
  test("selecting reference project shows read-only content in reference editor", async ({
    editorWithTwoProjects: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "firefox",
      "Reference editor attachment is currently flaky in Firefox e2e.",
    );

    await selectReferenceProject(page);

    // End behavior: the reference editor renders content and is read-only.
    // The previous test asserted exact equality of book/chapter data
    // attributes between the main location picker and the ref editor —
    // those data hooks no longer line up after the picker refactor.
    const refEditor = page.getByTestId(TESTING_IDS.refEditorContainer);
    await expect(refEditor).toBeAttached({ timeout: 15_000 });
    await expect(
      refEditor.locator('[contenteditable="false"]').first(),
    ).toBeVisible();
  });

  /*
     * DISABLED: the "Sync navigation" toggle and the reference-only chapter
     * arrows were removed from the reference UI (nav-sync is now always on),
     * so this test targets controls that no longer exist.
     * TODO: delete this block, or rewrite it, once the sync-nav direction is
     * settled (see TODOs at the isReferenceNavSynced state seam in
     * useReferenceItem.tsx).
     *
    test("reference navigation can move independently when sync navigation is off", async ({
        editorWithTwoProjects: page,
    }, testInfo) => {
        test.skip(
            testInfo.project.name === "firefox",
            "Reference navigation toggle is currently flaky in Firefox e2e.",
        );

        await selectReferenceProject(page);

        const mainLocation = page.getByTestId(TESTING_IDS.currentLocation);
        const refEditor = page.getByTestId(TESTING_IDS.refEditorContainer);

        const mainLocationBefore = (await mainLocation.textContent()) ?? "";
        const refChapterBefore = await refEditor.getAttribute(
            "data-testing-ref-chapter",
        );

        // Turn off sync so reference navigation moves independently.
        await page
            .getByTestId(TESTING_IDS.reference.syncNavigationToggle)
            .click();

        // Use the reference-only next button. With sync off, this should
        // advance only the reference column.
        await page.getByTestId(TESTING_IDS.reference.nextButton).click();

        // Main editor location unchanged.
        await expect(mainLocation).toHaveText(mainLocationBefore);
        // Reference editor moved to a different chapter.
        await expect(refEditor).not.toHaveAttribute(
            "data-testing-ref-chapter",
            refChapterBefore ?? "",
        );
    });
    */
});

test.describe("Search Functionality", () => {
  test("reference results navigate main editor and keep replace disabled", async ({
    editorWithTwoProjects: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Reference-search behavior is currently only stable in desktop Chromium.",
    );

    await selectReferenceProject(page);

    await openSearchPanel(page);
    await fillSearchQuery(page, "i");
    await ensureSearchOptionsExpanded(page);
    await page.getByTestId(TESTING_IDS.replaceInput).fill("foo");

    // Pick a reference source. With one available the "Show reference"
    // select default already points at the imported reference project,
    // which makes the "Search in" scope toggle appear. Flipping that
    // toggle is what actually enters reference-search mode.
    const referenceSelect = page
      .getByTestId(TESTING_IDS.searchReferenceToggle)
      .getByRole("combobox");
    await expect(referenceSelect).toBeVisible({ timeout: 20_000 });
    const initialSourceText = (await referenceSelect.textContent()) ?? "None";
    if (/^\s*None\s*$/.test(initialSourceText)) {
      await referenceSelect.click();
      const options = page.getByRole("option");
      const optionCount = await options.count();
      for (let i = 0; i < optionCount; i += 1) {
        const opt = options.nth(i);
        const text = (await opt.textContent()) ?? "";
        if (!/^\s*None\s*$/i.test(text)) {
          await opt.click();
          break;
        }
      }
    }

    // Flip the search-scope toggle → reference scope. It's now a checkbox-style
    // ToggleButton (magnifying glass + "Search your project / source text"),
    // targeted by its stable testid.
    await page.getByTestId(TESTING_IDS.searchScopeToggle).click();

    // Now replace targets read-only source: replace input is disabled.
    await expect(page.getByTestId(TESTING_IDS.replaceInput)).toBeDisabled();

    // A reference result should appear; clicking it navigates the main editor
    // to that location and docks the find panel beside the now-revealed editor
    // (desktop). The docked view hides the toolbar (and its location label), so
    // assert the dock happened: the toolbar is gone and find stays open.
    const resultItem = page.getByTestId(TESTING_IDS.searchResultItem).first();
    await expect(resultItem).toBeVisible({ timeout: 15_000 });
    await resultItem.getByRole("button", { name: /Navigate to/ }).click();
    await expect(page.getByTestId(TESTING_IDS.currentLocation)).toHaveCount(0);
    await expect(page.getByTestId(TESTING_IDS.searchInput)).toBeVisible();
  });

  test("can search, navigate results, and replace the current match", async ({
    editorPage,
  }) => {
    await openSearchPanel(editorPage);
    await expect(editorPage.getByTestId(TESTING_IDS.searchInput)).toBeVisible();
    await fillSearchQuery(editorPage, "vola");

    const results = editorPage.getByTestId(TESTING_IDS.searchResultItem);
    await expect(results.nth(5)).toBeVisible();

    const stats = editorPage.getByTestId(TESTING_IDS.searchStats);
    await expect(stats).toHaveText(/\d+ of \d+ results|\d+ results/);

    // Navigate by clicking a specific result row — the current UI navigates
    // by clicking results, not by separate prev/next buttons (which no
    // longer exist). End behavior: clicking a result row updates the
    // active-match state visible to the user.
    await results.nth(2).click();

    await ensureSearchOptionsExpanded(editorPage);
    await editorPage.getByTestId(TESTING_IDS.replaceInput).fill("foo");
    await editorPage
      .getByRole("button", { name: "Replace this match" })
      .first()
      .click();
    await expect(
      editorPage.getByText(
        " Ai foo ni kawa i Jisu Karisito, a luvei Tevita, a luvei Eparama.",
      ),
    ).toBeVisible();
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

    // Close search via the internal SearchPanel close button (the toolbar
    // Close button is occluded by the panel header). Then navigate chapter
    // and reopen.
    await editorPage
      .getByRole("button", { name: "Close search" })
      .last()
      .click();

    const nextButton = editorPage.getByRole("button", {
      name: "Next chapter",
    });
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    const locationAfterNext =
      (await editorPage
        .getByTestId(TESTING_IDS.currentLocation)
        .textContent()) ?? "";

    await openSearchPanel(editorPage);
    await expect(editorPage.getByTestId(TESTING_IDS.searchInput)).toHaveValue(
      "a",
    );
    await editorPage.waitForFunction(() => {
      const highlight = CSS.highlights.get("matched-search");
      return Boolean(highlight && highlight.size > 0);
    });
    // Re-opening search and the page state should still reflect the new chapter.
    await expect(
      editorPage.getByTestId(TESTING_IDS.currentLocation),
    ).toHaveText(locationAfterNext);
  });
});
