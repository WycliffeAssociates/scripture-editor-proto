import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";

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

        // 4. Verify the typed payload survived the format. Typed marker
        // bytes become REAL structure now (upstream format extracts the
        // markers, the editor pairs them into numbered nodes), so the
        // literal "\v" is no longer visible text in regular mode — assert
        // the chapter number and verse payload render instead.
        await expect(editor).toContainText(/99/);
        await expect(editor).toContainText(/1\s*test/i);

        // Check for a formatting success notification.
        await expect(
            editorPage
                .getByText(/(book formatted|chapter formatted|formatted)/i)
                .first(),
        ).toBeVisible();
    });

    test("Format Project via Action Palette", async ({
        editorWithTwoProjects: page,
    }) => {
        // The "Format Project" action is no longer in a toolbar overflow menu;
        // it is reachable via the Action Palette (Ctrl+K) like other commands.
        await page.getByRole("textbox", { name: "USFM Editor" }).click();
        await page.keyboard.press("Control+k");
        const actionPaletteSearch = page.getByTestId(
            TESTING_IDS.contextMenu.searchInput,
        );
        await expect(actionPaletteSearch).toBeVisible();
        await actionPaletteSearch.fill("Format Project");
        await page.keyboard.press("Enter");

        // 2. Open Review & Save modal
        await page.getByRole("button", { name: "Save" }).first().click();

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
