// tests/save.spec.ts
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";
import {
    appendToEditor,
    moveChapter,
    openSaveReview,
} from "./helpers/editor-navigation.ts";

test.describe("Save and Diff Functionality", () => {
    test("review diff can navigate to chapter and revert one change", async ({
        editorPage,
    }) => {
        await appendToEditor(editorPage, " An addition ");
        await moveChapter(editorPage, "next", 2);

        const chap3OriginalContent = await editorPage
            .getByRole("textbox", { name: "USFM Editor" })
            .textContent();
        await appendToEditor(editorPage, " Another addition ");

        await openSaveReview(editorPage);
        const diffItems = editorPage.getByTestId(TESTING_IDS.save.diffItem);
        await expect(diffItems).toHaveCount(2);

        const diffHeader = diffItems
            .first()
            .getByTestId(TESTING_IDS.save.diffSidHeader);
        await expect(diffHeader).toHaveText(/Maciu 1:\d+/);

        const currentPanel = diffItems
            .nth(0)
            .getByTestId(TEST_ID_GENERATORS.diffCurrentPre("current"));
        await expect(currentPanel).toContainText("An addition");

        const goToFirstChapterAgain = diffItems
            .nth(0)
            .getByTestId(`${TESTING_IDS.save.goToChapterButton}`);
        await goToFirstChapterAgain.click();

        const referencePicker = editorPage.getByTestId(
            TESTING_IDS.referencePicker,
        );
        await expect(referencePicker).toHaveAttribute(
            "data-test-current-chapter",
            "1",
        );

        await openSaveReview(editorPage);

        const revertButton = diffItems
            .nth(1)
            .getByTestId(TESTING_IDS.save.revertButton);
        await revertButton.click();
        await expect(diffItems).toHaveCount(1);

        await editorPage.keyboard.press("Escape");
        await moveChapter(editorPage, "next", 2);

        const revertedContent = await editorPage
            .getByRole("textbox", { name: "USFM Editor" })
            .textContent();
        expect(revertedContent).toBe(chap3OriginalContent);
    });

    test("save all persists chapter edits after reload", async ({
        editorPage,
    }) => {
        await appendToEditor(editorPage, " Persisted addition ");
        await openSaveReview(editorPage);

        const diffItems = editorPage.getByTestId(TESTING_IDS.save.diffItem);
        await expect(diffItems).toHaveCount(1);

        const saveAllBtn = editorPage.getByTestId(
            TESTING_IDS.save.saveAllButton,
        );
        await saveAllBtn.click();
        await expect(diffItems).toHaveCount(0);

        await editorPage.reload();

        const textBox = await editorPage
            .getByRole("textbox", { name: "USFM Editor" })
            .textContent();
        expect(textBox?.includes("Persisted addition")).toBe(true);
    });

    test("chapter view renders single full chapter diff with hunk overlays", async ({
        editorPage,
    }) => {
        await appendToEditor(editorPage, " chapter overlay change ");
        await openSaveReview(editorPage);
        const chapterViewLabel = editorPage.getByText("Chapter view").first();
        if (await chapterViewLabel.isVisible()) {
            await chapterViewLabel.click();
        } else if (
            await editorPage
                .getByRole("button", { name: "Controls" })
                .isVisible()
        ) {
            await editorPage.getByRole("button", { name: "Controls" }).click();
            await editorPage
                .getByRole("menuitem", { name: "Chapter view" })
                .click();
        }

        await expect(
            editorPage.getByTestId(TESTING_IDS.save.chapterPanel),
        ).toHaveCount(1);
        await expect(
            editorPage.getByTestId(TESTING_IDS.save.chapterHunkAction).first(),
        ).toBeVisible();
    });
});
