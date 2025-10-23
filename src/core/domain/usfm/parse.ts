import {lexUsfm} from "@/core/domain/usfm/lex";
import type {LintableToken} from "@/core/domain/usfm/lint";
import {organizeByChapters, prepareTokens} from "@/core/domain/usfm/parseUtils";
import {type ParseContext, parseTokens} from "./tokenParsers";

export const parseUSFMfile = <T extends LintableToken>(
  text: string,
  partialParseCtx: Partial<ParseContext<T>> = {}
) => {
  const tokens = prepareTokens<T>(text, lexUsfm);
  const r = parseTokens({tokens, partialContext: partialParseCtx});

  const organized = organizeByChapters(r.tokens);
  return {usfm: organized, lintErrors: r.errorMessages};
};

export const parseUSFMChapter = <T extends LintableToken>(
  chapter: string,
  bookCode: string
) => {
  const tokens = prepareTokens<T>(chapter, lexUsfm);
  const r = parseTokens({tokens, partialContext: {bookCode}});
  const organized = organizeByChapters(r.tokens);
  return {usfm: organized, lintErrors: r.errorMessages};
};

export const lintExistingUsfmTokens = <T extends LintableToken>(
  tokens: T[],
  partialContext: Partial<ParseContext<T>> = {}
) => {
  const r = parseTokens({tokens, partialContext});
  return r.errorMessages;
};
