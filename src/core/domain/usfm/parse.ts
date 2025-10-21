import type {Token} from "moo";
import type {LintErrorKey} from "@/core/data/usfm/lint";
import {lexUsfm} from "@/core/domain/usfm/lex";
import {
  adjustEndingParaMarkerSids,
  calcSidsAndParaFlags,
  mergeHorizontalWhitespaceToAdjacent,
  nestCharsAndAssignAttributes,
  organizeByChapters,
} from "@/core/domain/usfm/parse-utils";
import {type BaseTokenContext, parseTokens} from "./parse-v2";
/* 
What if we go:
1. list of lexed tokens.
2. mark a set of tokens to remove
*/
export type LintError = {
  message: string;
  sid: string;
  msgKey: LintErrorKey;
  nodeId: string;
};
export type TokenDuringParse = Token & {
  /* 
  Token is:
    toString(): string;
    type?: string | undefined;
    value: string;
    offset: number;
    text: string;
    lineBreaks: number;
    line: number;
    col: number;
  */
  tokenType: string;
  sid?: string;
  marker?: string;
  lintErrors?: Array<LintError>;
  isParaMarker?: boolean;
  inPara?: string;
  inChars?: Array<string>;
  id: string;
  content?: Array<TokenDuringParse>;
  attributes?: Record<string, string>;
};
export const parseUSFMfile = (
  text: string,
  partialBaseTokenContext: Partial<BaseTokenContext> = {}
) => {
  // type cast due to adding id as a stable type below for filter / parent ops
  const tokens = lexUsfm(text) as Array<TokenDuringParse>;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    //  mutate instead of allocate in .map for performance
    tok.id = String(i);
    tok.tokenType = tok.type || "unknown type";
  }
  const r = parseTokens({tokens, partialBaseTokenContext});
  // const parser = new TokenParser(tokens, tokenIdMap);
  // const r = parser.parse();
  // // console.log(r.errorMessages);

  const organized = organizeByChapters(r.tokens);

  // todo: pass in as an option?
  // if (text.startsWith("\\id JUD")) {
  //   debugger;
  // }
  // removeVerticalWhiteSpaceInVerses(tokens);
  // filter(
  //   (t) => t.type !== TokenMap.verticalWhitespace
  // // );
  return {usfm: organized, lintErrors: r.errorMessages};
};

export const parseUSFMChapter = (chapter: string, bookCode: string) => {
  // type cast due to adding id as a stable type below for filter / parent ops
  const tokens = lexUsfm(chapter) as Array<TokenDuringParse>;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    //  mutate instead of allocate in .map for performance
    tok.id = String(i);
    tok.tokenType = tok.type || "unknown type";
  }
  const r = parseTokens({tokens, bookCode});
  const organized = organizeByChapters(r.tokens);
  return {usfm: organized, lintErrors: r.errorMessages};
};
