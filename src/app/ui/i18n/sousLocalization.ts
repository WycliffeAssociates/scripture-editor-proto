import { t } from "@lingui/core/macro";

/**
 * UI-localized messages for scripture-sous-chef content findings, the sibling
 * of {@link formatLintIssueMessage}. sous emits `RuleId` strings (e.g.
 * `lex.excess-h-whitespace`); this maps the ones we surface to friendly,
 * translatable wording, with a humanized fallback so an unmapped rule never
 * shows a raw identifier.
 */
export function localizeSousFindingMessage(code: string): string {
    switch (code) {
        case "lex.excess-h-whitespace":
            return t`Multiple spaces or a stray tab here — collapse to a single space.`;
        case "hyg.tab-in-body":
            return t`A tab character in the text — use a space instead.`;
        case "hyg.control-chars":
            return t`Hidden control character(s) in this text.`;
        case "hyg.zero-width-misuse":
            return t`Zero-width character(s) here that may not belong.`;
        case "hyg.empty-verse":
            return t`This verse has no content.`;
        default:
            return humanizeSousCode(code);
    }
}

// "lex.excess-h-whitespace" -> "Excess h whitespace". Not translated — add a
// `case` above for anything user-facing that needs real localization.
function humanizeSousCode(code: string): string {
    const tail = code.includes(".") ? code.slice(code.indexOf(".") + 1) : code;
    const spaced = tail.replace(/[-_]+/g, " ").trim();
    if (!spaced) return code;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
