import type { Page } from "@playwright/test";

import { TESTING_IDS } from "@/app/data/constants.ts";

import { expect, test } from "../helpers/e2e/fixtures.ts";

async function openSettingsPane(editorPage: Page) {
  await editorPage.getByRole("button", { name: "Open settings pane" }).click();
  // Wait for the settings surface (theme toggle is always present)
  await expect(
    editorPage.getByTestId(TESTING_IDS.settings.themeToggle),
  ).toBeVisible();
}

test.describe("Settings Panel", () => {
  test.beforeEach(async ({ editorPage }) => {
    await openSettingsPane(editorPage);
  });

  test("theme toggle switches between light and dark modes", async ({
    editorPage,
  }) => {
    // Assert on user-observable theme state: the <html> data-theme attribute
    // applied by appTheme.ts. The previous test pinned a wrapper-div
    // data-value attribute and a `data-mantine-color-scheme` attribute that
    // no longer exists post-Mantine→Base UI migration.
    const html = editorPage.locator("html");
    const themeToggle = editorPage.getByTestId(
      TESTING_IDS.settings.themeToggle,
    );

    await expect(html).toHaveAttribute("data-theme", "light");

    await themeToggle.getByRole("button", { name: "Dark" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    await themeToggle.getByRole("button", { name: "Light" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("language selector changes interface language", async ({
    editorPage,
  }) => {
    // Assert on user-observable text: the section title flips between
    // English and Spanish. Previously this asserted on a non-existent
    // languageSelectorLabel testid and a stale "Interface Localization"
    // string.
    const englishTitle = editorPage.getByText("Interface Language", {
      exact: true,
    });
    const spanishTitle = editorPage.getByText("Idioma de la interfaz", {
      exact: true,
    });

    await expect(englishTitle).toBeVisible();

    await editorPage.getByTestId(TESTING_IDS.settings.languageSelector).click();
    await editorPage.getByRole("option", { name: "Español" }).click();

    await expect(spanishTitle).toBeVisible();
  });

  test("font size control increments and decrements", async ({
    editorPage,
  }) => {
    // The font size display is a `<div>` showing "${px}px" (FontSizeControl.tsx).
    // Previous test treated it as a form input (.toHaveValue / .fill) — wrong
    // for the current UI. Assert on visible text content instead.
    const fontSizeDisplay = editorPage.getByTestId(
      TESTING_IDS.settings.fontSizeInput,
    );

    await expect(fontSizeDisplay).toHaveText("16px");

    await editorPage
      .getByTestId(TESTING_IDS.settings.fontSizeIncrement)
      .click();
    await expect(fontSizeDisplay).toHaveText("17px");

    await editorPage
      .getByTestId(TESTING_IDS.settings.fontSizeDecrement)
      .click();
    await expect(fontSizeDisplay).toHaveText("16px");
  });

  test("font size control clamps at min and max", async ({ editorPage }) => {
    // Replaces the prior "accepts typed input" + "clamps values" tests:
    // typed input no longer exists in the UI (the control is now a +/-
    // stepper). Verify clamping by stepping to the boundaries — the
    // disabled state of the buttons is the user-visible contract.
    const decrement = editorPage.getByTestId(
      TESTING_IDS.settings.fontSizeDecrement,
    );
    const increment = editorPage.getByTestId(
      TESTING_IDS.settings.fontSizeIncrement,
    );
    const display = editorPage.getByTestId(TESTING_IDS.settings.fontSizeInput);

    // Step all the way down — bound is 10
    for (let i = 0; i < 20; i += 1) {
      if (await decrement.isDisabled()) break;
      await decrement.click();
    }
    await expect(display).toHaveText("10px");
    await expect(decrement).toBeDisabled();

    // Step back up to the max — bound is 40
    for (let i = 0; i < 40; i += 1) {
      if (await increment.isDisabled()) break;
      await increment.click();
    }
    await expect(display).toHaveText("40px");
    await expect(increment).toBeDisabled();
  });
});
