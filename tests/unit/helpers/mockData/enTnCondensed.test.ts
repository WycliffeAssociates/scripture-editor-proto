import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";
import {
  EN_TN_CONDENSED_FILES,
  seedEnTnCondensedFixture,
} from "@tests/helpers/mockData/enTnCondensed.ts";
import { describe, expect, it } from "vitest";

describe("seedEnTnCondensedFixture", () => {
  it("writes a loadable TN manifest and representative note files", async () => {
    const fileSystem = new InMemoryFileSystem();
    const projectRootPath = "/projects/en_tn_condensed";

    await seedEnTnCondensedFixture(fileSystem, projectRootPath);

    await expect(
      fileSystem.readText(`${projectRootPath}/manifest.yaml`),
    ).resolves.toContain("en_tn_condensed");

    for (const relativePath of Object.keys(EN_TN_CONDENSED_FILES).filter(
      (path) => path !== "manifest.yaml",
    )) {
      await expect(
        fileSystem.readText(`${projectRootPath}/${relativePath}`),
      ).resolves.toMatch(/\S/);
    }
  });
});
