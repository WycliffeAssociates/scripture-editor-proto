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
    parseBatchFromPaths?: ReturnType<typeof vi.fn>;
    parseBatchFromContents?: ReturnType<typeof vi.fn>;
    parseFromText?: ReturnType<typeof vi.fn>;
}): IUsfmOnionService {
    return {
        supportsPathIo: args.supportsPathIo,
        getMarkerCatalog: vi.fn(async () =>
            webUsfmOnionService.getMarkerCatalog(),
        ),
        parseUsfmBatchFromPaths:
            args.parseBatchFromPaths ?? vi.fn(async () => [emptyProjection]),
        parseUsfmBatchFromContents:
            args.parseBatchFromContents ??
            vi.fn(async () => [emptyProjection]),
        parseUsfm: args.parseFromText ?? vi.fn(async () => emptyProjection),
    } as unknown as IUsfmOnionService;
}

describe("loadedProjectToParsedFiles", () => {
    it("uses parseUsfmBatchFromPaths when desktop path I/O is available", async () => {
        const parseBatchFromPaths = vi.fn(async () => [emptyProjection]);
        const parseFromText = vi.fn(async () => emptyProjection);
        const service = makeService({
            supportsPathIo: true,
            parseBatchFromPaths,
            parseFromText,
        });
        const { project, getBookMock } = makeProject("/tmp/GEN.usfm");

        await loadedProjectToParsedFiles({
            loadedProject: project,
            editorMode: "regular" as EditorModeSetting,
            usfmOnionService: service,
        });

        expect(parseBatchFromPaths).toHaveBeenCalledTimes(1);
        expect(parseBatchFromPaths).toHaveBeenCalledWith(["/tmp/GEN.usfm"], {
            tokenOptions: { mergeHorizontalWhitespace: false },
            lintOptions: {},
        });
        expect(parseFromText).not.toHaveBeenCalled();
        expect(getBookMock).not.toHaveBeenCalled();
    });

    it("falls back to parseUsfm(source) when path I/O is unavailable", async () => {
        const parseBatchFromContents = vi.fn(async () => [emptyProjection]);
        const parseFromText = vi.fn(async () => emptyProjection);
        const service = makeService({
            supportsPathIo: false,
            parseBatchFromContents,
            parseFromText,
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

        expect(parseBatchFromContents).toHaveBeenCalledTimes(1);
        expect(parseBatchFromContents).toHaveBeenCalledWith(
            ["\\id GEN From Text\n"],
            {
                tokenOptions: { mergeHorizontalWhitespace: false },
                lintOptions: {},
            },
        );
        expect(parseFromText).not.toHaveBeenCalled();
        expect(getBookMock).toHaveBeenCalledTimes(1);
    });
});
