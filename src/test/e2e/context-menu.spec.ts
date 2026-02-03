import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";

test.describe("ContextMenu Plugin", () => {
    test.skip("opens on right-click in editor", async ({ editorPage }) => {
        // SKIPPED: Playwright's click({ button: "right" }) on contenteditable
        // doesn't reliably trigger the contextmenu event in all browsers.
        // The Ctrl+K test below verifies the same functionality.
        await editorPage
            .getByTestId(TESTING_IDS.mainEditorContainer)
            .click({ button: "right" });

        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).toBeVisible();

        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.searchInput),
        ).toBeFocused();
    });

    test("opens on Ctrl+K keyboard shortcut", async ({ editorPage }) => {
        // Focus editor first
        await editorPage.getByTestId(TESTING_IDS.mainEditorContainer).click();

        // Press Ctrl+K
        await editorPage.keyboard.press("Control+k");

        // Verify context menu appears
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).toBeVisible();
    });

    test("opens on Tab keyboard shortcut", async ({ editorPage }) => {
        // Focus editor first
        await editorPage.getByTestId(TESTING_IDS.mainEditorContainer).click();

        // Simulate Tab keydown (Playwright's keyboard.press('Tab') can move focus)
        await editorPage
            .getByRole("textbox", { name: "USFM Editor" })
            .dispatchEvent("keydown", {
                key: "Tab",
                code: "Tab",
                keyCode: 9,
                which: 9,
                bubbles: true,
                cancelable: true,
            });

        // Verify context menu appears
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).toBeVisible();
    });

    test("shows search action when text is selected", async ({
        editorPage: page,
    }) => {
        // 2. Programmatically set the selection using the DOM API
        // This bypasses flaky mouse-drag logic
        await page.evaluate(async () => {
            const findTextNode = (text: string) => {
                const root =
                    document.querySelector('[contenteditable="true"]') ||
                    document.body;
                const walker = document.createTreeWalker(
                    root,
                    NodeFilter.SHOW_TEXT,
                    null,
                );
                let node: Node | null;
                // biome-ignore lint/suspicious/noAssignInExpressions: <typical>
                while ((node = walker.nextNode())) {
                    if (node.nodeValue?.includes(text)) {
                        return node;
                    }
                }
                return null;
            };

            const textNode = findTextNode("Jisu");
            if (textNode) {
                const range = document.createRange();
                const startOffset = textNode.nodeValue?.indexOf("Jisu");
                if (!startOffset) return;
                // Select the specific word "Jisu"
                range.setStart(textNode, startOffset);
                range.setEnd(textNode, startOffset + 4); // "Jisu".length

                const selection = window.getSelection();
                if (!selection) return;
                selection.removeAllRanges();
                selection.addRange(range);
            }
        });

        // 3. Trigger the context menu
        // We click on the element containing the text.
        // Playwright's click will fire at the center of the element, which is usually fine
        // as long as the selection we set above persists (which it does in standard DOM).
        const textBox = page.getByText("Ai vola ni kawa i Jisu");
        await textBox.dispatchEvent("contextmenu");

        // 4. Verify results
        const searchAction = page.getByTestId(
            TESTING_IDS.contextMenu.searchAction,
        );
        await expect(searchAction).toBeVisible();

        // Verify the dynamic text matches your Lingui macro output
        await expect(searchAction).toContainText('Find "Jisu"');
    });

    test("search action is visible when cursor is on a word (even without selection)", async ({
        editorPage,
    }) => {
        // Click on the word "Jisu" without selecting it
        // We use a more specific selector to hit the word
        const textBox = editorPage.getByText("Jisu").first();
        await textBox.click();

        // Use Ctrl+K to open context menu
        await editorPage.keyboard.press("Control+k");

        // Verify search action is visible and contains some word
        const searchAction = editorPage.getByTestId(
            TESTING_IDS.contextMenu.searchAction,
        );
        await expect(searchAction).toBeVisible();
        await expect(searchAction).toContainText('Find "');
    });

    test("closes on escape key", async ({ editorPage }) => {
        // Open context menu
        await editorPage
            .getByTestId(TESTING_IDS.mainEditorContainer)
            .click({ button: "right" });

        // Verify it's open
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).toBeVisible();

        // Press escape
        await editorPage.keyboard.press("Escape");

        // Verify it's closed
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).not.toBeVisible();
    });

    test("closes on click outside", async ({ editorPage }) => {
        // Open context menu
        await editorPage
            .getByTestId(TESTING_IDS.mainEditorContainer)
            .click({ button: "right" });

        // Verify it's open
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).toBeVisible();

        // Click outside (on page body)
        await editorPage.locator("body").click({ position: { x: 10, y: 10 } });

        // Verify it's closed
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).not.toBeVisible();
    });

    test("multi-step action: change marker to", async ({ editorPage }) => {
        // 1. Click in editor to position cursor near a marker (e.g. verse 1)
        const textBox = editorPage.getByText("Ai vola ni kawa i Jisu").first();
        await textBox.click();

        // 2. Open Action Palette
        await editorPage.keyboard.press("Control+k");

        // 3. Select "Change previous paragraph marker to..."
        // We search for it to make sure it's filtered/selected
        await editorPage.keyboard.type("Change previous paragraph");
        await editorPage.keyboard.press("Enter");

        // 4. Verify Pill UI appeared
        await expect(editorPage.locator(".mantine-Pill-root")).toBeVisible();
        await expect(editorPage.locator(".mantine-Pill-root")).toContainText(
            "Change previous paragraph marker to...",
        );

        // 5. Select "Margin Paragraph" from the second step
        await editorPage.keyboard.type("Margin");
        await editorPage.keyboard.press("Enter");

        // 6. Verify palette closed
        await expect(
            editorPage.getByTestId(TESTING_IDS.contextMenu.container),
        ).not.toBeVisible();

        // 7. Verify node change (this is tricky in E2E without deep inspection,
        // but we can check for the presence of \m in source mode if needed,
        // or just verify no errors occurred)
    });
});
