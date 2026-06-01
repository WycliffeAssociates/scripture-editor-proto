import { describe, expect, it, vi } from "vitest";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { snapshotToScriptureBookStates } from "@/app/domain/project/versionSnapshotAdapter.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

const { groupFlatTokensByChapterMock } = vi.hoisted(() => ({
    groupFlatTokensByChapterMock: vi.fn(() => ({
        1: [],
    })),
}));

vi.mock("@/app/domain/editor/serialization/flatTokensByChapter.ts", () => ({
    groupFlatTokensByChapter: groupFlatTokensByChapterMock,
}));

const { tokensToLexicalMock } = vi.hoisted(() => ({
    tokensToLexicalMock: vi.fn(() => ({})),
}));

vi.mock(
    "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts",
    () => ({
        tokensToLexical: tokensToLexicalMock,
        detectLineEnding: (tokens: { kind: string; source: string }[]) =>
            tokens.find((t) => t.kind === "newline")?.source.includes("\r")
                ? "\r\n"
                : "\n",
    }),
);

function makeProject(): Project {
    return {
        folderName: "project",
        displayName: "Project",
        projectPath: "/Users/me/AppData/projects/project",
        projectId: "project",
        projectType: "resource-container",
        language: {
            code: "en",
            name: "English",
            direction: "ltr",
        },
        books: [
            {
                bookCode: "GEN",
                title: "Genesis",
                fileName: "01-GEN.usfm",
                storageKey: "01-GEN.usfm",
                path: "/Users/me/AppData/projects/project/01-GEN.usfm",
            },
        ],
        listBooks: async () => [],
        getBook: vi.fn(async () => ({
            bookCode: "GEN",
            title: "Genesis",
            fileName: "01-GEN.usfm",
            storageKey: "01-GEN.usfm",
            path: "/Users/me/AppData/projects/project/01-GEN.usfm",
            contents: "\\id GEN Live\n",
        })),
        saveBook: vi.fn(),
        addBook: vi.fn(async () => ({
            bookCode: "GEN",
            title: "Genesis",
            fileName: "01-GEN.usfm",
            storageKey: "01-GEN.usfm",
            path: "/Users/me/AppData/projects/project/01-GEN.usfm",
        })),
        listVersions: vi.fn(async () => []),
        restoreVersion: vi.fn(async () => {}),
        stageAndCommit: vi.fn(async () => ({ hash: "abc123" })),
    };
}

function makeUsfmOnionService() {
    return {
        supportsPathIo: true,
        getMarkerCatalog: vi.fn(async () => []),
        parseUsfmBatchFromPaths: vi.fn(async () => {
            throw new Error("snapshot parsing should not hit path I/O");
        }),
        parseUsfmBatchFromContents: vi.fn(async () => [
            {
                tokens: [],
                lintIssues: [],
            },
        ]),
    } as unknown as IUsfmOnionService;
}

describe("snapshotToScriptureBookStates", () => {
    it("parses previous-version snapshots from in-memory contents even when path I/O exists", async () => {
        const loadedProject = makeProject();
        const usfmOnionService = makeUsfmOnionService();

        await snapshotToScriptureBookStates({
            loadedProject,
            snapshot: new Map([["01-GEN.usfm", "\\id GEN Snapshot\n"]]),
            editorMode: "regular" as EditorModeSetting,
            usfmOnionService,
        });

        expect(usfmOnionService.parseUsfmBatchFromContents).toHaveBeenCalledWith(
            ["\\id GEN Snapshot\n"],
            {
                tokenOptions: { mergeHorizontalWhitespace: false },
                lintOptions: {},
                includeSourceMd5: false,
            },
        );
        expect(usfmOnionService.parseUsfmBatchFromPaths).not.toHaveBeenCalled();
    });
});
