import {
    type EditorModeSetting,
    type EditorShape,
    editorModeToShape,
} from "@/app/data/editor.ts";
import { groupFlatTokensByChapter } from "@/app/domain/editor/serialization/flatTokensByChapter.ts";
import { tokensToLexical } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import {
    buildLintMessagesByBook,
    type LintMessagesByBook,
} from "@/app/ui/hooks/lintState.ts";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { normalizeTokenSids } from "@/core/domain/usfm/tokenSidNormalization.ts";
import type {
    LintIssue,
    ProjectedUsfmDocument,
    ProjectUsfmOptions,
} from "@/core/domain/usfm/usfmOnionTypes.ts";
import type { Project } from "@/core/persistence/ScriptureWorkspace.ts";

type LoadedBookEntry = {
    code: string;
    text: string | null;
    name: string;
    path: string;
};

/**
 * Materialize scripture books for environments where the parser cannot read
 * directly from managed file paths.
 *
 * On the web, OPFS data must often be read into JS first, so this helper asks
 * the loaded scripture noun for each book's contents and prepares the
 * in-memory batch that the parser will consume next.
 */
async function loadForWeb(args: {
    loadedProject: Project;
}): Promise<LoadedBookEntry[]> {
    const entries = await Promise.all(
        args.loadedProject.books.map(async (entry) => {
            const book = await args.loadedProject.getBook(entry.storageKey);
            return {
                code: entry.bookCode,
                name: entry.title,
                text: book.contents,
                path: entry.path,
            };
        }),
    );

    return entries;
}

/**
 * Prepare scripture book entries for environments where the parser can read
 * straight from managed file paths.
 *
 * Desktop/Tauri can usually avoid copying full book contents through JS, so we
 * keep only the path and let the parser open the files itself.
 */
async function loadForApp(args: {
    loadedProject: Project;
}): Promise<LoadedBookEntry[]> {
    return args.loadedProject.books.map((entry) => ({
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
    const projected = await args.usfmOnionService.parseUsfmBatchFromContents(
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
    const projections = await args.usfmOnionService.parseUsfmBatchFromPaths(
        args.entries.map((entry) => entry.path),
        args.projectionOptions,
    );
    return args.entries.map((_, index) => projections[index] ?? null);
}

/**
 * Build the editable scripture workspace state from a loaded scripture noun.
 *
 * This is the final step before the editor UI takes over. It batches parsing,
 * normalizes canonical order, collects initial lint issues, and produces the
 * per-book/per-chapter state shape used by the scripture editing hooks.
 */
export async function scriptureProjectToParsedFiles(args: {
    loadedProject: Project;
    editorMode: EditorModeSetting;
    usfmOnionService: IUsfmOnionService;
    /**
     * When true, the parser also returns each book's source md5 (hashed where
     * the bytes are read — Rust for path IO, JS for content IO), surfaced as
     * `diskMd5ByBook`. Only the editable workspace load needs it (crash-recovery
     * baselines); other callers leave it off and get an empty map.
     */
    includeSourceMd5?: boolean;
}): Promise<{
    parsedFiles: ScriptureBookState[];
    initialLintErrorsByBook: LintMessagesByBook;
    diskMd5ByBook: Map<string, string>;
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
        includeSourceMd5: args.includeSourceMd5 ?? false,
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
    const parsed: ScriptureBookState[] = [];
    const diskMd5ByBook = new Map<string, string>();
    for (let i = 0; i < sorted.length; i++) {
        const book = sorted[i];
        const projection = projections[i] ?? null;
        if (!projection) continue;
        const mergedTokens = projection.tokens;
        const lintIssues = projection.lintIssues ?? [];
        const initialLoadMode: EditorShape = editorModeToShape(args.editorMode);
        const bookCode = getBookSlug(book.code);
        if (projection.sourceMd5 !== undefined) {
            diskMd5ByBook.set(bookCode, projection.sourceMd5);
        }
        const normalizedTokens = normalizeTokenSids(mergedTokens, bookCode);
        const sourceTokensByChapter =
            groupFlatTokensByChapter(normalizedTokens);
        allInitialLintErrors.push(...lintIssues);
        const nextBookCode =
            i === sorted.length - 1
                ? null
                : getBookSlug(sorted[i + 1]?.code ?? "");
        const prevBookCode =
            i === 0 ? null : getBookSlug(sorted[i - 1]?.code ?? "");
        parsed.push({
            path: book.path,
            nextBookId: nextBookCode,
            prevBookId: prevBookCode,
            title: book.name,
            bookCode: bookCode,
            chapters: Object.entries(sourceTokensByChapter).map(
                ([chapter, sourceTokens]) => {
                    const chapterNum = Number(chapter);
                    const direction = args.loadedProject.language.direction;
                    const lexicalState = tokensToLexical({
                        tokens: sourceTokens,
                        direction,
                        mode: initialLoadMode,
                    });
                    const loadedLexicalState = tokensToLexical({
                        tokens: sourceTokens,
                        direction,
                        mode: "flat",
                    });

                    return {
                        lexicalState,
                        loadedLexicalState,
                        sourceTokens,
                        currentTokens: structuredClone(sourceTokens),
                        chapterNumber: chapterNum,
                        dirty: false,
                    };
                },
            ),
        });
    }
    return {
        parsedFiles: parsed,
        initialLintErrorsByBook: buildLintMessagesByBook(allInitialLintErrors),
        diskMd5ByBook,
    };
}
