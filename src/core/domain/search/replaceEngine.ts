import { escapeRegex } from "@/core/domain/search/searchEngine.ts";

/**
 * Replace helpers shared by app-level search/replace flows.
 *
 * The search layer finds matches against projected chapter text. These helpers are
 * the small pure string operations used once a caller has already decided which
 * match or text block should be rewritten.
 */
function buildSearchRegex(args: {
  searchTerm: string;
  matchCase: boolean;
  matchWholeWord: boolean;
}): RegExp {
  const escapedTerm = escapeRegex(args.searchTerm);
  const pattern = args.matchWholeWord ? `\\b${escapedTerm}\\b` : escapedTerm;
  const flags = args.matchCase ? "g" : "gi";
  return new RegExp(pattern, flags);
}

/**
 * Replace one known match span inside a single text buffer.
 */
export function replaceInNodeText(args: {
  text: string;
  start: number;
  end: number;
  replacement: string;
}): string {
  return (
    args.text.slice(0, args.start) +
    args.replacement +
    args.text.slice(args.end)
  );
}

/**
 * Replace every match of the current search query inside one text buffer.
 */
export function replaceMatchesInText(args: {
  text: string;
  searchTerm: string;
  replaceTerm: string;
  matchCase: boolean;
  matchWholeWord: boolean;
}): string {
  if (!args.searchTerm) return args.text;
  const regex = buildSearchRegex({
    searchTerm: args.searchTerm,
    matchCase: args.matchCase,
    matchWholeWord: args.matchWholeWord,
  });
  return args.text.replace(regex, args.replaceTerm);
}
