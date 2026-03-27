import { beforeEach, describe, expect, test, vi } from "vitest";
import { ScriptureBurritoProjectLoader } from "@/core/domain/project/ScriptureBurritoProjectLoader.ts";
import { isRemoteSyncCapable } from "@/core/library/ReferenceItemSupport.ts";
import { InMemoryFileSystem } from "@tests/helpers/InMemoryFileSystem.ts";

const mockMd5Service = {
    calculateMd5: vi.fn((text: string) => Promise.resolve(`mock-md5-${text}`)),
};

describe("ScriptureBurritoProjectLoader path-based loading", () => {
    let loader: ScriptureBurritoProjectLoader;
    let fileSystem: InMemoryFileSystem;
    const folderName = "test-burrito-id";
    const projectRootPath = `/projects/${folderName}`;
    const sampleMetadataJson = {
        format: "scripture burrito",
        meta: {
            version: "1.0.0",
            category: "source",
            generator: {
                softwareName: "Repo consolidator",
                softwareVersion: "1.0.0",
                userName: "test@example.com",
            },
            defaultLocale: "en",
            dateCreated: new Date().toISOString(),
            normalization: "NFC",
        },
        idAuthorities: {
            wycliffeassociates: {
                id: "https://www.wycliffeassociates.org",
                name: { en: "Wycliffe Associates" },
            },
        },
        identification: {
            primary: {},
            name: { en: "My Test Burrito Project" },
            abbreviation: { en: "bible" },
        },
        source: [
            {
                identifier: "https://example.com/my-test-burrito.git",
                language: "en",
                version: "main",
            },
        ],
        confidential: false,
        languages: [
            {
                tag: "en",
                name: { en: "English" },
                scriptDirection: "ltr",
            },
        ],
        type: {
            flavorType: {
                name: "scripture",
                flavor: {
                    name: "textTranslation",
                    projectType: "standard",
                    translationType: "firstTranslation",
                    audience: "common",
                    usfmVersion: "3.0",
                },
                currentScope: {
                    MAT: [],
                },
            },
        },
        copyright: {
            licenses: [{ ingredient: "LICENSE.md" }],
        },
        localizedNames: {
            MAT: {
                short: { en: "Matthew" },
                abbr: { en: "MAT" },
                long: { en: "Matthew" },
            },
        },
        ingredients: {
            "41-MAT.usfm": {
                checksum: { md5: "old-md5" },
                mimeType: "text/x-usfm",
                size: 11,
                scope: { MAT: [] },
            },
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        fileSystem = new InMemoryFileSystem();
        loader = new ScriptureBurritoProjectLoader(mockMd5Service);
    });

    test("opens a project and exposes ingredient-backed books", async () => {
        await fileSystem.writeText(
            `${projectRootPath}/metadata.json`,
            JSON.stringify(sampleMetadataJson),
        );
        await fileSystem.writeText(
            `${projectRootPath}/41-MAT.usfm`,
            "\\id MAT\n\\c 1\n\\v 1 In the beginning",
        );

        const project = await loader.openProject({
            fs: fileSystem,
            projectRootPath,
            folderName,
            displayName: "My Test Burrito Project",
        });

        expect(project).not.toBeNull();
        expect(project?.projectPath).toBe(projectRootPath);
        expect(project?.language).toEqual({
            code: "en",
            name: "English",
            direction: "ltr",
        });
        expect(project?.books).toEqual([
            {
                bookCode: "MAT",
                title: "MAT",
                fileName: "41-MAT.usfm",
                storageKey: "41-MAT.usfm",
                path: `${projectRootPath}/41-MAT.usfm`,
            },
        ]);
        expect(await project?.listBooks()).toEqual([
            {
                bookCode: "MAT",
                title: "MAT",
                fileName: "41-MAT.usfm",
                storageKey: "41-MAT.usfm",
                path: `${projectRootPath}/41-MAT.usfm`,
            },
        ]);

        const book = await project?.getBook("41-MAT.usfm");
        expect(book?.contents).toContain("\\id MAT");
    });

    test("opens a scripture burrito as a loaded reference item", async () => {
        await fileSystem.writeText(
            `${projectRootPath}/metadata.json`,
            JSON.stringify(sampleMetadataJson),
        );
        await fileSystem.writeText(
            `${projectRootPath}/41-MAT.usfm`,
            "\\id MAT\n\\c 1\n\\v 1 In the beginning",
        );

        const resource = await loader.openResource({
            fs: fileSystem,
            projectRootPath,
            folderName,
            displayName: "My Test Burrito Project",
        });

        expect(resource?.descriptor).toEqual({
            id: "My Test Burrito Project",
            displayName: "My Test Burrito Project",
            type: "usfmScripture",
            containerFormat: "scripture-burrito",
            language: {
                code: "en",
                name: "English",
                direction: "ltr",
            },
            readOnly: false,
        });
        expect(isRemoteSyncCapable(resource)).toBe(false);
        expect(resource?.remoteSource).toBeUndefined();
        await expect(resource?.listDocuments()).resolves.toEqual([
            {
                id: "41-MAT.usfm",
                name: "MAT",
                browsePath: ["41-MAT"],
            },
        ]);
        await expect(
            resource?.readDocument("41-MAT.usfm" as never),
        ).resolves.toEqual({
            id: "41-MAT.usfm",
            name: "MAT",
            browsePath: ["41-MAT"],
            contents: "\\id MAT\n\\c 1\n\\v 1 In the beginning",
        });
    });

    test("saveBook rewrites the file and updates burrito md5 and size", async () => {
        await fileSystem.writeText(
            `${projectRootPath}/metadata.json`,
            JSON.stringify(sampleMetadataJson),
        );
        await fileSystem.writeText(`${projectRootPath}/41-MAT.usfm`, "old");

        const project = await loader.openProject({
            fs: fileSystem,
            projectRootPath,
            folderName,
            displayName: "My Test Burrito Project",
        });

        await project?.saveBook("41-MAT.usfm", "new content");

        expect(await fileSystem.readText(`${projectRootPath}/41-MAT.usfm`)).toBe(
            "new content",
        );
        expect(mockMd5Service.calculateMd5).toHaveBeenCalledWith("new content");
        const metadata = JSON.parse(
            await fileSystem.readText(`${projectRootPath}/metadata.json`),
        );
        expect(metadata.ingredients["41-MAT.usfm"].checksum.md5).toBe(
            "mock-md5-new content",
        );
        expect(metadata.ingredients["41-MAT.usfm"].size).toBe("new content".length);
    });

    test("addBook creates a file and adds a new ingredient", async () => {
        await fileSystem.writeText(
            `${projectRootPath}/metadata.json`,
            JSON.stringify({
                ...sampleMetadataJson,
                ingredients: {},
            }),
        );

        const project = await loader.openProject({
            fs: fileSystem,
            projectRootPath,
            folderName,
            displayName: "My Test Burrito Project",
        });

        const added = await project?.addBook("MRK", {
            localizedBookTitle: "Mark",
            contents: "\\id MRK\n\\c 1\n\\v 1 The beginning",
        });

        expect(added).toEqual({
            bookCode: "MRK",
            title: "Mark",
            fileName: "42-MRK.usfm",
            storageKey: "42-MRK.usfm",
            path: `${projectRootPath}/42-MRK.usfm`,
        });
        expect(await fileSystem.readText(`${projectRootPath}/42-MRK.usfm`)).toContain(
            "\\id MRK",
        );

        const metadata = JSON.parse(
            await fileSystem.readText(`${projectRootPath}/metadata.json`),
        );
        expect(metadata.ingredients["42-MRK.usfm"]).toBeTruthy();
        expect(project?.books).toContainEqual({
            bookCode: "MRK",
            title: "Mark",
            fileName: "42-MRK.usfm",
            storageKey: "42-MRK.usfm",
            path: `${projectRootPath}/42-MRK.usfm`,
        });
    });
});
