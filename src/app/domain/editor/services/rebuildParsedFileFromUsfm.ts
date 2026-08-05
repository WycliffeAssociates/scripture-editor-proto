import type { Token } from "usfm-onion-web";

import type { EditorShape } from "@/app/data/editor.ts";
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

/** A book's USFM already parsed and grouped, ready for a synchronous rebuild. */
export type RebuiltBookTokens = {
  bookCode: string;
  tokensByChapter: Record<number, Token[]>;
};

/**
 * Parse USFM for a later rebuild.
 *
 * Split out from the rebuild itself so a caller on the SYNCHRONOUS commit door
 * (`withWorkingFilesDraftSync`) can pay the parse before it opens the draft:
 * that door measures the draft the moment `mutate` returns, so a mutator that
 * awaits mid-write commits the pre-write state.
 */
export async function parseUsfmForRebuild(args: {
  bookCode: string;
  sourceUsfm: string;
  usfmOnionService: IUsfmOnionService;
}): Promise<RebuiltBookTokens> {
  const projection = await args.usfmOnionService.parseUsfm(args.sourceUsfm, {
    tokenOptions: {
      mergeHorizontalWhitespace: false,
    },
    lintOptions: null,
  });
  return {
    bookCode: args.bookCode,
    tokensByChapter: groupFlatTokensByChapter(
      normalizeTokenSids(projection.tokens, args.bookCode),
    ),
  };
}

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
  applyRebuiltBookTokens({
    targetFile: args.targetFile,
    rebuilt: await parseUsfmForRebuild({
      bookCode: args.targetFile.bookCode,
      sourceUsfm: args.sourceUsfm,
      usfmOnionService: args.usfmOnionService,
    }),
    shape: args.shape,
  });
}

/** Write already-parsed tokens over a book's chapters. Synchronous by design. */
export function applyRebuiltBookTokens(args: {
  targetFile: ScriptureBookState;
  rebuilt: RebuiltBookTokens;
  shape: EditorShape;
}): void {
  const direction =
    (args.targetFile.chapters[0]?.direction ?? LanguageDirection.LTR) ===
    LanguageDirection.RTL
      ? LanguageDirection.RTL
      : LanguageDirection.LTR;

  const sourceTokensByChapter = args.rebuilt.tokensByChapter;

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
      const nextLexicalState = tokensToLexical({
        tokens: nextCurrentTokens,
        direction,
        mode: args.shape,
      });
      const eol = existingChapter?.eol ?? detectLineEnding(nextSourceTokens);
      return {
        lexicalState: nextLexicalState,
        sourceTokens: structuredClone(nextSourceTokens),
        currentTokens: structuredClone(nextCurrentTokens),
        direction,
        chapterNumber,
        dirty:
          tokensToUsfm(nextCurrentTokens, eol) !==
          tokensToUsfm(nextSourceTokens, eol),
        eol,
      };
    })
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}
