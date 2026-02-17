import { expect, type Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";

export async function openActionPalette(page: Page) {
    await page.getByRole("textbox", { name: "USFM Editor" }).click();
    await page.keyboard.press("Control+k");
    await expect(
        page.getByTestId(TESTING_IDS.contextMenu.container),
    ).toBeVisible();
}

export async function openReferencePicker(page: Page) {
    const referencePicker = page.getByTestId(TESTING_IDS.referencePicker);
    await referencePicker.click();
    return referencePicker;
}

export async function getReferencePickerState(page: Page) {
    const referencePicker = page.getByTestId(TESTING_IDS.referencePicker);
    const bookCode = await referencePicker.getAttribute("data-test-book-code");
    const chapter = await referencePicker.getAttribute(
        "data-test-current-chapter",
    );
    return { referencePicker, bookCode, chapter };
}

export async function openSearchPanel(page: Page) {
    await page.getByTestId(TESTING_IDS.searchTrigger).click();
}

export async function fillSearchQuery(page: Page, query: string) {
    const searchInput = page.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill(query);
    return searchInput;
}

export async function ensureSearchOptionsExpanded(page: Page) {
    const replaceInput = page.getByTestId(TESTING_IDS.replaceInput);
    if (await replaceInput.isVisible()) return;

    await page.getByRole("button", { name: /options/i }).click();
    await expect(replaceInput).toBeVisible();
}
