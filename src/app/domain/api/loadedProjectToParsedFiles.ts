import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { groupFlatTokensByChapter } from "@/app/domain/editor/serialization/usjToLexical.ts";
import {
    onionFlatTokensToEditorState,
    onionFlatTokensToLoadedEditorState,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import {
    buildLintMessagesByBook,
    type LintMessagesByBook,
} from "@/app/ui/hooks/lintState.ts";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
    LintIssue,
    ProjectedUsfmDocument,
    ProjectUsfmOptions,
} from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

type LoadedBookEntry = {
    code: string;
    text: string | null;
    name: string;
    path: string;
};

async function loadForWeb(args: {
    loadedProject: Project;
}): Promise<LoadedBookEntry[]> {
    const entries: LoadedBookEntry[] = [];

    for (const entry of args.loadedProject.files) {
        const text = await args.loadedProject.getBook(entry.bookCode);
        if (!text) continue;

        entries.push({
            code: entry.bookCode,
            name: entry.title,
            text,
            path: entry.path,
        });
    }

    return entries;
}

async function loadForApp(args: {
    loadedProject: Project;
}): Promise<LoadedBookEntry[]> {
    return args.loadedProject.files.map((entry) => ({
        code: entry.bookCode,
        name: entry.title,
        text: null,
        path: entry.path,
    }));
}

async function projectEntriesForWeb(args: {
    entries: LoadedBookEntry[];
    usfmOnionService: IUsfmOnionService;
    projectionOptions: ProjectUsfmOptions;
}): Promise<Array<ProjectedUsfmDocument | null>> {
    const sources = args.entries
        .map((entry) => entry.text)
        .filter((text): text is string => Boolean(text));
    const projected = await args.usfmOnionService.projectUsfmBatchFromContents(
        sources,
        args.projectionOptions,
    );
    let projectedIndex = 0;
    return args.entries.map((entry) => {
        if (!entry.text) return null;
        const projection = projected[projectedIndex] ?? null;
        projectedIndex += 1;
        return projection;
    });
}

async function projectEntriesForApp(args: {
    entries: LoadedBookEntry[];
    usfmOnionService: IUsfmOnionService;
    projectionOptions: ProjectUsfmOptions;
}): Promise<Array<ProjectedUsfmDocument | null>> {
    const projections = await args.usfmOnionService.projectUsfmBatchFromPaths(
        args.entries.map((entry) => entry.path),
        args.projectionOptions,
    );
    return args.entries.map((_, index) => projections[index] ?? null);
}

export async function loadedProjectToParsedFiles(args: {
    loadedProject: Project;
    editorMode: EditorModeSetting;
    usfmOnionService: IUsfmOnionService;
}): Promise<{
    parsedFiles: ParsedFile[];
    initialLintErrorsByBook: LintMessagesByBook;
}> {
    const entries = args.usfmOnionService.supportsPathIo
        ? await loadForApp({
              loadedProject: args.loadedProject,
          })
        : await loadForWeb({
              loadedProject: args.loadedProject,
          });

    const sorted = sortUsfmFilesByCanonicalOrder(entries, "code");
    const projectionOptions: ProjectUsfmOptions = {
        tokenOptions: {
            mergeHorizontalWhitespace: false,
        },
        lintOptions: {},
    };
    const projections = args.usfmOnionService.supportsPathIo
        ? await projectEntriesForApp({
              entries: sorted,
              usfmOnionService: args.usfmOnionService,
              projectionOptions,
          })
        : await projectEntriesForWeb({
              entries: sorted,
              usfmOnionService: args.usfmOnionService,
              projectionOptions,
          });
    const allInitialLintErrors: LintIssue[] = [];
    const parsed: ParsedFile[] = [];
    for (let i = 0; i < sorted.length; i++) {
        const book = sorted[i];
        const projection = projections[i] ?? null;
        if (!projection) continue;
        // debugger;
        const mergedTokens = projection.tokens;
        const lintIssues = projection.lintIssues ?? [];
        const needsParagraphs =
            args.editorMode === "regular" || args.editorMode === "view";
        const sourceTokensByChapter = groupFlatTokensByChapter(mergedTokens);
        allInitialLintErrors.push(...lintIssues);
        parsed.push({
            path: book.path,
            nextBookId:
                i === sorted.length - 1
                    ? null
                    : getBookSlug(sorted[i + 1]?.code ?? ""),
            prevBookId: i === 0 ? null : getBookSlug(sorted[i - 1]?.code ?? ""),
            title: book.name,
            bookCode: getBookSlug(book.code),
            chapters: Object.entries(sourceTokensByChapter).map(
                ([chapter, sourceTokens]) => {
                    const chapterNum = Number(chapter);
                    const direction =
                        args.loadedProject.metadata.language.direction;
                    const targetMode = needsParagraphs ? "regular" : "usfm";
                    const lexicalState = onionFlatTokensToEditorState({
                        tokens: sourceTokens,
                        direction,
                        targetMode,
                    });
                    const loadedLexicalState =
                        onionFlatTokensToLoadedEditorState({
                            tokens: sourceTokens,
                            direction,
                        });

                    return {
                        lexicalState,
                        loadedLexicalState,
                        sourceTokens,
                        currentTokens: structuredClone(sourceTokens),
                        chapNumber: chapterNum,
                        dirty: false,
                    };
                },
            ),
        });
    }
    return {
        parsedFiles: parsed,
        initialLintErrorsByBook: buildLintMessagesByBook(allInitialLintErrors),
    };
}
