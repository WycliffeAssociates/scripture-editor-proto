import { t } from "@lingui/core/macro";
import type { FindingArgs } from "scripture-sous-chef-web";

/** The `uni.nonletter-usage-anomaly` payload — the one sous rule whose message
 * interpolates its own evidence. Narrowed off the engine's closed union so a
 * shape change upstream is a compile error here. */
type NonletterUsageArgs = Extract<FindingArgs, { kind: "nonletter-usage" }>;

/**
 * UI-localized messages for scripture-sous-chef content findings, the sibling
 * of {@link formatLintIssueMessage}. sous emits `RuleId` strings (e.g.
 * `lex.excess-h-whitespace`); this maps the ones we surface to friendly,
 * translatable wording, with a humanized fallback so an unmapped rule never
 * shows a raw identifier.
 *
 * `args` is the finding's structured evidence, when the caller has it. Sous
 * findings reach the main thread as packed records carrying only a `hasArgs`
 * bit — full args stay in the worker's Galley and are fetched on demand — so the
 * live pipeline passes nothing today and the evidence-free sentence is what
 * renders. The args-driven wording below keys off the same closed enums, so it
 * lights up unchanged the moment a detail surface requests them.
 */
export function localizeSousFindingMessage(
  code: string,
  args?: FindingArgs | null,
): string {
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
    case "uni.nonletter-usage-anomaly":
      return localizeNonletterUsageMessage(
        args?.kind === "nonletter-usage" ? args : undefined,
      );
    default:
      return humanizeSousCode(code);
  }
}

/**
 * `uni.nonletter-usage-anomaly` names the exact habit the occurrence stands
 * against, then the plain counts backing that habit up. Three things shape the
 * wording:
 *
 *  - **Counts, never statistics vocabulary.** A reviewer reads "in 3 of 1,601
 *    other places", never a confidence adjective.
 *  - **Leave-one-out counts.** The occurrence being described is excluded from
 *    both numbers, so "0 of 1,601 other places" is literally true and needs no
 *    hedging. Rarity counts *places* (maximal non-letter runs) and is also
 *    leave-one-out, so the honest number of places is `count + 1`.
 *  - **Never a correctness claim.** Nothing here says the occurrence is wrong,
 *    misspelled or misplaced — only that this translation does not otherwise do
 *    it. "This translation", never "this language".
 *
 * Whole sentences per case rather than a glued-together fragment: a translator
 * needs the sentence. Start/end are *logical* sides — the engine never reports
 * visual left/right, so this text must not either.
 */
function localizeNonletterUsageMessage(args?: NonletterUsageArgs): string {
  if (!args) {
    return t`A non-letter used in a way this translation almost never uses it.`;
  }
  const { glyph, partner, count, total } = args;
  switch (args.reason) {
    case "rarity": {
      // `count` is leave-one-out over *places*, so one other place means two.
      const places = count + 1;
      return count === 0
        ? t`‘${glyph}’ appears in only one place in this translation.`
        : t`‘${glyph}’ appears in only ${places} places in this translation.`;
    }
    case "start":
      switch (args.form) {
        case "letter":
          return t`‘${glyph}’ is attached to a word at the start here; this translation writes it that way in ${count} of ${total} other places.`;
        case "digit":
          return t`‘${glyph}’ is attached to a number at the start here; this translation writes it that way in ${count} of ${total} other places.`;
        default:
          return t`‘${glyph}’ is spaced away at the start here; this translation writes it that way in ${count} of ${total} other places.`;
      }
    case "end":
      switch (args.form) {
        case "letter":
          return t`‘${glyph}’ is attached to a word at the end here; this translation writes it that way in ${count} of ${total} other places.`;
        case "digit":
          return t`‘${glyph}’ is attached to a number at the end here; this translation writes it that way in ${count} of ${total} other places.`;
        default:
          return t`‘${glyph}’ is spaced away at the end here; this translation writes it that way in ${count} of ${total} other places.`;
      }
    case "topology":
      switch (args.form) {
        case "both":
          return t`‘${glyph}’ is attached to text at both ends here; this translation writes it that way in ${count} of ${total} other places.`;
        case "start-only":
          return t`‘${glyph}’ is attached to text at the start only here; this translation writes it that way in ${count} of ${total} other places.`;
        case "end-only":
          return t`‘${glyph}’ is attached to text at the end only here; this translation writes it that way in ${count} of ${total} other places.`;
        default:
          return t`‘${glyph}’ is standing detached from the text here; this translation writes it that way in ${count} of ${total} other places.`;
      }
    case "pair":
      return t`‘${glyph}’ is written directly before ‘${partner}’ here; this translation writes that pairing in ${count} of ${total} other places.`;
    case "continuation":
      return t`‘${glyph}’ is repeated in a longer run here; this translation writes it that way in ${count} of ${total} other places.`;
    default:
      // The reason union is closed upstream, so a new channel arrives here as a
      // compile error rather than as silent wording drift.
      return unhandledReason(args.reason);
  }
}

function unhandledReason(reason: never): never {
  throw new Error(`Unhandled nonletter-usage reason: ${String(reason)}`);
}

// "lex.excess-h-whitespace" -> "Excess h whitespace". Not translated — add a
// `case` above for anything user-facing that needs real localization.
function humanizeSousCode(code: string): string {
  const tail = code.includes(".") ? code.slice(code.indexOf(".") + 1) : code;
  const spaced = tail.replace(/[-_]+/g, " ").trim();
  if (!spaced) return code;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
