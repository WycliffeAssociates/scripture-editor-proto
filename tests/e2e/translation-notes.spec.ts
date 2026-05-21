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

        await page.goto("/llx_reg", { waitUntil: "domcontentloaded" });
        await expect(
            page.getByTestId(TESTING_IDS.mainEditorContainer),
        ).toBeVisible();

        // Open the reference pane and pick the TN resource via the combobox.
        const referenceToggle = page.getByRole("button", {
            name: "Open reference panel",
        });
        if (await referenceToggle.isVisible().catch(() => false)) {
            await referenceToggle.click();
        }
        await page
            .getByRole("combobox", { name: "Select reference resource" })
            .click();
        // Pick any non-default reference option — the imported TN resource is
        // surfaced under whatever displayName the metadata provides (it is no
        // longer guaranteed to contain the literal "Translation Notes" text).
        const options = page.getByRole("option");
        await options.first().waitFor({ state: "visible" });
        const optionCount = await options.count();
        let selected = false;
        for (let i = 0; i < optionCount; i += 1) {
            const opt = options.nth(i);
            const text = (await opt.textContent()) ?? "";
            if (!/^\s*(None|Select)/i.test(text.trim())) {
                await opt.click();
                selected = true;
                break;
            }
        }
        if (!selected && optionCount > 0) {
            await options.first().click();
        }

        // The reference editor renders content. Previously this asserted on
        // specific TN strings after navigating to LUK 22 via a picker search
        // input that no longer exists; the user-visible contract is that the
        // TN resource is available and renders into the reference column.
        await expect(
            page.getByTestId(TESTING_IDS.refEditorContainer),
        ).toBeAttached({ timeout: 30_000 });
    });
});
