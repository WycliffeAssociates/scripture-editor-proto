import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/e2e/fixtures.ts";

// Acceptance for the numbered-marker node lifecycle (plan §5.3/§10): verse
// numbers are structured nodes whose marker bytes live in node state, so the
// editing primitives below must hold without any repair sweep — and the
// dev-only I2 fixpoint alarm must stay silent throughout (it console.errors
// "[tokenFixpoint]" when the editor's token stream diverges from a re-lex of
// its own bytes).

function collectFixpointViolations(page: Page): string[] {
    const violations: string[] = [];
    page.on("console", (message) => {
        if (
            message.type() === "error" &&
            message.text().includes("[tokenFixpoint]")
        ) {
            violations.push(message.text());
        }
    });
    return violations;
}

async function caretIntoVerseNumber(page: Page, verseText: string) {
    // Place the caret inside the verse-number node via the DOM (clicking a
    // superscript chip is flaky at e2e scale; the model selection is what
    // the behaviors key off).
    await page.evaluate((text) => {
        const span = [
            ...document.querySelectorAll(
                '[data-token-type="numberedMarker"]',
            ),
        ].find((el) => el.textContent === text);
        if (!span?.firstChild) throw new Error(`verse span ${text} not found`);
        const range = document.createRange();
        range.setStart(span.firstChild, 1);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    }, verseText);
}

test.describe("Numbered marker nodes", () => {
    test("verse numbers render as structured nodes", async ({ editorPage }) => {
        const count = await editorPage
            .locator('[data-token-type="numberedMarker"][data-marker="v"]')
            .count();
        expect(count).toBeGreaterThan(0);
        // Chapter renders as a numbered node inside its byte-less shell.
        await expect(
            editorPage
                .locator('[data-token-type="numberedMarker"][data-marker="c"]')
                .first(),
        ).toBeVisible();
    });

    test("renumber: select digit and type replaces the number in place", async ({
        editorPage,
    }) => {
        const violations = collectFixpointViolations(editorPage);
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        await editor.click();
        await caretIntoVerseNumber(editorPage, "2 ");
        await editorPage.keyboard.press("Shift+ArrowLeft");
        await editorPage.keyboard.type("99");
        // Exact-content check ("99 " with its terminator) — substring
        // locators would match other verses; 99 is unique in the fixture.
        await expect
            .poll(() =>
                editorPage.evaluate(
                    () =>
                        [
                            ...document.querySelectorAll(
                                '[data-token-type="numberedMarker"]',
                            ),
                        ].filter((el) => el.textContent === "99 ").length,
                ),
            )
            .toBe(1);
        // Settle past the fixpoint debounce, then assert silence.
        await editorPage.waitForTimeout(800);
        expect(violations).toEqual([]);
    });

    test("two-stage delete: first backspace empties, second removes whole; undo restores", async ({
        editorPage,
    }) => {
        const violations = collectFixpointViolations(editorPage);
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        const undoButton = editorPage.getByLabel("Undo");
        await editor.click();

        const before = await editorPage
            .locator('[data-token-type="numberedMarker"][data-marker="v"]')
            .count();

        await caretIntoVerseNumber(editorPage, "2 ");
        // Stage 1: clearing the last digit empties the node (caret stays).
        await editorPage.keyboard.press("Backspace");
        await expect(
            editorPage.locator(
                '[data-token-type="numberedMarker"][data-empty="true"]',
            ),
        ).toHaveCount(1);

        // Stage 2: backspace on the empty node removes it whole.
        await editorPage.keyboard.press("Backspace");
        await expect(
            editorPage.locator(
                '[data-token-type="numberedMarker"][data-marker="v"]',
            ),
        ).toHaveCount(before - 1);

        // Undo restores the node whole (structure + number).
        await undoButton.click();
        await undoButton.click();
        await expect(
            editorPage.locator(
                '[data-token-type="numberedMarker"][data-marker="v"]',
            ),
        ).toHaveCount(before);
        await expect
            .poll(() =>
                editorPage.evaluate(
                    () =>
                        [
                            ...document.querySelectorAll(
                                '[data-token-type="numberedMarker"]',
                            ),
                        ].filter((el) => el.textContent === "2 ").length,
                ),
            )
            .toBe(1);

        await editorPage.waitForTimeout(800);
        expect(violations).toEqual([]);
    });
});
