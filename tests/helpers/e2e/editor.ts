import { expect, type Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";

export async function openActionPalette(page: Page) {
    await page.getByRole("textbox", { name: "USFM Editor" }).click();
    await page.keyboard.press("Control+k");
    await expect(
        page.getByTestId(TESTING_IDS.contextMenu.container),
    ).toBeVisible();
}

export async function openSearchPanel(page: Page) {
    await page.getByRole("button", { name: "Open search" }).click();
}

export async function fillSearchQuery(page: Page, query: string) {
    const searchInput = page.getByTestId(TESTING_IDS.searchInput);
    await searchInput.fill(query);
    return searchInput;
}

export async function ensureSearchOptionsExpanded(page: Page) {
    const replaceInput = page.getByTestId(TESTING_IDS.replaceInput);
    await expect(replaceInput).toBeVisible();
}
