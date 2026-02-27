import { describe, expect, it } from "vitest";
import { refreshProjectWarmCache } from "@/app/domain/cache/refreshProjectWarmCache.ts";
import { SubtleSha1FingerprintService } from "@/app/domain/cache/SubtleSha1FingerprintService.ts";
import {
    createInMemoryProject,
    InMemoryWarmCacheProvider,
    loadParsedWorkingFiles,
} from "@/test/helpers/inMemoryWarmCache.ts";

describe("refreshProjectWarmCache", () => {
    it("patches saved files and reuses unchanged sections", async () => {
        const project = createInMemoryProject({
            files: {
                "01-GEN.usfm": "\\id GEN\n\\c 1\n\\v 1 In the beginning.\n",
                "02-EXO.usfm": "\\id EXO\n\\c 1\n\\v 1 Names.\n",
            },
        });
        const cacheProvider = new InMemoryWarmCacheProvider();
        const fingerprintService = new SubtleSha1FingerprintService();
        const workingFiles = await loadParsedWorkingFiles(project);

        await refreshProjectWarmCache({
            loadedProject: project,
            workingFiles,
            savedBookContentsByCode: {
                GEN: "\\id GEN\n\\c 1\n\\v 1 In the beginning.\n",
                EXO: "\\id EXO\n\\c 1\n\\v 1 Names.\n",
            },
            projectWarmCacheProvider: cacheProvider,
            projectFingerprintService: fingerprintService,
        });

        const before = cacheProvider.blob;
        expect(before).not.toBeNull();

        await refreshProjectWarmCache({
            loadedProject: project,
            workingFiles,
            savedBookContentsByCode: {
                EXO: "\\id EXO\n\\c 1\n\\v 1 Changed names.\n",
            },
            projectWarmCacheProvider: cacheProvider,
            projectFingerprintService: fingerprintService,
        });

        expect(cacheProvider.blob?.files[0]).toEqual(before?.files[0]);
        expect(cacheProvider.blob?.files[1]?.checksumSha1).not.toBe(
            before?.files[1]?.checksumSha1,
        );
    });
});
