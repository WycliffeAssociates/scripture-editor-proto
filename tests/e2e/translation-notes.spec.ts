import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";
import {
    gotoCreate,
    importDirectoryProject,
    MOCK_DIRS,
} from "../helpers/e2e/project-import.ts";

test.describe("Translation Notes import verification", () => {
    test("web import surfaces progress and the packed TN resource is usable in the reference panel", async ({
        editorPage: page,
    }, testInfo) => {
        test.skip(
            testInfo.project.name !== "chromium",
            "TN import verification is only stable in Chromium.",
        );

        testInfo.setTimeout(120_000);

        await gotoCreate(page);
        await importDirectoryProject(page, MOCK_DIRS.enTnCondensed, 120_000);

        await expect(
            page
                .getByRole("alert")
                .filter({
                    hasText: "Packing translation notes into per-book JSON",
                })
                .first(),
        ).toBeVisible({ timeout: 120_000 });
        await expect(
            page
                .getByRole("alert")
                .filter({
                    hasText:
                        "Resource imported successfully! It is available in the reference picker.",
                })
                .first(),
        ).toBeVisible({ timeout: 120_000 });

        await page.goto("/llx_reg", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId(TESTING_IDS.mainEditorContainer)).toBeVisible();

        await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
        await page
            .getByTestId(TESTING_IDS.referenceProjectDropdown)
            .waitFor({ state: "visible" });
        await expect(
            page
                .getByTestId(TESTING_IDS.referenceProjectItem)
                .filter({ hasText: "English Translation Notes Condensed" })
                .first(),
        ).toBeVisible();
        await page
            .getByTestId(TESTING_IDS.referenceProjectItem)
            .filter({ hasText: "English Translation Notes Condensed" })
            .first()
            .click();

        const referencePicker = page.getByTestId(TESTING_IDS.referencePicker);
        await referencePicker.click();
        await page.getByTestId(TESTING_IDS.reference.pickerSearchInput).fill("LUK 22");
        await page.keyboard.press("Enter");

        await expect(
            page.getByTestId(TESTING_IDS.refEditorContainer),
        ).toContainText("Why do we still need a witness?", {
            timeout: 30_000,
        });
        await expect(
            page.getByTestId(TESTING_IDS.refEditorContainer),
        ).toContainText('"We have no further need for witnesses!"', {
            timeout: 30_000,
        });
    });
});
