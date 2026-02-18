import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";
import {
    ensureSearchOptionsExpanded,
    fillSearchQuery,
    openSearchPanel,
} from "./helpers/editor.ts";
import { appendToEditor, moveChapter } from "./helpers/editor-navigation.ts";

test.describe("Editor History", () => {
    test("manual typing can undo and redo", async ({ editorPage }) => {
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        const undoButton = editorPage.getByLabel("Undo");
        const redoButton = editorPage.getByLabel("Redo");
        const appendedText = " History smoke ";

        const original = await editor.textContent();
        await appendToEditor(editorPage, appendedText);
        await expect(editor).toContainText(appendedText);

        await expect(undoButton).toBeEnabled();
        await undoButton.click();
        await expect(editor).toHaveText(original || "");

        await expect(redoButton).toBeEnabled();
        await redoButton.click();
        await expect(editor).toContainText(appendedText);
    });

    test("undo notice only appears for off-screen chapter edits", async ({
        editorPage,
    }) => {
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        const undoButton = editorPage.getByLabel("Undo");
        const redoButton = editorPage.getByLabel("Redo");
        const appendedText = " History notice ";

        await appendToEditor(editorPage, appendedText);
        await expect(editor).toContainText(appendedText);

        await undoButton.click();
        await expect(editor).not.toContainText(appendedText);
        await expect(editorPage.getByText(/Undid last edit in/i)).toHaveCount(
            0,
        );
        await redoButton.click();
        await expect(editor).toContainText(appendedText);

        await moveChapter(editorPage, "next");
        await undoButton.click();
        await expect(
            editorPage.getByText(/Undid last edit in .* 1/i).first(),
        ).toBeVisible();
    });

    test("undo keeps editor ready for immediate typing", async ({
        editorPage,
    }) => {
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        const undoButton = editorPage.getByLabel("Undo");
        const appendedText = " Selection restore ";
        const selectionMarker = "§§SEL§§";
        await editor.click();
        await editorPage.keyboard.press("Control+End");
        await editorPage.keyboard.type(appendedText);
        await editorPage.keyboard.press("Control+Home");
        await undoButton.click();
        await editor.focus();
        await editorPage.keyboard.type(selectionMarker);

        const afterUndoTyping = (await editor.textContent()) ?? "";
        expect(afterUndoTyping).toContain(selectionMarker);
    });

    test("reruns search when undo happens with search pane open", async ({
        editorPage,
    }) => {
        const undoButton = editorPage.getByLabel("Undo");

        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "Jisu");

        const resultsContainer = editorPage.getByTestId(
            TESTING_IDS.searchResultsContainer,
        );
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            /[1-9]\d*/,
        );
        const startingCount = Number(
            await resultsContainer.getAttribute("data-num-search-results"),
        );

        await ensureSearchOptionsExpanded(editorPage);
        await editorPage
            .getByTestId(TESTING_IDS.replaceInput)
            .fill("HistorySearchRefreshToken");
        await editorPage.getByTestId(TESTING_IDS.replaceButton).click();
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            String(startingCount - 1),
        );

        await undoButton.click();
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            String(startingCount),
        );
    });

    test("reruns search when keyboard undo happens in editor", async ({
        editorPage,
    }) => {
        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "Jisu");

        const resultsContainer = editorPage.getByTestId(
            TESTING_IDS.searchResultsContainer,
        );
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            /[1-9]\d*/,
        );
        const startingCount = Number(
            await resultsContainer.getAttribute("data-num-search-results"),
        );

        await ensureSearchOptionsExpanded(editorPage);
        await editorPage
            .getByTestId(TESTING_IDS.replaceInput)
            .fill("HistorySearchRefreshToken");
        await editorPage.getByTestId(TESTING_IDS.replaceButton).click();
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            String(startingCount - 1),
        );

        await editorPage.getByRole("textbox", { name: "USFM Editor" }).click();
        await editorPage.keyboard.press("Control+z");
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            String(startingCount),
        );
    });

    test("inline replace popup creates one undo step per click", async ({
        editorPage,
    }) => {
        const undoButton = editorPage.getByLabel("Undo");

        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "of");
        await ensureSearchOptionsExpanded(editorPage);
        await editorPage
            .getByTestId(TESTING_IDS.replaceInput)
            .fill("INLINE_REPLACE_TOKEN");

        const resultsContainer = editorPage.getByTestId(
            TESTING_IDS.searchResultsContainer,
        );
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            /(?:[2-9]|[1-9]\d+)/,
        );
        const startingCount = Number(
            await resultsContainer.getAttribute("data-num-search-results"),
        );

        const firstTrigger = editorPage
            .getByTestId(TESTING_IDS.searchInlineReplaceTrigger)
            .first();
        await firstTrigger.hover();
        await expect(
            editorPage
                .getByTestId(TESTING_IDS.searchInlineReplaceButton)
                .first(),
        ).toBeVisible();
        await editorPage
            .getByTestId(TESTING_IDS.searchInlineReplaceButton)
            .first()
            .click();
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            String(startingCount - 1),
        );

        const secondTrigger = editorPage
            .getByTestId(TESTING_IDS.searchInlineReplaceTrigger)
            .first();
        await secondTrigger.hover();
        await expect(
            editorPage
                .getByTestId(TESTING_IDS.searchInlineReplaceButton)
                .first(),
        ).toBeVisible();
        await editorPage
            .getByTestId(TESTING_IDS.searchInlineReplaceButton)
            .first()
            .click();
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            String(startingCount - 2),
        );

        await undoButton.click();
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            String(startingCount - 1),
        );

        await undoButton.click();
        await expect(resultsContainer).toHaveAttribute(
            "data-num-search-results",
            String(startingCount),
        );
    });
});
