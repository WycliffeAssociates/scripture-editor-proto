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

async function caretAfterFirstVerseProse(page: Page) {
    // Place the caret at the end of the text node that immediately follows
    // the first verse number — i.e. inside the first verse's prose, where a
    // user would be when they ask to insert the next verse.
    await page.evaluate(() => {
        const firstVerse = document.querySelector(
            '[data-token-type="numberedMarker"][data-marker="v"]',
        );
        const prose = firstVerse?.nextElementSibling;
        const textNode = prose?.firstChild;
        if (!textNode) throw new Error("verse-1 prose node not found");
        const range = document.createRange();
        range.setStart(textNode, (textNode.textContent ?? "").length);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    });
}

async function caretAtVerseProseStart(page: Page, verseText: string) {
    // Place the caret at offset 0 of the prose immediately after a given
    // verse number — the boundary the browser canonicalizes onto the
    // number's end, where a backspace would otherwise eat its terminator.
    await page.evaluate((text) => {
        const verse = [
            ...document.querySelectorAll(
                '[data-token-type="numberedMarker"][data-marker="v"]',
            ),
        ].find((el) => el.textContent === text);
        const prose = verse?.nextElementSibling;
        const textNode = prose?.firstChild;
        if (!textNode) throw new Error(`prose after ${text} not found`);
        const range = document.createRange();
        range.setStart(textNode, 0);
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

    test("retype into emptied number lands in the node WITH its terminator (no escape to prose, no I2)", async ({
        editorPage,
    }) => {
        // Regression: an empty inline number node can't host a DOM caret, so a
        // typed digit used to land in the adjacent prose node ("6Then…") and
        // the bytes re-lexed as one bogus verse number. The KEY_DOWN guard now
        // writes the digit + the argument-terminator space straight into the
        // number node. The terminator matters: "6" alone re-lexes wrong; "6 "
        // is a clean number token (the I2 fixpoint must stay silent).
        const violations = collectFixpointViolations(editorPage);
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        await editor.click();

        await caretIntoVerseNumber(editorPage, "2 ");
        await editorPage.keyboard.press("Backspace"); // stage 1 → empty
        await expect(
            editorPage.locator(
                '[data-token-type="numberedMarker"][data-empty="true"]',
            ),
        ).toHaveCount(1);

        // "99" is unique in the chapter: the first digit hits the empty-node
        // guard (→ "9 "), the second is ordinary same-node typing (→ "99 ").
        await editorPage.keyboard.type("99");

        // The digits landed in the number node, carrying its terminator: a
        // numbered node now reads "99 " exactly.
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
        // It did NOT escape into a prose text node (the "9Then…" symptom):
        // no text node begins with a digit immediately followed by a letter.
        const escaped = await editorPage.evaluate(() =>
            [...document.querySelectorAll('[data-token-type="text"]')].some(
                (el) => /^\d\p{L}/u.test(el.textContent ?? ""),
            ),
        );
        expect(escaped).toBe(false);

        await editorPage.waitForTimeout(800);
        expect(violations).toEqual([]);
    });

    test("backspace from prose into a number empties it (keeps its terminator-or-nothing, no I2)", async ({
        editorPage,
    }) => {
        // Regression: the verse number's trailing space is the marker family's
        // argument terminator (railroad: VERSE then `'' | WS`), which the lexer
        // collapses into the number token. Backspacing from the prose start —
        // which the browser canonicalizes onto the number's end — used to
        // delete that terminator, leaving "6"; the bytes "\\v 6Then" then
        // re-lex as a single number "6Then" (I2 divergence). The guard now
        // treats the terminator as non-content: the delete removes the digit,
        // emptying the node to its clean placeholder instead of orphaning it.
        const violations = collectFixpointViolations(editorPage);
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        await editor.click();

        await caretAtVerseProseStart(editorPage, "2 ");
        await editorPage.keyboard.press("Backspace");

        // The number emptied (digit + terminator gone together).
        await expect(
            editorPage.locator(
                '[data-token-type="numberedMarker"][data-empty="true"]',
            ),
        ).toHaveCount(1);
        // No verse number is left as bare digits without a terminator (the
        // exact byte shape that re-lexes wrong).
        const orphaned = await editorPage.evaluate(() =>
            [
                ...document.querySelectorAll(
                    '[data-token-type="numberedMarker"][data-marker="v"]',
                ),
            ].some((el) => /^\d+$/.test(el.textContent ?? "")),
        );
        expect(orphaned).toBe(false);

        await editorPage.waitForTimeout(800);
        expect(violations).toEqual([]);
    });

    test("insert verse: new node gets a real forward-stepped SID + paragraph context", async ({
        editorPage,
    }) => {
        // Regression for the regular-mode insertion-context bug: inserting a
        // verse used to mint a placeholder SID ("undefined undefined:2") and
        // empty inPara because the context walker only understood the flat
        // shape. The fix derives prior-verse SID from the numbered node and
        // paragraph identity from the enclosing container. This drives the
        // real store→bridge path (the unit test exercises the functions; this
        // proves the live insertion that a user performs).
        const violations = collectFixpointViolations(editorPage);
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        const verseLocator = editorPage.locator(
            '[data-token-type="numberedMarker"][data-marker="v"]',
        );

        await editor.click();
        const before = await verseLocator.count();

        await caretAfterFirstVerseProse(editorPage);
        await editorPage.getByRole("button", { name: "Verse" }).click();

        // A new structured verse node appears.
        await expect(verseLocator).toHaveCount(before + 1);

        // No verse node carries a malformed SID — the exact symptom of the
        // old bug was a placeholder containing "undefined". Every verse SID
        // must be a well-formed "<BOOK> <chap>:<verse>" reference.
        const badSids = await editorPage.evaluate(() =>
            [
                ...document.querySelectorAll(
                    '[data-token-type="numberedMarker"][data-marker="v"]',
                ),
            ]
                .map((el) => el.getAttribute("data-sid") ?? "")
                .filter((sid) => !/^\S+ \d+:\d+/.test(sid)),
        );
        expect(badSids).toEqual([]);

        // After the metadata pass settles, the inserted node sits in a real
        // paragraph: some verse node carries a non-empty paragraph context
        // (data-in-para), proving container-derived inPara reached the DOM.
        await expect
            .poll(() =>
                editorPage.evaluate(
                    () =>
                        [
                            ...document.querySelectorAll(
                                '[data-token-type="numberedMarker"][data-marker="v"]',
                            ),
                        ].filter((el) => (el.getAttribute("data-in-para") ?? "")
                            .length > 0).length,
                ),
            )
            .toBeGreaterThan(0);

        await editorPage.waitForTimeout(800);
        expect(violations).toEqual([]);
    });

    test("backspace at the prose edge removes an empty number whole", async ({
        editorPage,
    }) => {
        // After emptying a number, the caret can sit at the prose edge
        // (text@0, held by the arrow defense). Backspacing there must remove
        // the empty number whole — the empty inline node can't be deleted
        // natively, so the guard does it explicitly (regression: it used to
        // no-op, forcing the user to range-select over it).
        const violations = collectFixpointViolations(editorPage);
        const editor = editorPage.getByRole("textbox", { name: "USFM Editor" });
        const verses = editorPage.locator(
            '[data-token-type="numberedMarker"][data-marker="v"]',
        );
        await editor.click();
        const before = await verses.count();

        await caretIntoVerseNumber(editorPage, "2 ");
        await editorPage.keyboard.press("Backspace"); // stage 1 → empty
        await expect(
            editorPage.locator(
                '[data-token-type="numberedMarker"][data-empty="true"]',
            ),
        ).toHaveCount(1);

        // Arrow out to the prose edge, then backspace removes the empty number.
        await editorPage.keyboard.press("ArrowRight");
        await editorPage.keyboard.press("Backspace");
        await expect(verses).toHaveCount(before - 1);

        await editorPage.waitForTimeout(800);
        expect(violations).toEqual([]);
    });
});
