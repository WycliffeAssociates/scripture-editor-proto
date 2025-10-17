import {lexUsfm, TokenMap} from "@/core/domain/usfm/lex";
import {
  adjustEndingParaMarkerSids,
  calcSidsAndParaFlags,
  mergeHorizontalWhitespaceToAdjacent,
  nestCharsAndAssignAttributes,
  organizeByChapters,
  removeVerticalWhiteSpaceInVerses,
} from "@/core/domain/usfm/parse-utils";
export const parseUSFMfile = (text: string) => {
  const tokens = lexUsfm(text);
  // todo: pass in as an option?
  removeVerticalWhiteSpaceInVerses(tokens);
  // filter(
  //   (t) => t.type !== TokenMap.verticalWhitespace
  // // );
  mergeHorizontalWhitespaceToAdjacent(tokens);
  const withSids = calcSidsAndParaFlags(tokens);
  adjustEndingParaMarkerSids(withSids);
  const nestedAndAttrAssigned = nestCharsAndAssignAttributes(withSids);
  const organized = organizeByChapters(nestedAndAttrAssigned);
  return organized;
};

export const parseUSFMChapter = (chapter: string, bookCode: string) => {
  const tokens = lexUsfm(chapter);
  removeVerticalWhiteSpaceInVerses(tokens);
  mergeHorizontalWhitespaceToAdjacent(tokens);
  const withSids = calcSidsAndParaFlags(tokens, bookCode);
  adjustEndingParaMarkerSids(withSids);
  const nestedAndAttrAssigned = nestCharsAndAssignAttributes(withSids);
  const organized = organizeByChapters(nestedAndAttrAssigned);
  return organized;
};
