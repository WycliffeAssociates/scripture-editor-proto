import { describe, expect, it, vi } from "vitest";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { loadedProjectToParsedFiles } from "@/app/domain/api/loadedProjectToParsedFiles.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { ProjectedUsfmDocument } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

const {
    editorTreeToLexicalStatesByChapterMock,
    flatTokensToLoadedLexicalStatesByChapterMock,
} = vi.hoisted(() => ({
    editorTreeToLexicalStatesByChapterMock: vi.fn(),
    flatTokensToLoadedLexicalStatesByChapterMock: vi.fn(),
}));

vi.mock("@/app/domain/editor/serialization/usjToLexical.ts", () => ({
    editorTreeToLexicalStatesByChapter: editorTreeToLexicalStatesByChapterMock,
    flatTokensToLoadedLexicalStatesByChapter:
        flatTokensToLoadedLexicalStatesByChapterMock,
}));

const emptyProjection: ProjectedUsfmDocument = {
    tokens: [],
    editorTree: {
        type: "usj",
        version: "3.1",
        content: [],
    },
    lintIssues: [],
};

function makeProject(
    path: string,
    text = "\\id GEN Test\n",
): {
    project: Project;
    getBookMock: ReturnType<typeof vi.fn>;
} {
    const getBookMock = vi.fn(async () => text);
    return {
        project: {
            id: "project",
            name: "Project",
            files: [
                {
                    path,
                    title: "Genesis",
                    bookCode: "GEN",
                    nextBookId: null,
                    prevBookId: null,
                },
            ],
            metadata: {
                id: "project",
                name: "Project",
                language: {
                    id: "en",
                    name: "English",
                    direction: "ltr",
                },
            },
            projectDir: {} as never,
            fileWriter: {} as never,
            addBook: vi.fn(),
            getBook: getBookMock,
        },
        getBookMock,
    };
}

function makeService(args: {
    supportsPathIo: boolean;
    projectBatchFromPaths?: ReturnType<typeof vi.fn>;
    projectFromPath?: ReturnType<typeof vi.fn>;
    projectFromText?: ReturnType<typeof vi.fn>;
}): IUsfmOnionService {
    return {
        supportsPathIo: args.supportsPathIo,
        projectUsfmBatchFromPaths:
            args.projectBatchFromPaths ?? vi.fn(async () => [emptyProjection]),
        projectUsfm: args.projectFromText ?? vi.fn(async () => emptyProjection),
        projectUsfmFromPath:
            args.projectFromPath ?? vi.fn(async () => emptyProjection),
    } as unknown as IUsfmOnionService;
}

describe("loadedProjectToParsedFiles", () => {
    it("uses projectUsfmBatchFromPaths when desktop path I/O is available", async () => {
        const projectBatchFromPaths = vi.fn(async () => [emptyProjection]);
        const projectFromPath = vi.fn(async () => emptyProjection);
        const projectFromText = vi.fn(async () => emptyProjection);
        const service = makeService({
            supportsPathIo: true,
            projectBatchFromPaths,
            projectFromPath,
            projectFromText,
        });
        editorTreeToLexicalStatesByChapterMock.mockReturnValue({
            1: {
                lexicalState: {},
                loadedLexicalState: {},
            },
        });
        flatTokensToLoadedLexicalStatesByChapterMock.mockReturnValue({});
        const { project, getBookMock } = makeProject("/tmp/GEN.usfm");

        await loadedProjectToParsedFiles({
            loadedProject: project,
            editorMode: "regular" as EditorModeSetting,
            usfmOnionService: service,
        });

        expect(projectBatchFromPaths).toHaveBeenCalledTimes(1);
        expect(projectBatchFromPaths).toHaveBeenCalledWith(["/tmp/GEN.usfm"], {
            tokenOptions: { mergeHorizontalWhitespace: true },
            lintOptions: {},
        });
        expect(projectFromPath).not.toHaveBeenCalled();
        expect(projectFromText).not.toHaveBeenCalled();
        expect(getBookMock).not.toHaveBeenCalled();
    });

    it("falls back to projectUsfm(source) when path I/O is unavailable", async () => {
        const projectFromPath = vi.fn(async () => emptyProjection);
        const projectFromText = vi.fn(async () => emptyProjection);
        const service = makeService({
            supportsPathIo: false,
            projectFromPath,
            projectFromText,
        });
        editorTreeToLexicalStatesByChapterMock.mockReturnValue({
            1: {
                lexicalState: {},
                loadedLexicalState: {},
            },
        });
        flatTokensToLoadedLexicalStatesByChapterMock.mockReturnValue({});
        const { project, getBookMock } = makeProject(
            "/tmp/GEN.usfm",
            "\\id GEN From Text\n",
        );

        await loadedProjectToParsedFiles({
            loadedProject: project,
            editorMode: "regular" as EditorModeSetting,
            usfmOnionService: service,
        });

        expect(projectFromText).toHaveBeenCalledTimes(1);
        expect(projectFromText).toHaveBeenCalledWith("\\id GEN From Text\n", {
            tokenOptions: { mergeHorizontalWhitespace: true },
            lintOptions: {},
        });
        expect(projectFromPath).not.toHaveBeenCalled();
        expect(getBookMock).toHaveBeenCalledTimes(1);
    });
});
