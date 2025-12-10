import { TESTING_IDS } from "@/app/data/constants.ts";
import { expect, test } from "./fixtures.ts";

test.describe("Settings Panel", () => {
  test("theme toggle switches between light and dark modes", async ({
    editorPage,
  }) => {
    // Open drawer
    await editorPage.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Open settings accordion
    await editorPage
      .getByTestId(TESTING_IDS.settings.accordionControlSettings)
      .click();

    // Get theme toggle
    const themeToggle = editorPage.getByTestId(
      TESTING_IDS.settings.themeToggle,
    );
    await expect(themeToggle).toBeVisible();

    // Assume starts in light mode
    await expect(themeToggle).toHaveAttribute("data-value", "light");

    // Switch to dark
    await themeToggle.getByText("Dark").click();
    await expect(themeToggle).toHaveAttribute("data-value", "dark");

    // Verify page reflects dark mode
    await expect(editorPage.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark",
    );

    // Switch back to light
    await themeToggle.getByText("Light").click();
    await expect(themeToggle).toHaveAttribute("data-value", "light");
    await expect(editorPage.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "light",
    );
  });

  test("language selector changes interface language", async ({
    editorPage,
  }) => {
    // Open drawer
    await editorPage.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Open settings accordion
    await editorPage
      .getByTestId(TESTING_IDS.settings.accordionControlSettings)
      .click();

    // Get language selector
    const languageSelector = editorPage.getByTestId(
      TESTING_IDS.settings.languageSelector,
    );
    const languageLabel = editorPage.getByTestId(
      TESTING_IDS.settings.languageSelectorLabel,
    );

    // Assume starts in English
    await expect(languageLabel).toHaveText("Interface Localization");

    // Change to Spanish
    await languageSelector.click();
    await editorPage.getByRole("option", { name: "Español" }).click();

    // Verify label changes
    await expect(languageLabel).toHaveText("Localización de la interfaz");

    // Verify selector value
    await expect(languageSelector).toHaveValue("Español");
  });

  test("font size control increments and decrements", async ({
    editorPage,
  }) => {
    // Open drawer
    await editorPage.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Open settings accordion
    await editorPage
      .getByTestId(TESTING_IDS.settings.accordionControlSettings)
      .click();

    // Get font size input
    const fontSizeInput = editorPage.getByTestId(
      TESTING_IDS.settings.fontSizeInput,
    );

    // Assume starts at 16px
    await expect(fontSizeInput).toHaveValue("16px");

    // Increment
    await editorPage
      .getByTestId(TESTING_IDS.settings.fontSizeIncrement)
      .click();
    await expect(fontSizeInput).toHaveValue("17px");

    // Decrement
    await editorPage
      .getByTestId(TESTING_IDS.settings.fontSizeDecrement)
      .click();
    await expect(fontSizeInput).toHaveValue("16px");
  });

  test("font size control accepts typed input", async ({ editorPage }) => {
    // Open drawer
    await editorPage.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Open settings accordion
    await editorPage
      .getByTestId(TESTING_IDS.settings.accordionControlSettings)
      .click();

    // Get font size input
    const fontSizeInput = editorPage.getByTestId(
      TESTING_IDS.settings.fontSizeInput,
    );

    // Type new value
    await fontSizeInput.fill("20");
    await fontSizeInput.blur(); // Trigger onBlur

    await expect(fontSizeInput).toHaveValue("20px");
  });

  test("font size control clamps values", async ({ editorPage }) => {
    // Open drawer
    await editorPage.getByTestId(TESTING_IDS.settings.drawerOpenButton).click();

    // Open settings accordion
    await editorPage
      .getByTestId(TESTING_IDS.settings.accordionControlSettings)
      .click();

    // Get font size input
    const fontSizeInput = editorPage.getByTestId(
      TESTING_IDS.settings.fontSizeInput,
    );

    // Try below min (10)
    await fontSizeInput.fill("5");
    await fontSizeInput.blur();
    await expect(fontSizeInput).toHaveValue("10px");

    // Try above max (40)
    await fontSizeInput.fill("50");
    await fontSizeInput.blur();
    await expect(fontSizeInput).toHaveValue("40px");
  });
});
