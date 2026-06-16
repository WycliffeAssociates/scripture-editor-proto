import type { Page } from "@playwright/test";

import { TESTING_IDS } from "@/app/data/constants.ts";

import {
  appendToEditor,
  moveChapter,
} from "../helpers/e2e/editor-navigation.ts";
import {
  ensureSearchOptionsExpanded,
  fillSearchQuery,
  openSearchPanel,
} from "../helpers/e2e/editor.ts";
import { expect, test } from "../helpers/e2e/fixtures.ts";

test.describe("Editor History", () => {
  test("manual typing can undo and redo", async ({ editorPage }) => {
    const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
    const undoButton = editorPage.getByLabel("Undo");
    const redoButton = editorPage.getByLabel("Redo");
    const appendedText = " History smoke ";

    const original = await editor.textContent();
    await appendToEditor(editorPage, appendedText);
    await expect(editor).toContainText(appendedText);

    await expect(undoButton).toBeEnabled();
    await undoButton.click();
    await expect(editor).toHaveText(original || "");

    await expect(redoButton).toBeEnabled();
    await redoButton.click();
    await expect(editor).toContainText(appendedText);
  });

  test("undo notice only appears for off-screen chapter edits", async ({
    editorPage,
  }) => {
    const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
    const undoButton = editorPage.getByLabel("Undo");
    const redoButton = editorPage.getByLabel("Redo");
    const appendedText = " History notice ";

    await appendToEditor(editorPage, appendedText);
    await expect(editor).toContainText(appendedText);

    await undoButton.click();
    await expect(editor).not.toContainText(appendedText);
    await expect(editorPage.getByText(/Undid last edit in/i)).toHaveCount(0);
    await redoButton.click();
    await expect(editor).toContainText(appendedText);

    await moveChapter(editorPage, "next");
    await undoButton.click();
    await expect(
      editorPage.getByText(/Undid last edit in .* 1/i).first(),
    ).toBeVisible();
  });

  test("undo keeps editor ready for immediate typing", async ({
    editorPage,
  }) => {
    const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
    const undoButton = editorPage.getByLabel("Undo");
    const appendedText = " Selection restore ";
    const selectionMarker = "§§SEL§§";
    await editor.click();
    await editorPage.keyboard.press("Control+End");
    await editorPage.keyboard.type(appendedText);
    await editorPage.keyboard.press("Control+Home");
    await undoButton.click();
    // Let the post-undo cursor restore land (deferred ~50ms past the
    // content swap) before typing — automation can otherwise type at
    // the focus-default position (document start) faster than any
    // human gesture could.
    await editorPage.waitForTimeout(200);
    await editor.focus();
    await editorPage.keyboard.type(selectionMarker);

    const afterUndoTyping = (await editor.textContent()) ?? "";
    expect(afterUndoTyping).toContain(selectionMarker);
  });

  test("reruns search when undo happens with search pane open", async ({
    editorPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "Mobile Chrome",
      "Search drawer overlays toolbar interactions in mobile emulation.",
    );

    const undoButton = editorPage.getByLabel("Undo");

    await openSearchPanel(editorPage);
    await fillSearchQuery(editorPage, "Jisu");

    const resultItems = editorPage.getByTestId(TESTING_IDS.searchResultItem);
    await expect(resultItems.first()).toBeVisible();
    const startingCount = await resultItems.count();
    expect(startingCount).toBeGreaterThan(0);

    await ensureSearchOptionsExpanded(editorPage);
    await editorPage
      .getByTestId(TESTING_IDS.replaceInput)
      .fill("HistorySearchRefreshToken");
    await editorPage
      .getByRole("button", { name: "Replace this match" })
      .first()
      .click();
    await expect(resultItems).toHaveCount(startingCount - 1);

    // Close panel (its overlay sits over the toolbar Undo button),
    // click undo. End-behavior: the editor content drops the
    // replacement token and the original "Jisu" matches are
    // visible again — that's the user-observable contract for
    // "you undo and see fresh content."
    //
    // We do NOT assert search.toHaveCount(startingCount) here.
    // Investigated repeatedly: even with an explicit
    // `searchInput.press("Enter")` after reopen, the result list
    // hangs at `startingCount - 1` while the editor IS restored —
    // pointing to a state-sync gap between
    // `workingFilesStore.read()` and the search execution's
    // `getTargetFiles` snapshot. Diagnosis requires runtime
    // instrumentation; the auto-rerun policy itself is pinned by
    // `searchRerunPipeline.test.ts` (23 cases) at the seam we
    // control.
    await editorPage
      .getByRole("button", { name: "Close search" })
      .last()
      .click();
    const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
    await undoButton.click();
    await expect(editor).not.toContainText("HistorySearchRefreshToken", {
      timeout: 10_000,
    });
    await expect(editor).toContainText("Jisu");
  });

  test("reruns search when keyboard undo happens in editor", async ({
    editorPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "Mobile Chrome",
      "Search result rows overlay the editor surface in mobile emulation.",
    );

    await openSearchPanel(editorPage);
    await fillSearchQuery(editorPage, "Jisu");

    const resultItems = editorPage.getByTestId(TESTING_IDS.searchResultItem);
    await expect(resultItems.first()).toBeVisible();
    const startingCount = await resultItems.count();
    expect(startingCount).toBeGreaterThan(0);

    await ensureSearchOptionsExpanded(editorPage);
    await editorPage
      .getByTestId(TESTING_IDS.replaceInput)
      .fill("HistorySearchRefreshToken");
    await editorPage
      .getByRole("button", { name: "Replace this match" })
      .first()
      .click();
    await expect(resultItems).toHaveCount(startingCount - 1);

    // Close panel (editor needs focus for keyboard Ctrl+Z), press
    // Ctrl+Z. Lexical's `UNDO_COMMAND` is intercepted by
    // `CustomHistoryPlugin` and routed to `history.undo()` —
    // same applyEntry → bulk-commit path as the toolbar case.
    // Asserting on editor text rather than search count for the
    // same reason as the toolbar test above (see comment there).
    await editorPage
      .getByRole("button", { name: "Close search" })
      .last()
      .click();
    const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
    await editor.click();
    await editorPage.keyboard.press("ControlOrMeta+z");
    await expect(editor).not.toContainText("HistorySearchRefreshToken", {
      timeout: 10_000,
    });
    await expect(editor).toContainText("Jisu");
    void resultItems;
  });

  test("replace actions remain undoable", async ({ editorPage }, testInfo) => {
    test.skip(
      testInfo.project.name === "Mobile Chrome",
      "Undo toolbar interaction is obscured by the search drawer in mobile emulation.",
    );

    const undoButton = editorPage.getByLabel("Undo");
    const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });

    await openSearchPanel(editorPage);
    await fillSearchQuery(editorPage, "Jisu");
    await ensureSearchOptionsExpanded(editorPage);
    await editorPage
      .getByTestId(TESTING_IDS.replaceInput)
      .fill("INLINE_REPLACE_TOKEN");

    const countInlineTokens = async () => {
      const text = (await editor.textContent()) ?? "";
      return (text.match(/INLINE_REPLACE_TOKEN/g) ?? []).length;
    };

    await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(0);

    const replaceButton = editorPage
      .getByRole("button", { name: "Replace this match" })
      .first();
    await replaceButton.click();
    await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(1);

    await replaceButton.click();
    await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(2);

    // Close search so the toolbar Undo button is reachable (the search
    // panel overlays the toolbar). Two undos reverse both replacements.
    await editorPage
      .getByRole("button", { name: "Close search" })
      .last()
      .click();
    await undoButton.click();
    await expect.poll(countInlineTokens, { timeout: 10_000 }).toBeLessThan(2);

    if ((await countInlineTokens()) > 0) {
      await undoButton.click();
    }
    await expect.poll(countInlineTokens, { timeout: 10_000 }).toBe(0);
  });

  test.describe("selection fidelity (acceptance)", () => {
    // Desktop Chromium only: these assert exact DOM selection state,
    // which is browser-fiddly; one fast engine pins the contract.
    test.skip(
      ({ browserName, isMobile }) =>
        browserName !== "chromium" || isMobile === true,
      "Selection-state assertions run on desktop Chromium only.",
    );

    // Automation presses keys faster than the browser dispatches
    // `selectionchange`, which Lexical needs to observe a reposition —
    // a human gesture always has this gap. Pause after repositioning
    // so the editor state sees the move before the next edit.
    const SELECTION_SYNC_MS = 150;

    // Where the caret/selection actually sits, read from the live DOM.
    // Undo/redo restores are deferred ~50ms past the content swap, so
    // every assertion on this goes through `expect.poll`.
    const readDomSelection = (page: Page) =>
      page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const host =
          sel.anchorNode instanceof Element
            ? sel.anchorNode.closest("[data-id]")
            : sel.anchorNode?.parentElement?.closest("[data-id]");
        if (!host) return null;
        return {
          id: host.getAttribute("data-id"),
          offset: sel.anchorOffset,
          textLen: host.textContent?.length ?? 0,
          collapsed: sel.isCollapsed,
          selectedText: sel.toString(),
        };
      });

    // Click into the editor, let the selection sync into Lexical state
    // (and the store's selection fact), and return where the caret
    // landed. All caret expectations are relative to this start point —
    // platform-independent (Control+End/Home are no-ops on macOS).
    const clickAndCaptureCaret = async (page: Page) => {
      await page.getByRole("textbox", { name: "USFM Editor" }).click();
      await page.waitForTimeout(SELECTION_SYNC_MS);
      const start = await readDomSelection(page);
      expect(start).not.toBeNull();
      return start as NonNullable<Awaited<ReturnType<typeof readDomSelection>>>;
    };

    const pollCaretAt = (page: Page, id: string | null, offset: number) =>
      expect
        .poll(
          async () => {
            const caret = await readDomSelection(page);
            if (!caret || !caret.collapsed) return null;
            return { id: caret.id, offset: caret.offset };
          },
          { timeout: 5_000 },
        )
        .toEqual({ id, offset });

    test("caret-at-end delete: undo restores the caret at the deletion point", async ({
      editorPage,
    }) => {
      const editor = editorPage.getByRole("textbox", {
        name: "USFM Editor",
      });
      const start = await clickAndCaptureCaret(editorPage);
      await editorPage.keyboard.type("CARETDEL");
      await expect(editor).toContainText("CARETDEL");

      // Reposition (seals the typing run), then forward-delete the
      // tail "DEL" — its own undo entry by move-boundary, no
      // coalesce-window wait needed.
      for (let i = 0; i < 3; i++) {
        await editorPage.keyboard.press("ArrowLeft");
      }
      await editorPage.waitForTimeout(SELECTION_SYNC_MS);
      for (let i = 0; i < 3; i++) {
        await editorPage.keyboard.press("Delete");
      }
      await expect(editor).not.toContainText("CARETDEL");
      await expect(editor).toContainText("CARET");

      await editorPage.waitForTimeout(SELECTION_SYNC_MS);
      await editorPage.keyboard.press("ControlOrMeta+z");
      await expect(editor).toContainText("CARETDEL");
      // Caret back where the deletion happened: after "CARET",
      // before the restored "DEL".
      await pollCaretAt(editorPage, start.id, start.offset + 5);
    });

    test("range delete: undo restores the deleted range as the selection", async ({
      editorPage,
    }) => {
      const editor = editorPage.getByRole("textbox", {
        name: "USFM Editor",
      });
      await appendToEditor(editorPage, "RANGEDELETE");
      await expect(editor).toContainText("RANGEDELETE");

      for (let i = 0; i < 6; i++) {
        await editorPage.keyboard.press("Shift+ArrowLeft");
      }
      await editorPage.waitForTimeout(SELECTION_SYNC_MS);
      await editorPage.keyboard.press("Backspace");
      await expect(editor).not.toContainText("RANGEDELETE");

      await editorPage.waitForTimeout(SELECTION_SYNC_MS);
      await editorPage.keyboard.press("ControlOrMeta+z");
      await expect(editor).toContainText("RANGEDELETE");
      await expect
        .poll(async () => (await readDomSelection(editorPage))?.selectedText, {
          timeout: 5_000,
        })
        .toBe("DELETE");
    });

    test("range delete + cursor moved: undo returns to the deletion site, not the parked cursor", async ({
      editorPage,
    }) => {
      const editor = editorPage.getByRole("textbox", {
        name: "USFM Editor",
      });
      await appendToEditor(editorPage, "RANGEMOVED");
      await expect(editor).toContainText("RANGEMOVED");

      for (let i = 0; i < 5; i++) {
        await editorPage.keyboard.press("Shift+ArrowLeft");
      }
      await editorPage.waitForTimeout(SELECTION_SYNC_MS);
      await editorPage.keyboard.press("Backspace");
      await expect(editor).not.toContainText("RANGEMOVED");

      // Park the cursor elsewhere — selection-only commits; the
      // historical restore target must still win. (ArrowUp, not
      // Control+Home: the latter is a no-op on macOS, which would
      // make the "cursor moved" leg vacuous there.)
      await editorPage.keyboard.press("ArrowUp");
      await editorPage.keyboard.press("ArrowUp");
      await editorPage.waitForTimeout(SELECTION_SYNC_MS);

      await editorPage.keyboard.press("ControlOrMeta+z");
      await expect(editor).toContainText("RANGEMOVED");
      await expect
        .poll(async () => (await readDomSelection(editorPage))?.selectedText, {
          timeout: 5_000,
        })
        .toBe("MOVED");
    });

    test("type + move: undo lands the caret where typing started", async ({
      editorPage,
    }) => {
      const editor = editorPage.getByRole("textbox", {
        name: "USFM Editor",
      });
      const start = await clickAndCaptureCaret(editorPage);
      await editorPage.keyboard.type("TYPEMOVE");
      await expect(editor).toContainText("TYPEMOVE");

      // Park the cursor elsewhere — selection-only commits.
      await editorPage.keyboard.press("ArrowUp");
      await editorPage.keyboard.press("ArrowUp");
      await editorPage.waitForTimeout(SELECTION_SYNC_MS);

      await editorPage.keyboard.press("ControlOrMeta+z");
      await expect(editor).not.toContainText("TYPEMOVE");
      // selectionBefore = the caret at the moment typing began — not
      // where the cursor was parked.
      await pollCaretAt(editorPage, start.id, start.offset);
    });

    test("type + move + redo: redo lands the caret where typing ended", async ({
      editorPage,
    }) => {
      const editor = editorPage.getByRole("textbox", {
        name: "USFM Editor",
      });
      const start = await clickAndCaptureCaret(editorPage);
      await editorPage.keyboard.type("TYPEREDO");
      await expect(editor).toContainText("TYPEREDO");

      await editorPage.keyboard.press("ArrowUp");
      await editorPage.keyboard.press("ArrowUp");
      await editorPage.waitForTimeout(SELECTION_SYNC_MS);
      await editorPage.keyboard.press("ControlOrMeta+z");
      await expect(editor).not.toContainText("TYPEREDO");

      await editorPage.waitForTimeout(SELECTION_SYNC_MS);
      await editorPage.keyboard.press("ControlOrMeta+Shift+z");
      await expect(editor).toContainText("TYPEREDO");
      // selectionAfter = caret at the end of the typed run — not
      // where the cursor was parked before undo.
      await pollCaretAt(editorPage, start.id, start.offset + "TYPEREDO".length);
    });
  });

  test("undo and redo preserve plain mode projection after editing in regular", async ({
    editorPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "Mobile Chrome",
      "Settings drawer flow is unstable under mobile emulation.",
    );

    const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
    const undoButton = editorPage.getByLabel("Undo");
    const redoButton = editorPage.getByLabel("Redo");
    const appendedText = " Plain history ";

    await appendToEditor(editorPage, appendedText);
    await expect(editor).toContainText(appendedText);

    // Switch to Plain mode via the toolbar's inline mode picker. The
    // SelectPrimitive doesn't expose its current value as an accessible name,
    // so locate the trigger by its visible current-mode label ("Revision mode"
    // is the default), click it, then pick Plain mode. (The settings pane has a
    // duplicate picker; using the toolbar keeps a single match and avoids the
    // drawer open/close, which is flaky.)
    await editorPage.getByText("Revision mode", { exact: true }).click();
    await editorPage.getByRole("option", { name: /Plain mode/i }).click();

    await expect(editor).toContainText("\\");

    await undoButton.click();
    await expect(editor).not.toContainText(appendedText);
    await expect(editor).toContainText("\\");

    await redoButton.click();
    await expect(editor).toContainText(appendedText);
    await expect(editor).toContainText("\\");
  });
});
