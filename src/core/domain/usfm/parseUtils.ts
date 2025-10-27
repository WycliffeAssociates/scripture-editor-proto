import type {Token} from "moo";
import type {LintableToken} from "@/core/data/usfm/lint";
import {createParsedToken} from "@/core/data/usfm/parse";
import {
  markerTrimNoSlash,
  TokenMap,
  type TokenName,
  type TokenNameSubset,
} from "@/core/domain/usfm/lex";
import type {LintOrParseFxn} from "@/core/domain/usfm/lint";
import type {ParseContext} from "@/core/domain/usfm/tokenParsers";

export const mergeHorizontalWhitespaceToAdjacent = (
  tokens: LintableToken[]
): LintableToken[] => {
  const wsTypes: TokenNameSubset = new Set([TokenMap.horizontalWhitespace]);
  const avoidPushingPrevTo: TokenNameSubset = new Set([
    TokenMap.endMarker,
    TokenMap.implicitClose,
  ]);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t?.tokenType && wsTypes.has(t.tokenType as TokenName)) {
      const prev = tokens[i - 1];
      const next = tokens[i + 1];
      if (!prev) continue;
      if (avoidPushingPrevTo.has(prev.tokenType as TokenName) && next) {
        next.text = `${t.text}${next.text}`;
      } else {
        prev.text += t.text;
      }
      tokens.splice(i, 1);
      i--;
    }
  }
  return tokens;
};

export const removeVerticalWhiteSpaceInVerses: LintOrParseFxn<LintableToken> = (
  ctx: ParseContext<LintableToken>
) => {
  const {currentToken, nextToken, twoFromCurrent, idsToFilterOut} = ctx;
  if (currentToken?.tokenType !== TokenMap.marker) return;
  if (!nextToken || nextToken.tokenType !== TokenMap.verticalWhitespace) return;
  if (!twoFromCurrent || twoFromCurrent.tokenType !== TokenMap.marker) return;

  // this pattern: \v {#} text BR \v {#}
  if (
    nextToken?.tokenType === TokenMap.verticalWhitespace &&
    twoFromCurrent?.tokenType === TokenMap.marker &&
    markerTrimNoSlash(twoFromCurrent.text) === "v"
  ) {
    // remove the vertical whitespace
    idsToFilterOut.push(nextToken.id);
  }
};

export const organizeByChapters = <T extends LintableToken>(
  parsedTokens: T[]
) => {
  const chapMatch = /\w{3}\s+(\d{1,3})/;
  const processed = parsedTokens.reduce(
    (acc, token) => {
      const chapterMatch = token?.sid?.match(chapMatch);

      const chap = chapterMatch?.[1];
      if (chap && chap !== acc.curIdx.toString()) {
        acc.curIdx = parseInt(chap, 10);
        acc.chapters[acc.curIdx] = [];
      }

      acc.chapters[acc.curIdx].push(createParsedToken<T>(token));
      return acc;
    },
    {
      curIdx: 0,
      chapters: {
        0: [],
      } as Record<number, T[]>,
    }
  );
  return processed.chapters;
};

export function prepareTokens<T extends LintableToken>(
  text: string,
  lexFn: (src: string) => Token[]
): Array<T & Token> {
  const tokens = lexFn(text) as Array<T & Token>;
  // if (text.startsWith("\\id MRK")) {
  //   debugger;
  // }
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    tok.id = String(i);
    tok.tokenType = tok.type || "unknown type";
  }
  return tokens;
}
