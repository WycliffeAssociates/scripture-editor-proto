import { describe, expect, it, vi } from "vitest";

import { scriptureProjectToParsedFiles } from "@/app/domain/api/scriptureProjectToParsedFiles.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { ProjectedUsfmDocument } from "@/core/domain/usfm/usfmOnionTypes.ts";
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
      folderName: "project",
      displayName: "Project",
      projectPath: "/userData/projects/project",
      projectId: "project",
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
          path,
        },
      ],
      listBooks: async () => [],
      getBook: vi.fn(async () => ({
        bookCode: "GEN",
        title: "Genesis",
        fileName: "01-GEN.usfm",
        storageKey: "01-GEN.usfm",
        path,
        contents: await getBookMock(),
      })),
      saveBook: vi.fn(),
      addBook: vi.fn(async () => ({
        bookCode: "GEN",
        title: "Genesis",
        fileName: "01-GEN.usfm",
        storageKey: "01-GEN.usfm",
        path,
      })),
      removeBook: vi.fn(),
      listVersions: vi.fn(async () => []),
      restoreVersion: vi.fn(async () => {}),
      stageAndCommit: vi.fn(async () => ({ hash: "abc123" })),
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
    parseUsfmBatchFromPaths:
      args.parseBatchFromPaths ?? vi.fn(async () => [emptyProjection]),
    parseUsfmBatchFromContents:
      args.parseBatchFromContents ?? vi.fn(async () => [emptyProjection]),
    parseUsfm: args.parseFromText ?? vi.fn(async () => emptyProjection),
  } as unknown as IUsfmOnionService;
}

describe("scriptureProjectToParsedFiles", () => {
  it("uses parseUsfmBatchFromPaths when desktop path I/O is available", async () => {
    const parseBatchFromPaths = vi.fn(async () => [emptyProjection]);
    const parseFromText = vi.fn(async () => emptyProjection);
    const service = makeService({
      supportsPathIo: true,
      parseBatchFromPaths,
      parseFromText,
    });
    const { project, getBookMock } = makeProject("/tmp/GEN.usfm");

    await scriptureProjectToParsedFiles({
      loadedProject: project,
      usfmOnionService: service,
    });

    expect(parseBatchFromPaths).toHaveBeenCalledTimes(1);
    expect(parseBatchFromPaths).toHaveBeenCalledWith(["/tmp/GEN.usfm"], {
      tokenOptions: { mergeHorizontalWhitespace: false },
      includeSourceMd5: false,
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

    await scriptureProjectToParsedFiles({
      loadedProject: project,
      usfmOnionService: service,
    });

    expect(parseBatchFromContents).toHaveBeenCalledTimes(1);
    expect(parseBatchFromContents).toHaveBeenCalledWith(
      ["\\id GEN From Text\n"],
      {
        tokenOptions: { mergeHorizontalWhitespace: false },
        includeSourceMd5: false,
      },
    );
    expect(parseFromText).not.toHaveBeenCalled();
    expect(getBookMock).toHaveBeenCalledTimes(1);
  });
});
