import type { Page } from "@playwright/test";

import { TESTING_IDS } from "@/app/data/constants.ts";

async function ensureReferencePaneOpen(page: Page) {
  const closeButton = page.getByRole("button", {
    name: "Hide resource panel",
  });
  if (await closeButton.isVisible().catch(() => false)) return;
  await page.getByRole("button", { name: "Open resource panel" }).click();
}

export async function openReferenceProjectPicker(page: Page) {
  // The resource picker only renders inside the reference pane;
  // open the pane, then open the "Choose a resource" popover. The picker
  // is a Base UI Popover (not a combobox/listbox): the trigger and popup carry
  // testids, and each on-device resource is a `referenceProjectItem` button.
  await ensureReferencePaneOpen(page);
  await page.getByTestId(TESTING_IDS.referenceProjectTrigger).click();
  const dropdown = page.getByTestId(TESTING_IDS.referenceProjectDropdown);
  await dropdown.waitFor({ state: "visible" });
  return dropdown;
}

export async function selectReferenceProject(page: Page) {
  const dropdown = await openReferenceProjectPicker(page);
  const items = dropdown.getByTestId(TESTING_IDS.referenceProjectItem);
  await items.first().waitFor({ state: "visible" });
  const count = await items.count();

  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index);
    if (await item.isDisabled()) continue;
    await item.click();
    return;
  }

  throw new Error("No selectable reference resource was available");
}
