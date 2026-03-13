import { describe, expect, it, vi } from "vitest";
import type { EditorModeSetting } from "@/app/data/editor.ts";
import { loadedProjectToParsedFiles } from "@/app/domain/api/loadedProjectToParsedFiles.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { ProjectedUsfmDocument } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";
import { webUsfmOnionService } from "@/web/domain/usfm/WebUsfmOnionService.ts";

const { groupFlatTokensByChapterMock } = vi.hoisted(() => ({
    groupFlatTokensByChapterMock: vi.fn(() => ({
        1: [],
    })),
}));

vi.mock("@/app/domain/editor/serialization/usjToLexical.ts", () => ({
    groupFlatTokensByChapter: groupFlatTokensByChapterMock,
}));

const {
    onionFlatTokensToEditorStateMock,
    onionFlatTokensToLoadedEditorStateMock,
} = vi.hoisted(() => ({
    onionFlatTokensToEditorStateMock: vi.fn(() => ({})),
    onionFlatTokensToLoadedEditorStateMock: vi.fn(() => ({})),
}));

vi.mock(
    "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts",
    () => ({
        onionFlatTokensToEditorState: onionFlatTokensToEditorStateMock,
        onionFlatTokensToLoadedEditorState:
            onionFlatTokensToLoadedEditorStateMock,
    }),
);

const emptyProjection: ProjectedUsfmDocument = {
    tokens: [],
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
    projectBatchFromContents?: ReturnType<typeof vi.fn>;
    projectFromPath?: ReturnType<typeof vi.fn>;
    projectFromText?: ReturnType<typeof vi.fn>;
}): IUsfmOnionService {
    return {
        supportsPathIo: args.supportsPathIo,
        getMarkerCatalog: vi.fn(async () =>
            webUsfmOnionService.getMarkerCatalog(),
        ),
        projectUsfmBatchFromPaths:
            args.projectBatchFromPaths ?? vi.fn(async () => [emptyProjection]),
        projectUsfmBatchFromContents:
            args.projectBatchFromContents ??
            vi.fn(async () => [emptyProjection]),
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
        const { project, getBookMock } = makeProject("/tmp/GEN.usfm");

        await loadedProjectToParsedFiles({
            loadedProject: project,
            editorMode: "regular" as EditorModeSetting,
            usfmOnionService: service,
        });

        expect(projectBatchFromPaths).toHaveBeenCalledTimes(1);
        expect(projectBatchFromPaths).toHaveBeenCalledWith(["/tmp/GEN.usfm"], {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: {},
        });
        expect(projectFromPath).not.toHaveBeenCalled();
        expect(projectFromText).not.toHaveBeenCalled();
        expect(getBookMock).not.toHaveBeenCalled();
    });

    it("falls back to projectUsfm(source) when path I/O is unavailable", async () => {
        const projectBatchFromContents = vi.fn(async () => [emptyProjection]);
        const projectFromPath = vi.fn(async () => emptyProjection);
        const projectFromText = vi.fn(async () => emptyProjection);
        const service = makeService({
            supportsPathIo: false,
            projectBatchFromContents,
            projectFromPath,
            projectFromText,
        });
        const { project, getBookMock } = makeProject(
            "/tmp/GEN.usfm",
            "\\id GEN From Text\n",
        );

        await loadedProjectToParsedFiles({
            loadedProject: project,
            editorMode: "regular" as EditorModeSetting,
            usfmOnionService: service,
        });

        expect(projectBatchFromContents).toHaveBeenCalledTimes(1);
        expect(projectBatchFromContents).toHaveBeenCalledWith(
            ["\\id GEN From Text\n"],
            {
                tokenOptions: { mergeHorizontalWhitespace: false },
                lintOptions: {},
            },
        );
        expect(projectFromText).not.toHaveBeenCalled();
        expect(projectFromPath).not.toHaveBeenCalled();
        expect(getBookMock).toHaveBeenCalledTimes(1);
    });
});
