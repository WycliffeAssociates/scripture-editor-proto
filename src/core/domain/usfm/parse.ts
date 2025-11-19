import type { LintableToken } from "@/core/data/usfm/lint.ts";
import { lexUsfm } from "@/core/domain/usfm/lex.ts";
import {
  organizeByChapters,
  preparedAlreadyGivenTokens,
  prepareTokens,
} from "@/core/domain/usfm/parseUtils.ts";
import { type ParseContext, parseTokens } from "./tokenParsers.ts";

export const parseUSFMfile = <T extends LintableToken>(
  text: string,
  partialParseCtx: Partial<ParseContext<T>> = {},
) => {
  const { tokens, bookCode } = prepareTokens<T>(text, lexUsfm);
  partialParseCtx.bookCode = bookCode;
  const r = parseTokens({ tokens, partialContext: partialParseCtx });

  const organized = organizeByChapters(r.tokens);
  // if (text.startsWith("\\id MRK")) {
  //   ;
  // }
  return { usfm: organized, lintErrors: r.errorMessages };
};

export const parseUSFMChapter = <T extends LintableToken>(
  chapter: string,
  bookCode: string,
) => {
  const { tokens } = prepareTokens<T>(chapter, lexUsfm);
  const r = parseTokens({ tokens, partialContext: { bookCode } });
  const organized = organizeByChapters(r.tokens);
  return { usfm: organized, lintErrors: r.errorMessages };
};

export const lintExistingUsfmTokens = <T extends LintableToken>(
  tokens: T[],
  partialContext: Partial<ParseContext<T>> = {},
) => {
  // todo: run a prepare pass on these to make sure marker is trimmed and all?
  const { bookCode } = preparedAlreadyGivenTokens(tokens);
  partialContext.bookCode = bookCode;
  const r = parseTokens({ tokens, partialContext });
  return r.errorMessages;
};
