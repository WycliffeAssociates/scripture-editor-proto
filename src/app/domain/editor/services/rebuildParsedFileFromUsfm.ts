import { type EditorShape, shapeForSurface } from "@/app/data/editor.ts";
import { groupFlatTokensByChapter } from "@/app/domain/editor/serialization/flatTokensByChapter.ts";
import {
    detectLineEnding,
    tokensToLexical,
    tokensToUsfm,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { ScriptureBookState } from "@/app/scripture/ScriptureWorkspaceState.ts";
import { LanguageDirection } from "@/core/domain/project/project.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { normalizeTokenSids } from "@/core/domain/usfm/tokenSidNormalization.ts";

/**
 * Rebuild one in-memory scripture book state from fresh USFM text.
 *
 * This is used when a workflow already has new USFM for a book and wants to
 * refresh the editable workspace state without reloading the entire project
 * from disk. It preserves direction expectations from the existing book state
 * while replacing the parsed chapter contents; the caller supplies the
 * `workingRebuild` shape so the rebuilt chapters stay in the user's mode.
 */
export async function rebuildParsedFileFromUsfm(args: {
    targetFile: ScriptureBookState;
    sourceUsfm: string;
    usfmOnionService: IUsfmOnionService;
    shape: EditorShape;
}) {
    const projection = await args.usfmOnionService.parseUsfm(args.sourceUsfm, {
        tokenOptions: {
            mergeHorizontalWhitespace: false,
        },
        lintOptions: null,
    });

    const direction =
        (args.targetFile.chapters[0]?.lexicalState.root.direction ??
            LanguageDirection.LTR) === LanguageDirection.RTL
            ? LanguageDirection.RTL
            : LanguageDirection.LTR;

    const normalizedTokens = normalizeTokenSids(
        projection.tokens,
        args.targetFile.bookCode,
    );
    const sourceTokensByChapter = groupFlatTokensByChapter(normalizedTokens);

    args.targetFile.chapters = Object.entries(sourceTokensByChapter)
        .map(([chapterNum, nextCurrentTokens]) => {
            const chapterNumber = Number(chapterNum);
            const existingChapter = args.targetFile.chapters.find(
                (candidate) => candidate.chapterNumber === chapterNumber,
            );
            const nextSourceTokens =
                existingChapter?.sourceTokens ??
                sourceTokensByChapter[chapterNumber] ??
                [];
            const nextLoadedState = tokensToLexical({
                tokens: nextSourceTokens,
                direction,
                mode: shapeForSurface("savedBaseline"),
            });
            const nextLexicalState = tokensToLexical({
                tokens: nextCurrentTokens,
                direction,
                mode: args.shape,
            });
            const eol =
                existingChapter?.eol ?? detectLineEnding(nextSourceTokens);
            return {
                lexicalState: nextLexicalState,
                loadedLexicalState: nextLoadedState,
                sourceTokens: structuredClone(nextSourceTokens),
                currentTokens: structuredClone(nextCurrentTokens),
                chapterNumber,
                dirty:
                    tokensToUsfm(nextCurrentTokens, eol) !==
                    tokensToUsfm(nextSourceTokens, eol),
                eol,
            };
        })
        .sort((a, b) => a.chapterNumber - b.chapterNumber);
}
