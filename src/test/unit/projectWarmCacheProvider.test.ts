import { describe, expect, it } from "vitest";
import type { ProjectWarmCacheBlob } from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import { TauriProjectWarmCacheProvider } from "@/tauri/adapters/cache/TauriProjectWarmCacheProvider.ts";
import { createInMemoryDirectoryProvider } from "@/test/helpers/inMemoryWarmCache.ts";
import { WebProjectWarmCacheProvider } from "@/web/adapters/cache/WebProjectWarmCacheProvider.ts";

const sampleBlob: ProjectWarmCacheBlob = {
    schemaVersion: 1,
    projectPath: "/project",
    projectId: "project-id",
    languageDirection: "ltr",
    updatedAtIso: "2025-01-01T00:00:00.000Z",
    files: [
        {
            relativePath: "01-GEN.usfm",
            checksumSha1: "abc123",
            bookCode: "GEN",
            title: "GEN",
            sort: 1,
            lintErrors: [],
            chapters: [],
        },
    ],
};

describe.each([
    ["web", WebProjectWarmCacheProvider],
    ["tauri", TauriProjectWarmCacheProvider],
] as const)("%s project warm cache provider", (_label, ProviderClass) => {
    it("round-trips JSON blobs and clears them", async () => {
        const { directoryProvider } = createInMemoryDirectoryProvider();
        const provider = new ProviderClass(directoryProvider);

        expect(await provider.read("/project")).toBeNull();

        await provider.write("/project", sampleBlob);
        expect(await provider.read("/project")).toEqual(sampleBlob);

        await provider.clear("/project");
        expect(await provider.read("/project")).toBeNull();
    });
});
