import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";

test.describe("LintPopover Component", () => {
    test("opens and lists lint issues", async ({ editorPage }) => {
        const triggerButton = editorPage.getByTestId(
            TESTING_IDS.lintPopover.triggerButton,
        );
        await triggerButton.click();
        await expect(
            editorPage.getByTestId(TESTING_IDS.lintPopover.container),
        ).toBeVisible();
        const errorItems = editorPage.getByTestId(
            TESTING_IDS.lintPopover.errorItem,
        );
        const itemCount = await errorItems.count();
        expect(itemCount).toBeGreaterThan(1);

        const firstItem = errorItems.first();
        await expect(
            firstItem.getByTestId(TESTING_IDS.lintPopover.errorSid),
        ).toBeVisible();
        await expect(
            firstItem.getByTestId(TESTING_IDS.lintPopover.errorMessage),
        ).toBeVisible();
    });

    test("navigates to corresponding verse when clicking an issue", async ({
        editorPage,
    }) => {
        const triggerButton = editorPage.getByTestId(
            TESTING_IDS.lintPopover.triggerButton,
        );
        await triggerButton.click();
        await expect(
            editorPage.getByTestId(TESTING_IDS.lintPopover.container),
        ).toBeVisible();

        const firstErrorItem = editorPage
            .getByTestId(TESTING_IDS.lintPopover.errorItem)
            .first();
        await expect(firstErrorItem).toBeVisible();

        const sidElement = firstErrorItem.getByTestId(
            TESTING_IDS.lintPopover.errorSid,
        );
        const sidText = await sidElement.textContent();
        expect(sidText).toMatch(/\w{3}\s+\d+:\d+/);
        if (!sidText) throw new Error("Expected lint SID text");

        await firstErrorItem.click();

        const [, bookCode, chapter] =
            sidText.match(/^(\w{3})\s+(\d+):\d+$/) ?? [];
        if (!bookCode || !chapter) {
            throw new Error(`Invalid SID format: ${sidText}`);
        }

        const referencePicker = editorPage.getByTestId(
            TESTING_IDS.referencePicker,
        );
        await expect(referencePicker).toHaveAttribute(
            "data-test-book-code",
            new RegExp(`^${bookCode}$`, "i"),
        );
        await expect(referencePicker).toHaveAttribute(
            "data-test-current-chapter",
            chapter,
        );
    });
});
