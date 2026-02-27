import { describe, expect, it } from "vitest";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { loadProjectWithWarmCache } from "@/app/domain/cache/loadProjectWithWarmCache.ts";
import { SubtleSha1FingerprintService } from "@/app/domain/cache/SubtleSha1FingerprintService.ts";
import { serializeToUsfmString } from "@/app/domain/editor/serialization/lexicalToUsfm.ts";
import {
    createInMemoryProject,
    InMemoryWarmCacheProvider,
} from "@/test/helpers/inMemoryWarmCache.ts";

describe("loadProjectWithWarmCache", () => {
    function serializeParsedFileChapters(file: ParsedFile | undefined) {
        return (file?.chapters ?? [])
            .map((chapter) =>
                serializeToUsfmString(chapter.lexicalState.root.children ?? []),
            )
            .join("");
    }

    it("builds cache on first load and reuses it on warm reopen", async () => {
        const project = createInMemoryProject({
            files: {
                "01-GEN.usfm": "\\id GEN\n\\c 1\n\\v 1 In the beginning.\n",
                "02-EXO.usfm": "\\id EXO\n\\c 1\n\\v 1 Names.\n",
            },
        });
        const cacheProvider = new InMemoryWarmCacheProvider();
        const fingerprintService = new SubtleSha1FingerprintService();

        const first = await loadProjectWithWarmCache({
            loadedProject: project,
            editorMode: "regular",
            projectWarmCacheProvider: cacheProvider,
            projectFingerprintService: fingerprintService,
        });

        expect(first.parsedFiles).toHaveLength(2);
        expect(cacheProvider.writes).toBe(1);
        expect(
            cacheProvider.blob?.files.map((file) => file.relativePath),
        ).toEqual(["01-GEN.usfm", "02-EXO.usfm"]);

        const second = await loadProjectWithWarmCache({
            loadedProject: project,
            editorMode: "regular",
            projectWarmCacheProvider: cacheProvider,
            projectFingerprintService: fingerprintService,
        });

        expect(second.parsedFiles).toEqual(first.parsedFiles);
        expect(cacheProvider.writes).toBe(1);
    });

    it("repairs only changed file sections and preserves unchanged checksums", async () => {
        const project = createInMemoryProject({
            files: {
                "01-GEN.usfm": "\\id GEN\n\\c 1\n\\v 1 In the beginning.\n",
                "02-EXO.usfm": "\\id EXO\n\\c 1\n\\v 1 Names.\n",
            },
        });
        const cacheProvider = new InMemoryWarmCacheProvider();
        const fingerprintService = new SubtleSha1FingerprintService();

        await loadProjectWithWarmCache({
            loadedProject: project,
            editorMode: "regular",
            projectWarmCacheProvider: cacheProvider,
            projectFingerprintService: fingerprintService,
        });

        const before = cacheProvider.blob;
        expect(before).not.toBeNull();

        const exoHandle = await project.projectDir.getFileHandle("02-EXO.usfm");
        const writer = await exoHandle.createWriter();
        await writer.write("\\id EXO\n\\c 1\n\\v 1 Changed names.\n");
        await writer.close();

        const repaired = await loadProjectWithWarmCache({
            loadedProject: project,
            editorMode: "regular",
            projectWarmCacheProvider: cacheProvider,
            projectFingerprintService: fingerprintService,
        });

        expect(serializeParsedFileChapters(repaired.parsedFiles[1])).toContain(
            "Changed names.",
        );
        expect(
            serializeParsedFileChapters(repaired.parsedFiles[1]),
        ).not.toEqual(
            (before?.files[1]?.chapters ?? [])
                .map((chapter) =>
                    serializeToUsfmString(
                        chapter.paragraphLexicalState.root.children ?? [],
                    ),
                )
                .join(""),
        );
        expect(cacheProvider.writes).toBe(2);
        expect(cacheProvider.blob?.files[0]?.checksumSha1).toBe(
            before?.files[0]?.checksumSha1,
        );
        expect(cacheProvider.blob?.files[1]?.checksumSha1).not.toBe(
            before?.files[1]?.checksumSha1,
        );
    });

    it("silently rebuilds when the cache blob is malformed", async () => {
        const project = createInMemoryProject({
            files: {
                "01-GEN.usfm": "\\id GEN\n\\c 1\n\\v 1 In the beginning.\n",
            },
        });
        const cacheProvider = new InMemoryWarmCacheProvider();
        cacheProvider.blob = {
            schemaVersion: 999,
        } as never;
        const fingerprintService = new SubtleSha1FingerprintService();

        const loaded = await loadProjectWithWarmCache({
            loadedProject: project,
            editorMode: "regular",
            projectWarmCacheProvider: cacheProvider,
            projectFingerprintService: fingerprintService,
        });

        expect(loaded.parsedFiles).toHaveLength(1);
        expect(cacheProvider.writes).toBe(1);
        expect(
            (cacheProvider.blob as { schemaVersion?: number } | null)
                ?.schemaVersion,
        ).toBe(1);
    });
});
