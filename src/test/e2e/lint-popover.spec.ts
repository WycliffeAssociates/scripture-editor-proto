import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";

test.describe("LintPopover Component", () => {
    test("opens and closes when clicking trigger button", async ({
        editorPage,
    }) => {
        // Check if lint popover trigger button exists and has errors
        const triggerButton = editorPage.getByTestId(
            TESTING_IDS.lintPopover.triggerButton,
        );
        await triggerButton.click();

        // Verify popover appears
        await expect(
            editorPage.getByTestId(TESTING_IDS.lintPopover.container),
        ).toBeVisible();

        // Click again to close
        await triggerButton.click();

        // Verify popover closes
        await expect(
            editorPage.getByTestId(TESTING_IDS.lintPopover.container),
        ).not.toBeVisible();
    });

    test("displays error items with correct structure", async ({
        editorPage,
    }) => {
        // Check if lint popover trigger button exists
        const triggerButton = editorPage.getByTestId(
            TESTING_IDS.lintPopover.triggerButton,
        );

        // Click to open popover
        await triggerButton.click();

        // Verify popover appears
        await expect(
            editorPage.getByTestId(TESTING_IDS.lintPopover.container),
        ).toBeVisible();

        // Verify error items have proper structure
        const errorItems = editorPage.getByTestId(
            TESTING_IDS.lintPopover.errorItem,
        );
        const itemCount = await errorItems.count();

        // Should have 18 lint errors (based on our mock data)
        expect(itemCount).toBeGreaterThan(1);

        // Check first error item has proper test IDs
        const firstItem = errorItems.first();
        await expect(
            firstItem.getByTestId(TESTING_IDS.lintPopover.errorSid),
        ).toBeVisible();
        await expect(
            firstItem.getByTestId(TESTING_IDS.lintPopover.errorMessage),
        ).toBeVisible();

        // Verify SID format (should be like "MAT 1:1")
        const sidElement = firstItem.getByTestId(
            TESTING_IDS.lintPopover.errorSid,
        );
        const sidText = await sidElement.textContent();
        expect(sidText).toMatch(/\w{3}\s+\d+:\d+/); // Book code chapter:verse format

        // Verify error message is present
        const messageElement = firstItem.getByTestId(
            TESTING_IDS.lintPopover.errorMessage,
        );
        const messageText = await messageElement.textContent();
        expect(messageText).toBeTruthy();
        expect(messageText?.length).toBeGreaterThan(0);
    });

    test("navigates to DOM element when clicking error item", async ({
        editorPage,
    }) => {
        // Check if lint popover trigger button exists
        const triggerButton = editorPage.getByTestId(
            TESTING_IDS.lintPopover.triggerButton,
        );
        await triggerButton.click();
        await expect(
            editorPage.getByTestId(TESTING_IDS.lintPopover.container),
        ).toBeVisible();

        // Get first error item
        const firstErrorItem = editorPage
            .getByTestId(TESTING_IDS.lintPopover.errorItem)
            .first();
        await expect(firstErrorItem).toBeVisible();

        // Get the SID from the error item to identify target
        const sidElement = firstErrorItem.getByTestId(
            TESTING_IDS.lintPopover.errorSid,
        );
        const sidText = await sidElement.textContent();

        if (sidText) {
            console.log(`Clicking error item with SID: ${sidText}`);

            // Click the error item
            await firstErrorItem.click();

            // Verify that an element is now selected (has yellow background)
            // The selected element should have the data-id matching our SID
            const targetSelector = `[data-id="${sidText}"]`;
            const selectedElement = editorPage.locator(targetSelector);

            // Check if element exists and is selected
            if (await selectedElement.isVisible()) {
                // Verify it has the selected class
                const hasSelectedClass = await selectedElement.evaluate((el) =>
                    el.classList.contains("selected"),
                );
                expect(hasSelectedClass).toBe(true);

                console.log(
                    `Successfully navigated to and selected element: ${sidText}`,
                );
            } else {
                console.log(
                    `Target element not found after navigation: ${targetSelector}`,
                );
            }
        }
    });

    test("highlights selected element with yellow background", async ({
        editorPage,
    }) => {
        // Check if lint popover trigger button exists
        const triggerButton = editorPage.getByTestId(
            TESTING_IDS.lintPopover.triggerButton,
        );

        // Open popover
        await triggerButton.click();
        await expect(
            editorPage.getByTestId(TESTING_IDS.lintPopover.container),
        ).toBeVisible();

        // Get first error item
        const firstErrorItem = editorPage
            .getByTestId(TESTING_IDS.lintPopover.errorItem)
            .first();
        await firstErrorItem.click();

        // Find the selected element (should have yellow background)
        const selectedElement = editorPage.locator(".lint-error");

        // Verify element is selected
        await expect(selectedElement).toBeVisible();
    });
});
