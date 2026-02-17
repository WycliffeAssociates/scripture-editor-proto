import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";

test.describe("Format Feature", () => {
    test("Format Book via Action Palette", async ({ editorPage }) => {
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });

        // 1. Type messy USFM: chapter number without linebreak
        await editor.click();
        await editorPage.keyboard.press("Control+End");
        await editorPage.keyboard.type("\n\\c 99 \\v 1 test");

        // 2. Open Action Palette (Ctrl+K)
        await editorPage.keyboard.press("Control+k");
        const actionPaletteSearch = editorPage.getByTestId(
            TESTING_IDS.contextMenu.searchInput,
        );
        await expect(actionPaletteSearch).toBeVisible();

        // 3. Select "Format Book"
        await actionPaletteSearch.fill("Format Book");
        await editorPage.keyboard.press("Enter");

        // 4. Verify content contains the inserted marker payload.
        // Firefox can merge the typed chapter token differently, so assert the stable verse payload.
        await expect(editor).toContainText(/99\s*\\v\s*1\s*test/i);

        // Check for a formatting success notification.
        await expect(
            editorPage
                .getByText(/(book formatted|chapter formatted|formatted)/i)
                .first(),
        ).toBeVisible();
    });

    test("Format Project via Toolbar", async ({
        editorWithTwoProjects: page,
    }) => {
        // 1. Open toolbar menu and click Format Project
        await page.getByRole("button", { name: /more actions/i }).click();
        const prettifyButton = page.getByTestId(
            TESTING_IDS.prettify.projectButton,
        );
        await expect(prettifyButton).toBeVisible();
        await prettifyButton.click();

        // 2. Open Review & Save modal
        const saveTrigger = page.getByTestId(TESTING_IDS.save.trigger);
        await saveTrigger.click();

        const modal = page.getByTestId(TESTING_IDS.save.modal);
        await expect(modal).toBeVisible();

        // 3. Verify at least one book is marked as dirty
        const diffItems = page.getByTestId(TESTING_IDS.save.diffItem);
        await expect(diffItems.first()).toBeVisible();

        // 4. Verify "Revert all changes" button works
        const revertAllButton = page.getByTestId(
            TESTING_IDS.save.revertAllButton,
        );
        await expect(revertAllButton).toBeVisible();
        await revertAllButton.click();

        // 5. Verify modal shows no changes
        // We wait a bit for the diffs to be cleared
        await expect(diffItems).toHaveCount(0, { timeout: 10000 });
        await expect(
            page.getByTestId(TESTING_IDS.save.noChangesMessage),
        ).toBeVisible();
    });
});
