import type { Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";
import {
    ensureSearchOptionsExpanded,
    fillSearchQuery,
    openSearchPanel,
} from "./helpers/editor.ts";
import { appendToEditor, moveChapter } from "./helpers/editor-navigation.ts";

async function openSettings(editorPage: Page) {
    await editorPage.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();
    await editorPage
        .getByTestId(TESTING_IDS.settings.accordionControlSettings)
        .click();
}

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
    }, testInfo) => {
        test.skip(
            testInfo.project.name === "Mobile Chrome",
            "Search drawer overlays toolbar interactions in mobile emulation.",
        );

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
    }, testInfo) => {
        test.skip(
            testInfo.project.name === "Mobile Chrome",
            "Search result rows overlay the editor surface in mobile emulation.",
        );

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

    test("replace actions remain undoable", async ({
        editorPage,
    }, testInfo) => {
        test.skip(
            testInfo.project.name === "Mobile Chrome",
            "Undo toolbar interaction is obscured by the search drawer in mobile emulation.",
        );

        const undoButton = editorPage.getByLabel("Undo");
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });

        await openSearchPanel(editorPage);
        await fillSearchQuery(editorPage, "Jisu");
        await ensureSearchOptionsExpanded(editorPage);
        await editorPage
            .getByTestId(TESTING_IDS.replaceInput)
            .fill("INLINE_REPLACE_TOKEN");

        const countInlineTokens = async () => {
            const text = (await editor.textContent()) ?? "";
            return (text.match(/INLINE_REPLACE_TOKEN/g) ?? []).length;
        };

        await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(0);

        await editorPage.getByTestId(TESTING_IDS.replaceButton).click();
        await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(1);

        await editorPage.getByTestId(TESTING_IDS.replaceButton).click();
        await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(2);

        await undoButton.click({ force: true });
        await expect
            .poll(countInlineTokens, { timeout: 10_000 })
            .toBeLessThan(2);

        if ((await countInlineTokens()) > 0) {
            await undoButton.click({ force: true });
        }
        await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(0);
    });

    test("undo and redo preserve plain mode projection after editing in regular", async ({
        editorPage,
    }, testInfo) => {
        test.skip(
            testInfo.project.name === "Mobile Chrome",
            "Settings drawer flow is unstable under mobile emulation.",
        );

        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        const undoButton = editorPage.getByLabel("Undo");
        const redoButton = editorPage.getByLabel("Redo");
        const appendedText = " Plain history ";

        await appendToEditor(editorPage, appendedText);
        await expect(editor).toContainText(appendedText);

        await openSettings(editorPage);
        await editorPage.getByText("Plain", { exact: true }).last().click();
        await editorPage.keyboard.press("Escape");

        await expect(editor).toContainText("\\");

        await undoButton.click();
        await expect(editor).not.toContainText(appendedText);
        await expect(editor).toContainText("\\");

        await redoButton.click();
        await expect(editor).toContainText(appendedText);
        await expect(editor).toContainText("\\");
    });
});
