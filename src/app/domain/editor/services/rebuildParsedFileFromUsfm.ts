import type { ParsedFile } from "@/app/data/parsedProject.ts";
import { groupFlatTokensByChapter } from "@/app/domain/editor/serialization/flatTokensByChapter.ts";
import {
    inferContentEditorModeFromRootChildren,
    onionFlatTokensToEditorState,
    onionFlatTokensToLoadedEditorState,
} from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";

export async function rebuildParsedFileFromUsfm(args: {
    targetFile: ParsedFile;
    sourceUsfm: string;
    usfmOnionService: IUsfmOnionService;
}) {
    const projection = await args.usfmOnionService.projectUsfm(
        args.sourceUsfm,
        {
            tokenOptions: {
                mergeHorizontalWhitespace: false,
            },
            lintOptions: null,
        },
    );

    const direction =
        (args.targetFile.chapters[0]?.lexicalState.root.direction ?? "ltr") ===
        "rtl"
            ? "rtl"
            : "ltr";
    const modeSampleChapter = args.targetFile.chapters[0];
    const needsParagraphs = modeSampleChapter
        ? inferContentEditorModeFromRootChildren(
              modeSampleChapter.lexicalState.root.children,
          ) === "regular"
        : true;

    const sourceTokensByChapter = groupFlatTokensByChapter(projection.tokens);

    args.targetFile.chapters = Object.entries(sourceTokensByChapter)
        .map(([chapterNum, nextCurrentTokens]) => {
            const chapNumber = Number(chapterNum);
            const existingChapter = args.targetFile.chapters.find(
                (candidate) => candidate.chapNumber === chapNumber,
            );
            const nextSourceTokens =
                existingChapter?.sourceTokens ??
                sourceTokensByChapter[chapNumber] ??
                [];
            const nextLoadedState = onionFlatTokensToLoadedEditorState({
                tokens: nextSourceTokens,
                direction,
            });
            const nextLexicalState = onionFlatTokensToEditorState({
                tokens: nextCurrentTokens,
                direction,
                targetMode: needsParagraphs ? "regular" : "usfm",
            });
            return {
                lexicalState: nextLexicalState,
                loadedLexicalState: nextLoadedState,
                sourceTokens: structuredClone(nextSourceTokens),
                currentTokens: structuredClone(nextCurrentTokens),
                chapNumber,
                dirty:
                    nextCurrentTokens.map((token) => token.text).join("") !==
                    nextSourceTokens.map((token) => token.text).join(""),
            };
        })
        .sort((a, b) => a.chapNumber - b.chapNumber);
}
