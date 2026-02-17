import { expect, type Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";

export async function appendToEditor(page: Page, text: string) {
    const editor = page.getByRole("textbox", { name: "USFM Editor" });
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(text);
}

export async function moveChapter(
    page: Page,
    direction: "next" | "prev",
    count = 1,
) {
    const buttonId =
        direction === "next"
            ? TESTING_IDS.navigation.nextChapterButton
            : TESTING_IDS.navigation.prevChapterButton;
    for (let i = 0; i < count; i++) {
        await page.getByTestId(buttonId).click();
    }
}

export async function openSaveReview(page: Page) {
    const trigger = page.getByTestId(TESTING_IDS.save.trigger);
    await trigger.click();
    await expect(page.getByTestId(TESTING_IDS.save.modal)).toBeVisible();
}
