import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProjectIndexDbName, DexieProjectIndex } from "@/app/persistence/DexieProjectIndex.ts";
import type {
    TranslationNotesItem,
    UsfmScriptureItem,
} from "@/core/library/LibraryItem.ts";

let dbName = "";

function makeProject(
    overrides: Partial<UsfmScriptureItem> = {},
): UsfmScriptureItem {
    return {
        id: "reg",
        type: "usfmScripture",
        folderName: "reg",
        displayName: "Adhola Bible",
        managedPath: "/userData/projects/reg",
        projectPath: "/userData/projects/reg",
        projectId: "reg",
        projectType: "resource-container",
        containerFormat: "resource-container",
        language: {
            code: "adh",
            name: "Adhola",
            direction: "ltr",
        },
        capabilities: {
            editableWith: "usfmScripture",
        },
        books: [
            {
                bookCode: "1JN",
                title: "1 John",
                fileName: "63-1JN.usfm",
                storageKey: "63-1JN.usfm",
                path: "/userData/projects/reg/63-1JN.usfm",
            },
            {
                bookCode: "MAT",
                title: "Matthew",
                fileName: "41-MAT.usfm",
                storageKey: "41-MAT.usfm",
                path: "/userData/projects/reg/41-MAT.usfm",
            },
        ],
        listBooks: async () => [],
        getBook: async () => ({
            bookCode: "1JN",
            title: "1 John",
            fileName: "63-1JN.usfm",
            storageKey: "63-1JN.usfm",
            path: "/userData/projects/reg/63-1JN.usfm",
            contents: "\\id 1JN",
        }),
        saveBook: async () => {},
        addBook: async () => ({
            bookCode: "MAT",
            title: "Matthew",
            fileName: "41-MAT.usfm",
            storageKey: "41-MAT.usfm",
            path: "/userData/projects/reg/41-MAT.usfm",
        }),
        listVersions: async () => [],
        restoreVersion: async () => {},
        stageAndCommit: async () => ({ hash: "abc123" }),
        readWorkspace: async () => ({
            bookCode: "1JN",
            usfmContents: "\\id 1JN",
        }),
        readBook: async () => ({
            bookCode: "1JN",
            usfmContents: "\\id 1JN",
        }),
        ...overrides,
    };
}

function makeTranslationNotesItem(
    overrides: Partial<TranslationNotesItem> = {},
): TranslationNotesItem {
    return {
        id: "en_tn_condensed",
        type: "translationNotes",
        displayName: "English Translation Notes Condensed",
        managedPath: "/userData/projects/en_tn_condensed",
        containerFormat: "resource-container",
        language: {
            code: "en",
            name: "English",
            direction: "ltr",
        },
        capabilities: {},
        listBookCodes: async () => ["LUK"],
        readBook: async () => ({
            bookCode: "LUK",
            chapters: [
                {
                    chapterNumber: 22,
                    verses: [
                        {
                            verseNumber: 71,
                            rawMarkdown: "# Luke 22:71",
                        },
                    ],
                },
            ],
        }),
        readChapter: async () => ({
            "71": "# Luke 22:71",
        }),
        ...overrides,
    };
}

describe("DexieProjectIndex", () => {
    beforeEach(() => {
        dbName = `dovetail-editor:dexie-project-index-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;
    });

    afterEach(async () => {
        await Dexie.delete(dbName);
    });

    it("buildProjectIndexDbName scopes the database name by namespace", () => {
        expect(buildProjectIndexDbName()).toBe("dovetail-editor");
        expect(buildProjectIndexDbName("web")).toBe("dovetail-editor:web");
    });

    it("indexes and reads back an editable scripture item", async () => {
        const index = new DexieProjectIndex(dbName);
        await index.indexItem(makeProject());

        await expect(index.listProjects()).resolves.toEqual([
            {
                folderName: "reg",
                projectPath: "/userData/projects/reg",
                displayName: "Adhola Bible",
                projectId: "reg",
                languageCode: "adh",
                languageName: "Adhola",
                projectType: "resource-container",
            },
        ]);
        await expect(index.getProjectByPath("/userData/projects/reg")).resolves
            .toEqual({
                folderName: "reg",
                projectPath: "/userData/projects/reg",
                displayName: "Adhola Bible",
                projectId: "reg",
                languageCode: "adh",
                languageName: "Adhola",
                projectType: "resource-container",
            });
    });

    it("renames the indexed scripture display name", async () => {
        const index = new DexieProjectIndex(dbName);
        await index.indexItem(makeProject());
        await index.renameDisplayName(
            "/userData/projects/reg",
            "Adhola Bible Revised",
        );

        await expect(index.getProjectByPath("/userData/projects/reg")).resolves
            .toEqual({
                folderName: "reg",
                projectPath: "/userData/projects/reg",
                displayName: "Adhola Bible Revised",
                projectId: "reg",
                languageCode: "adh",
                languageName: "Adhola",
                projectType: "resource-container",
            });
    });

    it("indexes translation notes in the broader library while keeping listProjects scripture-only", async () => {
        const index = new DexieProjectIndex(dbName);
        await index.indexItem(makeProject());
        await index.indexItem(makeTranslationNotesItem());

        await expect(index.listProjects()).resolves.toEqual([
            {
                folderName: "reg",
                projectPath: "/userData/projects/reg",
                displayName: "Adhola Bible",
                projectId: "reg",
                languageCode: "adh",
                languageName: "Adhola",
                projectType: "resource-container",
            },
        ]);

        await expect(index.listLibraryItems()).resolves.toEqual([
            {
                folderName: "reg",
                projectPath: "/userData/projects/reg",
                displayName: "Adhola Bible",
                projectId: "reg",
                languageCode: "adh",
                languageName: "Adhola",
                projectType: "resource-container",
                type: "usfmScripture",
                containerFormat: "resource-container",
                isEditable: true,
                hasRemoteSync: false,
                libraryGroup: "scripture",
            },
            {
                folderName: "en_tn_condensed",
                projectPath: "/userData/projects/en_tn_condensed",
                displayName: "English Translation Notes Condensed",
                projectId: "en_tn_condensed",
                languageCode: "en",
                languageName: "English",
                projectType: "resource-container",
                type: "translationNotes",
                containerFormat: "resource-container",
                isEditable: false,
                hasRemoteSync: false,
                libraryGroup: "translation-notes",
            },
        ]);

        await expect(
            index.getLibraryItemByPath("/userData/projects/en_tn_condensed"),
        ).resolves.toEqual({
            folderName: "en_tn_condensed",
            projectPath: "/userData/projects/en_tn_condensed",
            displayName: "English Translation Notes Condensed",
            projectId: "en_tn_condensed",
            languageCode: "en",
            languageName: "English",
            projectType: "resource-container",
            type: "translationNotes",
            containerFormat: "resource-container",
            isEditable: false,
            hasRemoteSync: false,
            libraryGroup: "translation-notes",
        });
    });

    it("keeps listProjects limited to editable scripture items", async () => {
        const index = new DexieProjectIndex(dbName);
        await index.indexItem(makeProject());
        await index.indexItem(
            makeTranslationNotesItem({
                capabilities: {
                    remoteSync: {
                        kind: "remoteSync",
                        source: {
                            kind: "url",
                            identifier: "https://example.com/en_tn.zip",
                        },
                        applyUpdate: async () => {},
                    },
                },
            }),
        );

        await expect(index.listProjects()).resolves.toEqual([
            {
                folderName: "reg",
                projectPath: "/userData/projects/reg",
                displayName: "Adhola Bible",
                projectId: "reg",
                languageCode: "adh",
                languageName: "Adhola",
                projectType: "resource-container",
            },
        ]);
    });

    it("deletes the project and its file rows", async () => {
        const index = new DexieProjectIndex(dbName);
        await index.indexItem(makeProject());
        await index.deleteProject("/userData/projects/reg");

        await expect(index.listProjects()).resolves.toEqual([]);
        await expect(index.getProjectByPath("/userData/projects/reg")).resolves
            .toBeNull();
    });
});
