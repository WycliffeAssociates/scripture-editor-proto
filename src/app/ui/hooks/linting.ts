import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { lexicalEditorStateToOnionLintFlatTokens } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import type {
    FlatToken,
    LintIssue,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

async function relintFlatTokens(
    tokens: FlatToken[],
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
    const flatTokens = file.chapters.flatMap((chapter) =>
        lexicalEditorStateToOnionLintFlatTokens(chapter.lexicalState),
    );
    if (!flatTokens.length) {
        return [];
    }

    return relintFlatTokens(flatTokens, usfmOnionService);
}

export async function relintBookFiles(
    files: ParsedFile[],
    usfmOnionService: IUsfmOnionService,
): Promise<Record<string, LintIssue[]>> {
    if (!files.length) return {};

    const lintResults = await usfmOnionService.lintScope(
        files.map((file) => ({
            tokens: file.chapters.flatMap((chapter) =>
                lexicalEditorStateToOnionLintFlatTokens(chapter.lexicalState),
            ),
        })),
    );

    const next: Record<string, LintIssue[]> = {};
    for (let i = 0; i < files.length; i++) {
        next[files[i].bookCode] = lintResults[i] ?? [];
    }
    return next;
}
