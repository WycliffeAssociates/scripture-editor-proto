import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import {
    editorTreeToLexicalStatesByChapter,
    flatTokensToLoadedLexicalStatesByChapter,
} from "@/app/domain/editor/serialization/usjToLexical.ts";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

export async function loadedProjectToParsedFiles(args: {
    loadedProject: Project;
    editorMode: EditorModeSetting;
    usfmOnionService: IUsfmOnionService;
}): Promise<{
    parsedFiles: ParsedFile[];
    allInitialLintErrors: LintIssue[];
}> {
    const entries: Array<{
        code: string;
        text: string | null;
        name: string;
        path: string;
    }> = [];

    for (const entry of args.loadedProject.files) {
        const canUsePathIo =
            args.usfmOnionService.supportsPathIo && Boolean(entry.path);
        if (canUsePathIo) {
            entries.push({
                code: entry.bookCode,
                name: entry.title,
                text: null,
                path: entry.path,
            });
            continue;
        }

        const text = await args.loadedProject.getBook(entry.bookCode);
        if (text) {
            entries.push({
                code: entry.bookCode,
                name: entry.title,
                text,
                path: entry.path,
            });
        }
    }

    const sorted = sortUsfmFilesByCanonicalOrder(entries, "code");
    const projectionOptions = {
        tokenOptions: {
            mergeHorizontalWhitespace: true,
        },
        lintOptions: {},
    };
    const pathBatchProjections = args.usfmOnionService.supportsPathIo
        ? await args.usfmOnionService.projectUsfmBatchFromPaths(
              sorted.map((book) => book.path),
              projectionOptions,
          )
        : null;
    const allInitialLintErrors: LintIssue[] = [];
    const parsed: ParsedFile[] = [];
    console.time("wasm onion parse total");
    for (let i = 0; i < sorted.length; i++) {
        const book = sorted[i];
        console.time(`get onion projections and lint`);
        const projection = args.usfmOnionService.supportsPathIo
            ? (pathBatchProjections?.[i] ?? null)
            : book.text
              ? await args.usfmOnionService.projectUsfm(
                    book.text,
                    projectionOptions,
                )
              : null;
        if (!projection) continue;
        const mergedTokens = projection.tokens;
        const editorTree = projection.editorTree;
        const lintIssues = projection.lintIssues ?? [];
        console.timeEnd(`get onion projections and lint`);
        const needsParagraphs =
            args.editorMode === "regular" || args.editorMode === "view";
        const chapters = editorTreeToLexicalStatesByChapter({
            tree: editorTree,
            direction: args.loadedProject.metadata.language.direction,
            needsParagraphs,
            loadedTokensByChapter: flatTokensToLoadedLexicalStatesByChapter(
                mergedTokens,
                args.loadedProject.metadata.language.direction,
            ),
        });
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
            chapters: Object.entries(chapters).map(([chapter, states]) => {
                return {
                    lexicalState: states.lexicalState,
                    loadedLexicalState: states.loadedLexicalState,
                    chapNumber: Number(chapter),
                    dirty: false,
                };
            }),
        });
    }
    console.timeEnd("wasm onion parse total");
    return { parsedFiles: parsed, allInitialLintErrors };
}
