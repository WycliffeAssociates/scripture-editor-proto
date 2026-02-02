import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { parsedUsfmTokensToLexicalStates } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import type { IMd5Service } from "@/core/domain/md5/IMd5Service.ts";
import { parseUSFMfile } from "@/core/domain/usfm/parse.ts";
import type { IProjectRepository } from "@/core/persistence/ProjectRepository.ts";

export async function projectParamToParsedFiles(
    projectRepository: IProjectRepository,
    project: string | undefined,
    md5Service: IMd5Service,
    editorMode: EditorModeSetting,
) {
    if (project === "undefined") return;
    if (!project) return;

    const loadedProject = await projectRepository.loadProject(
        project,
        md5Service,
    );
    if (!loadedProject) return;

    console.time("total load time");
    const language = loadedProject.metadata.language;
    const entries: Array<{
        code: string;
        text: string;
        name: string;
        path: string;
    }> = [];

    for (const entry of loadedProject.files) {
        const bookContent = loadedProject.getBook(entry.bookCode);
        if (entries && bookContent) {
            const text = await bookContent;
            if (!text) continue;
            entries.push({
                code: entry.bookCode,
                name: entry.title,
                text: text,
                path: entry.path,
            });
        }
    }

    const sorted = sortUsfmFilesByCanonicalOrder(entries, "code");
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
                    : getBookSlug(sorted[i + 1]?.code ?? ""),
            prevBookId: i === 0 ? null : getBookSlug(sorted[i - 1]?.code ?? ""),
            title: book.name,
            bookCode: getBookSlug(book.code),
            chapters: Object.entries(usfm).map(([chapter, tokens]) => {
                const needsParagraphs = editorMode === "regular";
                const { lexicalState, loadedLexicalState } =
                    parsedUsfmTokensToLexicalStates(
                        tokens,
                        language.direction,
                        needsParagraphs,
                    );
                return {
                    lexicalState,
                    loadedLexicalState,
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
