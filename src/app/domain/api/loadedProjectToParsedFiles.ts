import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { parsedUsfmTokensToLexicalStates } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { parseUSFMfile } from "@/core/domain/usfm/parse.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

export async function loadedProjectToParsedFiles(args: {
    loadedProject: Project;
    editorMode: EditorModeSetting;
}): Promise<{
    parsedFiles: ParsedFile[];
    allInitialLintErrors: LintError[];
}> {
    const entries: Array<{
        code: string;
        text: string;
        name: string;
        path: string;
    }> = [];

    for (const entry of args.loadedProject.files) {
        const bookContent = args.loadedProject.getBook(entry.bookCode);
        if (bookContent) {
            const text = await bookContent;
            if (!text) continue;
            entries.push({
                code: entry.bookCode,
                name: entry.title,
                text,
                path: entry.path,
            });
        }
    }

    const sorted = sortUsfmFilesByCanonicalOrder(entries, "code");
    const allInitialLintErrors: LintError[] = [];
    const parsed: ParsedFile[] = sorted.map((book, i) => {
        const { usfm, lintErrors } = parseUSFMfile(book.text);
        allInitialLintErrors.push(...lintErrors);
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
                const needsParagraphs =
                    args.editorMode === "regular" || args.editorMode === "view";
                const { lexicalState, loadedLexicalState } =
                    parsedUsfmTokensToLexicalStates(
                        tokens,
                        args.loadedProject.metadata.language.direction,
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

    return { parsedFiles: parsed, allInitialLintErrors };
}
