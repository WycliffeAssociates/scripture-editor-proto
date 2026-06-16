// parseRecoveredBookContents.ts
//
// Recovery-only adapter: parse a single book's backed-up USFM string into
// per-chapter tokens + editor state. This is the narrow counterpart to
// `scriptureProjectToParsedFiles` (which parses a whole loaded project from
// disk). It exists so the route loader can turn a dirty-buffer backup back into
// chapter content WITHOUT going through the full project-open path.
//
// Throws on malformed USFM — the caller (recovery loader) catches that and
// surfaces it as a `usfm-parse-error` recovery report entry rather than aborting
// the whole reopen.

import type { SerializedEditorState, SerializedLexicalNode } from "lexical";

import type { EditorShape } from "@/app/data/editor.ts";
import { groupFlatTokensByChapter } from "@/app/domain/editor/serialization/flatTokensByChapter.ts";
import { tokensToLexical } from "@/app/domain/editor/utils/usfmTokenStreamSerializedAdapter.ts";
import type { LanguageDirection } from "@/core/domain/project/project.ts";
import type { IUsfmOnionService } from "@/core/domain/usfm/IUsfmOnionService.ts";
import { normalizeTokenSids } from "@/core/domain/usfm/tokenSidNormalization.ts";
import type {
  ProjectUsfmOptions,
  Token,
} from "@/core/domain/usfm/usfmOnionTypes.ts";

export type RecoveredChapterContent = {
  tokens: Token[];
  lexicalState: SerializedEditorState<SerializedLexicalNode>;
};

export async function parseRecoveredBookContents(args: {
  bookCode: string;
  content: string;
  direction: LanguageDirection;
  /** The `mainEditor` shape (see `shapeForSurface`). */
  shape: EditorShape;
  usfmOnionService: IUsfmOnionService;
}): Promise<Map<number, RecoveredChapterContent>> {
  const projectionOptions: ProjectUsfmOptions = {
    tokenOptions: { mergeHorizontalWhitespace: false },
    lintOptions: {},
  };
  const projected = await args.usfmOnionService.parseUsfmBatchFromContents(
    [args.content],
    projectionOptions,
  );
  const projection = projected[0];
  if (!projection) {
    throw new Error(`Recovered USFM for ${args.bookCode} could not be parsed`);
  }

  const normalizedTokens = normalizeTokenSids(projection.tokens, args.bookCode);
  const sourceTokensByChapter = groupFlatTokensByChapter(normalizedTokens);

  const result = new Map<number, RecoveredChapterContent>();
  for (const [chapter, tokens] of Object.entries(sourceTokensByChapter)) {
    const chapterNum = Number(chapter);
    result.set(chapterNum, {
      tokens,
      lexicalState: tokensToLexical({
        tokens,
        direction: args.direction,
        mode: args.shape,
      }),
    });
  }
  return result;
}
