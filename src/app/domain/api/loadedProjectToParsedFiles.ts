import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { ParsedFile } from "@/app/data/parsedProject.ts";
import type {
    CachedFileSection,
    ProjectWarmCacheBlob,
} from "@/app/domain/cache/ProjectWarmCacheProvider.ts";
import { parsedUsfmTokensToLexicalStates } from "@/app/domain/editor/serialization/fromSerializedToLexical.ts";
import {
    getBookSlug,
    sortUsfmFilesByCanonicalOrder,
} from "@/core/data/bible/bible.ts";
import type { LintError } from "@/core/data/usfm/lint.ts";
import { parseUSFMfile } from "@/core/domain/usfm/parse.ts";
import type { Project } from "@/core/persistence/ProjectRepository.ts";

type LoadedProjectBookEntry = {
    bookCode: string;
    title: string;
    path: string;
    sort?: number;
};

function mapLexicalStateForMode(args: {
    flatLexicalState: CachedFileSection["chapters"][number]["flatLexicalState"];
    paragraphLexicalState: CachedFileSection["chapters"][number]["paragraphLexicalState"];
    editorMode: EditorModeSetting;
}) {
    if (args.editorMode === "usfm" || args.editorMode === "plain") {
        return args.flatLexicalState;
    }
    return args.paragraphLexicalState;
}

export function selectLexicalStateForEditorMode(args: {
    section: CachedFileSection;
    editorMode: EditorModeSetting;
}) {
    return args.section.chapters.map((chapter) => ({
        chapNumber: chapter.chapNumber,
        loadedLexicalState: structuredClone(chapter.loadedLexicalState),
        lexicalState: structuredClone(
            mapLexicalStateForMode({
                flatLexicalState: chapter.flatLexicalState,
                paragraphLexicalState: chapter.paragraphLexicalState,
                editorMode: args.editorMode,
            }),
        ),
        dirty: false,
    }));
}

export function cachedFileSectionToParsedFile(args: {
    cacheSection: CachedFileSection;
    fileEntry: LoadedProjectBookEntry;
    editorMode: EditorModeSetting;
    prevBookId: string | null;
    nextBookId: string | null;
}): ParsedFile {
    return {
        path: args.fileEntry.path,
        prevBookId: args.prevBookId,
        nextBookId: args.nextBookId,
        title: args.fileEntry.title,
        bookCode: getBookSlug(args.fileEntry.bookCode),
        sort: args.fileEntry.sort,
        chapters: selectLexicalStateForEditorMode({
            section: args.cacheSection,
            editorMode: args.editorMode,
        }),
    };
}

export function parseBookTextToCachedFileSection(args: {
    relativePath: string;
    checksumSha1: string;
    bookCode: string;
    title: string;
    sort?: number;
    text: string;
    languageDirection: "ltr" | "rtl";
}): CachedFileSection {
    const { usfm, lintErrors } = parseUSFMfile(args.text);
    return {
        relativePath: args.relativePath,
        checksumSha1: args.checksumSha1,
        bookCode: getBookSlug(args.bookCode),
        title: args.title,
        sort: args.sort,
        lintErrors,
        chapters: Object.entries(usfm).map(([chapter, tokens]) => {
            const flatStates = parsedUsfmTokensToLexicalStates(
                tokens,
                args.languageDirection,
                false,
            );
            const paragraphStates = parsedUsfmTokensToLexicalStates(
                tokens,
                args.languageDirection,
                true,
            );
            return {
                chapNumber: Number(chapter),
                tokens,
                loadedLexicalState: flatStates.loadedLexicalState,
                flatLexicalState: flatStates.lexicalState,
                paragraphLexicalState: paragraphStates.lexicalState,
            };
        }),
    };
}

export function buildProjectWarmCacheBlob(args: {
    loadedProject: Project;
    files: CachedFileSection[];
}): ProjectWarmCacheBlob {
    return {
        schemaVersion: 1,
        projectPath: args.loadedProject.projectDir.path,
        projectId: args.loadedProject.metadata.id,
        languageDirection: args.loadedProject.metadata.language.direction,
        updatedAtIso: new Date().toISOString(),
        files: args.files,
    };
}

type LoadedProjectToParsedEntriesArgs = {
    entries: Array<{
        bookCode: string;
        title: string;
        path: string;
        sort?: number;
        cacheSection: CachedFileSection;
    }>;
    editorMode: EditorModeSetting;
};

export function cachedEntriesToParsedFiles(
    args: LoadedProjectToParsedEntriesArgs,
): {
    parsedFiles: ParsedFile[];
    allInitialLintErrors: LintError[];
} {
    const sorted = sortUsfmFilesByCanonicalOrder(args.entries, "bookCode");
    const allInitialLintErrors: LintError[] = [];
    const parsedFiles = sorted.map((entry, index) => {
        allInitialLintErrors.push(...entry.cacheSection.lintErrors);
        return cachedFileSectionToParsedFile({
            cacheSection: entry.cacheSection,
            fileEntry: entry,
            prevBookId:
                index === 0
                    ? null
                    : getBookSlug(sorted[index - 1]?.bookCode ?? ""),
            nextBookId:
                index === sorted.length - 1
                    ? null
                    : getBookSlug(sorted[index + 1]?.bookCode ?? ""),
            editorMode: args.editorMode,
        });
    });
    return { parsedFiles, allInitialLintErrors };
}

export async function loadedProjectToParsedFiles(args: {
    loadedProject: Project;
    editorMode: EditorModeSetting;
}): Promise<{
    parsedFiles: ParsedFile[];
    allInitialLintErrors: LintError[];
}> {
    const entries: Array<{
        bookCode: string;
        title: string;
        path: string;
        sort?: number;
        cacheSection: CachedFileSection;
    }> = [];

    for (const entry of args.loadedProject.files) {
        const bookContent = args.loadedProject.getBook(entry.bookCode);
        if (bookContent) {
            const text = await bookContent;
            if (!text) continue;
            entries.push({
                bookCode: entry.bookCode,
                title: entry.title,
                path: entry.path,
                sort: entry.sort,
                cacheSection: parseBookTextToCachedFileSection({
                    relativePath: entry.path,
                    checksumSha1: "",
                    bookCode: entry.bookCode,
                    title: entry.title,
                    sort: entry.sort,
                    text,
                    languageDirection:
                        args.loadedProject.metadata.language.direction,
                }),
            });
        }
    }
    return cachedEntriesToParsedFiles({
        entries,
        editorMode: args.editorMode,
    });
}
