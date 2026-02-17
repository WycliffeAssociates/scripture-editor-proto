import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { TESTING_IDS } from "@/app/data/constants.ts";

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:5175";

export const MOCK_ZIPS = {
    llxReg: path.resolve(dirname, "../../", "mockData", "llx_reg-master.zip"),
    enUlb: path.resolve(dirname, "../../", "mockData", "en_ulb-master.zip"),
} as const;

export const MOCK_DIRS = {
    llxReg: path.resolve(dirname, "../../", "mockData", "llx_reg/"),
} as const;

export async function gotoCreate(page: Page) {
    await page.goto(`${BASE_URL}/create`, { waitUntil: "domcontentloaded" });
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
    await expect(page.getByTestId(TESTING_IDS.import.importer)).toBeEnabled({
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
    await expect(page.getByTestId(TESTING_IDS.import.dirImporter)).toBeEnabled({
        timeout,
    });
}

export async function gotoHomeAndExpectProjectCount(
    page: Page,
    count: number,
    timeout = 15_000,
) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(TESTING_IDS.project.list)).toHaveCount(
        count,
        {
            timeout,
        },
    );
}
