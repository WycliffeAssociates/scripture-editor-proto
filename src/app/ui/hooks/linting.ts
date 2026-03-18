import type { ParsedFile } from "@/app/data/parsedProject.ts";
import {
    collectFileTokens,
    collectWorkingFileTokens,
} from "@/app/ui/hooks/utils/editorUtils.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type { LintIssue, Token } from "@/core/domain/usfm/usfmOnionTypes.ts";

async function relintFlatTokens(
    tokens: Token[],
    usfmOnionService: IUsfmOnionService,
): Promise<LintIssue[]> {
    if (!tokens.length) {
        return [];
    }

    const [issues] = await usfmOnionService.lintScope([{ tokens }]);
    return issues ?? [];
}

export async function relintBookFile(
    file: ParsedFile,
    usfmOnionService: IUsfmOnionService,
): Promise<LintIssue[]> {
    const tokens = collectFileTokens(file, {
        structuralParagraphBreaks: true,
    });
    if (!tokens.length) {
        return [];
    }

    return relintFlatTokens(tokens, usfmOnionService);
}

export async function relintBookFiles(
    files: ParsedFile[],
    usfmOnionService: IUsfmOnionService,
): Promise<Record<string, LintIssue[]>> {
    if (!files.length) return {};

    const lintResults = await usfmOnionService.lintScope(
        collectWorkingFileTokens({
            files,
            options: { structuralParagraphBreaks: true },
        }).map(({ tokens }) => ({ tokens })),
    );

    const next: Record<string, LintIssue[]> = {};
    for (let i = 0; i < files.length; i++) {
        next[files[i].bookCode] = lintResults[i] ?? [];
    }
    return next;
}
