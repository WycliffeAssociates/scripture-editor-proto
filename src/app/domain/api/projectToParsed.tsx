import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { parsedUsfmTokensToJsonLexicalNode } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { canonicalBookMap } from "@/core/domain/project/bookMapping.ts";
import { generateUsfmFilename } from "@/core/domain/project/scriptureBurritoHelpers.ts";
import { parseUSFMfile } from "@/core/domain/usfm/parse.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

export async function projectParamToParsedFiles(
    projectRepository: IProjectRepository,
    project: string | undefined,
) {
    if (project === "undefined") return;
    if (!project) return;
    const loadedProject = await projectRepository.loadProject(project);

    if (!loadedProject) return;
    console.time("total load time");
    const language = loadedProject.metadata.language;
    const entries: Array<{
        code: string;
        text: string;
        name: string;
        path: string;
    }> = [];
    for (const bookName of Object.keys(canonicalBookMap)) {
        const bookContent = loadedProject.getBook(bookName);
        if (entries && bookContent) {
            const text = await bookContent;
            if (!text) continue;
            entries.push({
                code: bookName,
                name: bookName,
                text: text,
                path: `${loadedProject.projectDir.path}/${generateUsfmFilename(bookName)}`,
            });
        }
    }
    const sorted = sortUsfmFilesByCanonicalOrder(entries);
    // end here would prefer to wrap into a single abstraction
    // Next function call as parsing and going to lexicla state is separate is fine
    const allInitialLintErrors: LintError[] = [];

    console.time("parseAll");
    const parsed: ParsedFile[] = sorted.map((book, i) => {
        // console.time(`${book.name} parse`);
        const { usfm, lintErrors } = parseUSFMfile(book.text);
        allInitialLintErrors.push(...lintErrors);
        // console.timeEnd(`${book.name} parse`);
        return {
            path: book.path,
            nextBookId:
                i === sorted.length - 1
                    ? null
                    : getBookSlug(sorted[i + 1]?.name),
            prevBookId: i === 0 ? null : getBookSlug(sorted[i - 1]?.name),
            title: book.name,
            bookCode: getBookSlug(book.name),
            chapters: Object.entries(usfm).map(([chapter, tokens]) => {
                const initialState = parsedUsfmTokensToJsonLexicalNode(
                    tokens,
                    language.direction,
                );
                return {
                    lexicalState: initialState,
                    loadedLexicalState: initialState,
                    chapNumber: Number(chapter),
                    dirty: false,
                };
            }),
        };
    });
    console.timeEnd("parseAll");
    console.timeEnd("total load time");
    return { parsedFiles: parsed, allInitialLintErrors, loadedProject };
}
