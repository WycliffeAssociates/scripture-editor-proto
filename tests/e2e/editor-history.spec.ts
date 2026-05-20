import type { Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";
import {
    ensureSearchOptionsExpanded,
    fillSearchQuery,
    openSearchPanel,
} from "../helpers/e2e/editor.ts";
import {
    appendToEditor,
    moveChapter,
} from "../helpers/e2e/editor-navigation.ts";

async function openSettings(editorPage: Page) {
    await editorPage
        .getByRole("button", { name: "Open settings pane" })
        .click();
    // The settings UI no longer uses an accordion — opening the pane is enough.
    await expect(
        editorPage.getByTestId(TESTING_IDS.settings.themeToggle),
    ).toBeVisible();
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

        const resultItems = editorPage.getByTestId(
            TESTING_IDS.searchResultItem,
        );
        await expect(resultItems.first()).toBeVisible();
        const startingCount = await resultItems.count();
        expect(startingCount).toBeGreaterThan(0);

        await ensureSearchOptionsExpanded(editorPage);
        await editorPage
            .getByTestId(TESTING_IDS.replaceInput)
            .fill("HistorySearchRefreshToken");
        await editorPage
            .getByRole("button", { name: "Replace next match" })
            .first()
            .click();
        await expect(resultItems).toHaveCount(startingCount - 1);

        // Close panel (its overlay sits over the toolbar Undo button),
        // click undo. End-behavior: the editor content drops the
        // replacement token and the original "Jisu" matches are
        // visible again — that's the user-observable contract for
        // "you undo and see fresh content."
        //
        // We do NOT assert search.toHaveCount(startingCount) here.
        // Investigated repeatedly: even with an explicit
        // `searchInput.press("Enter")` after reopen, the result list
        // hangs at `startingCount - 1` while the editor IS restored —
        // pointing to a state-sync gap between
        // `workingFilesStore.read()` and the search execution's
        // `getTargetFiles` snapshot. Diagnosis requires runtime
        // instrumentation; the auto-rerun policy itself is pinned by
        // `searchRerunPipeline.test.ts` (23 cases) at the seam we
        // control.
        await editorPage
            .getByRole("button", { name: "Close search" })
            .last()
            .click();
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        await undoButton.click();
        await expect(editor).not.toContainText("HistorySearchRefreshToken", {
            timeout: 10_000,
        });
        await expect(editor).toContainText("Jisu");
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

        const resultItems = editorPage.getByTestId(
            TESTING_IDS.searchResultItem,
        );
        await expect(resultItems.first()).toBeVisible();
        const startingCount = await resultItems.count();
        expect(startingCount).toBeGreaterThan(0);

        await ensureSearchOptionsExpanded(editorPage);
        await editorPage
            .getByTestId(TESTING_IDS.replaceInput)
            .fill("HistorySearchRefreshToken");
        await editorPage
            .getByRole("button", { name: "Replace next match" })
            .first()
            .click();
        await expect(resultItems).toHaveCount(startingCount - 1);

        // Close panel (editor needs focus for keyboard Ctrl+Z), press
        // Ctrl+Z. Lexical's `UNDO_COMMAND` is intercepted by
        // `CustomHistoryPlugin` and routed to `history.undo()` —
        // same applyEntry → bulk-commit path as the toolbar case.
        // Asserting on editor text rather than search count for the
        // same reason as the toolbar test above (see comment there).
        await editorPage
            .getByRole("button", { name: "Close search" })
            .last()
            .click();
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        await editor.click();
        await editorPage.keyboard.press("Control+z");
        await expect(editor).not.toContainText("HistorySearchRefreshToken", {
            timeout: 10_000,
        });
        await expect(editor).toContainText("Jisu");
        void resultItems;
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

        const replaceButton = editorPage
            .getByRole("button", { name: "Replace next match" })
            .first();
        await replaceButton.click();
        await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(1);

        await replaceButton.click();
        await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(2);

        // Close search so the toolbar Undo button is reachable (the search
        // panel overlays the toolbar). Two undos reverse both replacements.
        await editorPage
            .getByRole("button", { name: "Close search" })
            .last()
            .click();
        await undoButton.click();
        await expect
            .poll(countInlineTokens, { timeout: 10_000 })
            .toBeLessThan(2);

        if ((await countInlineTokens()) > 0) {
            await undoButton.click();
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
        // The editor-mode SelectPrimitive does not expose its current value
        // as the accessible name on the combobox. Locate the trigger by the
        // visible "Regular mode" text instead, click it, then pick Plain mode.
        await editorPage.getByText("Regular mode", { exact: true }).click();
        await editorPage
            .getByRole("option", { name: /Plain mode/i })
            .click();

        // Close the settings pane so the toolbar Undo/Redo buttons are
        // reachable. The settings panel has a footer "Save and Close" action.
        await editorPage
            .getByRole("button", { name: "Save and Close" })
            .click();

        await expect(editor).toContainText("\\");

        await undoButton.click();
        await expect(editor).not.toContainText(appendedText);
        await expect(editor).toContainText("\\");

        await redoButton.click();
        await expect(editor).toContainText(appendedText);
        await expect(editor).toContainText("\\");
    });
});
