import { lexUsfm } from "@/core/domain/usfm/lex";
import {
    calcSidsAndParaFlags,
    mergeHorizontalWhitespaceToAdjacent,
    nestCharsAndAssignAttributes,
    organizeByChapters,
} from "@/core/domain/usfm/parse-utils";
export const parseUSFMfile = (text: string) => {
    const tokens = lexUsfm(text);
    mergeHorizontalWhitespaceToAdjacent(tokens);
    const withSids = calcSidsAndParaFlags(tokens);
    const nestedAndAttrAssigned = nestCharsAndAssignAttributes(withSids);
    const organized = organizeByChapters(nestedAndAttrAssigned);
    return organized;
};

export const parseUSFMChapter = (chapter: string, bookCode: string) => {
    const tokens = lexUsfm(chapter);
    mergeHorizontalWhitespaceToAdjacent(tokens);
    const withSids = calcSidsAndParaFlags(tokens, bookCode);
    const nestedAndAttrAssigned = nestCharsAndAssignAttributes(withSids);
    const organized = organizeByChapters(nestedAndAttrAssigned);
    return organized;
};
