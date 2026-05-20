import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";

test.describe("LintPopover Component", () => {
    test("opens and lists lint issues", async ({ editorPage }) => {
        const triggerButton = editorPage.getByTestId(
            TESTING_IDS.lintPopover.triggerButton,
        );
        await triggerButton.click();
        await expect(
            editorPage.getByTestId(TESTING_IDS.lintPopover.container),
        ).toBeVisible();

        // Default scope is the current chapter, which may have no issues. The
        // empty-state shows "View N project issues" — click it to expand scope
        // to the entire project so the test can assert on a non-empty list.
        const viewAll = editorPage.getByRole("button", {
            name: /View \d+ project issues/i,
        });
        if (await viewAll.isVisible().catch(() => false)) {
            await viewAll.click();
        }

        const errorItems = editorPage.getByTestId(
            TESTING_IDS.lintPopover.errorItem,
        );
        await expect(errorItems.first()).toBeVisible();
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

        // Expand scope to the project so we have at least one issue to click.
        const viewAll = editorPage.getByRole("button", {
            name: /View \d+ project issues/i,
        });
        if (await viewAll.isVisible().catch(() => false)) {
            await viewAll.click();
        }

        const firstErrorItem = editorPage
            .getByTestId(TESTING_IDS.lintPopover.errorItem)
            .first();
        await expect(firstErrorItem).toBeVisible();

        const sidElement = firstErrorItem.getByTestId(
            TESTING_IDS.lintPopover.errorSid,
        );
        const sidText = await sidElement.textContent();
        // The issue row now renders a localized book name (e.g. "Maciu 19:30"),
        // not a 3-letter code. Accept any non-empty book label.
        expect(sidText).toMatch(/.+\s+\d+:\d+/);
        if (!sidText) throw new Error("Expected lint SID text");

        await firstErrorItem.click();

        const match = sidText.match(/^(.+?)\s+(\d+):\d+$/);
        if (!match || !match[1] || !match[2]) {
            throw new Error(`Invalid SID format: ${sidText}`);
        }
        const [, bookLabel, chapter] = match;

        // Clicking the issue navigates the editor to the issue's book/chapter.
        // Assert via the visible toolbar location text (book label + chapter).
        const mainLocation = editorPage.getByTestId(
            TESTING_IDS.currentLocation,
        );
        await expect(mainLocation).toContainText(bookLabel);
        await expect(mainLocation).toContainText(chapter);
    });
});
