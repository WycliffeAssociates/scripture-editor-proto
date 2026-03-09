import type { ParsedFile } from "@/app/data/parsedProject.ts";
import {
    editorTreeToLexicalStatesByChapter,
    flatTokensToLoadedLexicalStatesByChapter,
} from "@/app/domain/editor/serialization/usjToLexical.ts";
import {
    inferContentEditorModeFromRootChildren,
    lexicalEditorStateToOnionUsfmString,
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
                mergeHorizontalWhitespace: true,
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

    const loadedTokensByChapter = Object.fromEntries(
        args.targetFile.chapters.map((existingChapter) => [
            existingChapter.chapNumber,
            existingChapter.loadedLexicalState,
        ]),
    );

    const rebuiltByChapter = editorTreeToLexicalStatesByChapter({
        tree: projection.editorTree,
        direction,
        needsParagraphs,
        loadedTokensByChapter:
            Object.keys(loadedTokensByChapter).length > 0
                ? loadedTokensByChapter
                : flatTokensToLoadedLexicalStatesByChapter(
                      projection.tokens,
                      direction,
                  ),
    });

    args.targetFile.chapters = Object.entries(rebuiltByChapter)
        .map(([chapterNum, states]) => {
            const chapNumber = Number(chapterNum);
            const existingChapter = args.targetFile.chapters.find(
                (candidate) => candidate.chapNumber === chapNumber,
            );
            const nextLexicalState = states.lexicalState;
            const nextLoadedState =
                existingChapter?.loadedLexicalState ??
                states.loadedLexicalState;
            return {
                lexicalState: nextLexicalState,
                loadedLexicalState: nextLoadedState,
                chapNumber,
                dirty:
                    lexicalEditorStateToOnionUsfmString(nextLexicalState) !==
                    lexicalEditorStateToOnionUsfmString(nextLoadedState),
            };
        })
        .sort((a, b) => a.chapNumber - b.chapNumber);
}
