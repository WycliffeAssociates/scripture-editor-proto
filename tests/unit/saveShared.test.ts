import { describe, expect, it } from "vitest";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { buildCurrentProjectCompareMetadata, selectScriptureBookStatesForChapterRefs } from "@/app/ui/hooks/save/shared.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

function makeScriptureBookState(args: {
    bookCode: string;
    title: string;
    chapters: number[];
}): ScriptureBookState {
    return {
        path: `/project/${args.bookCode}.usfm`,
        title: args.title,
        bookCode: args.bookCode,
        nextBookId: null,
        prevBookId: null,
        chapters: args.chapters.map((chapterNumber) => ({
            chapterNumber,
            eol: "\n" as const,
            lexicalState: { root: { children: [], direction: "ltr" } } as never,
            loadedLexicalState: {
                root: { children: [], direction: "ltr" },
            } as never,
            sourceTokens: [],
            currentTokens: [],
            dirty: false,
        })),
    };
}

function makeProject(): Project {
    return {
        folderName: "reg",
        displayName: "Adhola Bible",
        projectPath: "/userData/projects/reg",
        projectId: "reg",
        projectType: "resource-container",
        language: {
            code: "adh",
            name: "Adhola",
            direction: "ltr",
        },
        books: [],
        listBooks: async () => [],
        getBook: async () => {
            throw new Error("not needed");
        },
        saveBook: async () => {},
        addBook: async () => {
            throw new Error("not needed");
        },
        listVersions: async () => [],
        restoreVersion: async () => {},
        stageAndCommit: async () => ({ hash: "abc123" }),
    };
}

describe("save shared helpers", () => {
    it("selectScriptureBookStatesForChapterRefs narrows files to requested chapters", () => {
        const files = [
            makeScriptureBookState({
                bookCode: "GEN",
                title: "Genesis",
                chapters: [1, 2, 3],
            }),
            makeScriptureBookState({
                bookCode: "EXO",
                title: "Exodus",
                chapters: [1, 2],
            }),
        ];

        const selected = selectScriptureBookStatesForChapterRefs(files, [
            { bookCode: "GEN", chapterNum: 2 },
            { bookCode: "EXO", chapterNum: 1 },
        ]);

        expect(selected).toHaveLength(2);
        expect(selected[0].bookCode).toBe("GEN");
        expect(selected[0].chapters.map((chapter) => chapter.chapterNumber)).toEqual([
            2,
        ]);
        expect(selected[1].bookCode).toBe("EXO");
        expect(selected[1].chapters.map((chapter) => chapter.chapterNumber)).toEqual([
            1,
        ]);
    });

    it("buildCurrentProjectCompareMetadata derives compare metadata from the loaded project", () => {
        expect(buildCurrentProjectCompareMetadata(makeProject())).toEqual({
            projectId: "reg",
            languageId: "adh",
            languageDirection: "ltr",
        });
    });
});
