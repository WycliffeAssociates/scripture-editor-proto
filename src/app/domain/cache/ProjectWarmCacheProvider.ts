import type { SerializedEditorState, SerializedLexicalNode } from "lexical";
import type { LintError } from "@/core/data/usfm/lint.ts";
import type { ParsedToken } from "@/core/data/usfm/parse.ts";

export type CachedChapterSection = {
    chapNumber: number;
    tokens: ParsedToken[];
    loadedLexicalState: SerializedEditorState<SerializedLexicalNode>;
    flatLexicalState: SerializedEditorState<SerializedLexicalNode>;
    paragraphLexicalState: SerializedEditorState<SerializedLexicalNode>;
};

export type CachedFileSection = {
    relativePath: string;
    checksumSha1: string;
    bookCode: string;
    title: string;
    sort?: number;
    lintErrors: LintError[];
    chapters: CachedChapterSection[];
};

export type ProjectWarmCacheBlob = {
    schemaVersion: 1;
    projectPath: string;
    projectId: string;
    languageDirection: "ltr" | "rtl";
    updatedAtIso: string;
    files: CachedFileSection[];
};

export interface ProjectWarmCacheProvider {
    read(projectPath: string): Promise<ProjectWarmCacheBlob | null>;
    write(projectPath: string, blob: ProjectWarmCacheBlob): Promise<void>;
    clear(projectPath: string): Promise<void>;
}
