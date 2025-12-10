import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";

test.describe("ContextMenu Plugin", () => {
  test("opens on right-click in editor", async ({ editorPage }) => {
    // Right-click in editor area
    await editorPage
      .getByTestId(TESTING_IDS.mainEditorContainer)
      .click({ button: "right" });

    // Verify context menu appears
    await expect(
      editorPage.getByTestId("context-menu-container"),
    ).toBeVisible();

    // Verify search input is focused
    await expect(
      editorPage.getByTestId("context-menu-search-input"),
    ).toBeFocused();
  });

  test("opens on Ctrl+K keyboard shortcut", async ({ editorPage }) => {
    // Focus editor first
    await editorPage.getByTestId(TESTING_IDS.mainEditorContainer).click();

    // Press Ctrl+K
    await editorPage.keyboard.press("Control+k");

    // Verify context menu appears
    await expect(
      editorPage.getByTestId("context-menu-container"),
    ).toBeVisible();
  });

  test("shows search action when text is selected", async ({
    editorPage: page,
  }) => {
    // 2. Programmatically set the selection using the DOM API
    // This bypasses flaky mouse-drag logic
    await page.evaluate(async () => {
      console.log("async evaulate?");
      // Helper to find the specific text node
      const findTextNode = (text: string) => {
        // Assuming the editor is the active element or finding it by ID/Class
        // You might need to adjust the root selector here
        const root =
          document.querySelector('[contenteditable="true"]') || document.body;
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

      console.log({ textNode });
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
    const searchAction = page.getByTestId(TESTING_IDS.contextMenu.searchAction);
    await expect(searchAction).toBeVisible();

    // Verify the dynamic text matches your Lingui macro output
    await expect(searchAction).toContainText('Find "Jisu"');
  });

  test("search action is hidden when no text selected", async ({
    editorPage,
  }) => {
    // Just click in editor without selecting text
    await editorPage.getByTestId(TESTING_IDS.mainEditorContainer).click();

    // Right-click to open context menu
    await editorPage
      .getByTestId(TESTING_IDS.mainEditorContainer)
      .click({ button: "right" });

    // Verify search action is NOT present
    await expect(
      editorPage.getByTestId("context-menu-search-action"),
    ).not.toBeAttached();
  });

  test("closes on escape key", async ({ editorPage }) => {
    // Open context menu
    await editorPage
      .getByTestId(TESTING_IDS.mainEditorContainer)
      .click({ button: "right" });

    // Verify it's open
    await expect(
      editorPage.getByTestId("context-menu-container"),
    ).toBeVisible();

    // Press escape
    await editorPage.keyboard.press("Escape");

    // Verify it's closed
    await expect(
      editorPage.getByTestId("context-menu-container"),
    ).not.toBeVisible();
  });

  test("closes on click outside", async ({ editorPage }) => {
    // Open context menu
    await editorPage
      .getByTestId(TESTING_IDS.mainEditorContainer)
      .click({ button: "right" });

    // Verify it's open
    await expect(
      editorPage.getByTestId("context-menu-container"),
    ).toBeVisible();

    // Click outside (on page body)
    await editorPage.locator("body").click({ position: { x: 10, y: 10 } });

    // Verify it's closed
    await expect(
      editorPage.getByTestId("context-menu-container"),
    ).not.toBeVisible();
  });
});
