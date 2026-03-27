import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

export const MOCK_ZIPS = {
    llxReg: path.resolve(dirname, "../../", "mockData", "llx_reg-master.zip"),
    enUlb: path.resolve(dirname, "../../", "mockData", "en_ulb-master.zip"),
} as const;

export const MOCK_DIRS = {
    llxReg: path.resolve(dirname, "../../", "mockData", "llx_reg/"),
    // Keep the e2e fixture intentionally tiny so this test verifies the
    // import/render path instead of spending most of its time on file churn.
    enTnCondensed: path.resolve(
        dirname,
        "../../",
        "mockData",
        "en_tn_condensed_e2e/",
    ),
} as const;

export async function gotoCreate(page: Page) {
    await page.goto("/create", { waitUntil: "domcontentloaded" });
    await expect(
        page.getByRole("heading", { name: /new project/i }),
    ).toBeVisible();
}

export async function importZipProject(
    page: Page,
    zipPath: string,
    timeout = 20_000,
) {
    await page.getByTestId(TESTING_IDS.import.importer).setInputFiles(zipPath);
    await expect(
        page.getByRole("alert").filter({ hasText: "Import Started" }).first(),
    ).toBeVisible({
        timeout,
    });
}

export async function importDirectoryProject(
    page: Page,
    dirPath: string,
    timeout = 20_000,
) {
    await page
        .getByTestId(TESTING_IDS.import.dirImporter)
        .setInputFiles(dirPath);
    await expect(
        page.getByRole("alert").filter({ hasText: "Import Started" }).first(),
    ).toBeVisible({
        timeout,
    });
}

export async function gotoHomeAndExpectProjectCount(
    page: Page,
    count: number,
    timeout = 15_000,
) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(TESTING_IDS.project.list)).toHaveCount(
        count,
        {
            timeout,
        },
    );
}
