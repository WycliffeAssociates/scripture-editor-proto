import { t } from "@lingui/core/macro";

/**
 * Short, localized labels for finding codes — the chips in the findings filter
 * menu (sibling of the per-source message localizers: {@link
 * localizeLocalLintMessage}, {@link localizeSousFindingMessage}, {@link
 * formatLintIssueMessage}). Where a message is a full sentence with params, a
 * label is a terse noun phrase naming the category.
 *
 * Every code that carries a localized *message* gets a label here so the filter
 * never shows a humanized raw identifier ("Hyg.control chars"). The humanizer
 * survives only as a last-resort guard for a brand-new engine code that reaches
 * the UI before it's mapped.
 */
export function localizeFindingCodeLabel(code: string): string {
  switch (code) {
    // local-lint: cross-chapter numbering + project consistency
    case "chapter-number-gap":
      return t`Chapter number gap`;
    case "chapter-number-decrease":
      return t`Chapters out of order`;
    case "chapter-starts-at-one":
      return t`Book doesn't start at chapter 1`;
    case "verse-number-gap":
      return t`Verse number gap`;
    case "verse-number-decrease":
      return t`Verses out of order`;
    case "verse-starts-at-one":
      return t`Chapter doesn't start at verse 1`;
    case "inconsistent-chapter-label":
      return t`Inconsistent chapter label`;

    // sous: content hygiene + lexing
    case "lex.excess-h-whitespace":
      return t`Extra spaces`;
    case "hyg.tab-in-body":
      return t`Tab character`;
    case "hyg.control-chars":
      return t`Hidden control characters`;
    case "hyg.zero-width-misuse":
      return t`Zero-width characters`;
    case "hyg.empty-verse":
      return t`Empty verse`;

    // usfm-onion: structure + marker validity
    case "missing-id-marker":
      return t`Missing \\id marker`;
    case "duplicate-id-marker":
      return t`Duplicate \\id marker`;
    case "id-marker-not-at-file-start":
      return t`\\id not at file start`;
    case "empty-paragraph":
      return t`Empty paragraph`;
    case "missing-chapter-number":
      return t`Missing chapter number`;
    case "missing-verse-number":
      return t`Missing verse number`;
    case "verse-is-empty":
      return t`Empty verse`;
    case "unknown-token":
      return t`Unknown token`;
    case "unknown-marker":
      return t`Unknown marker`;
    case "unknown-close-marker":
      return t`Unknown closing marker`;
    case "content-before-first-chapter":
      return t`Content before first chapter`;
    case "verse-outside-explicit-paragraph":
      return t`Verse with no paragraph`;
    case "note-submarker-outside-note":
      return t`Note marker outside a note`;
    case "metadata-outside-target":
      return t`Misplaced metadata`;
    case "marker-not-valid-in-context":
      return t`Marker not valid here`;
    case "missing-milestone-self-close":
      return t`Unclosed milestone`;
    case "stray-close-marker":
      return t`Stray closing marker`;
    case "misnested-close-marker":
      return t`Misnested closing marker`;
    case "implicitly-closed-marker":
      return t`Implicitly closed marker`;
    case "unclosed-marker":
      return t`Unclosed marker`;
    case "duplicate-chapter-number":
      return t`Duplicate chapter number`;
    case "duplicate-verse-number":
      return t`Duplicate verse number`;
    case "invalid-number-range":
      return t`Invalid number range`;
    case "number-range-not-preceded-by-marker-expecting-number":
      return t`Number without a marker`;
    case "missing-whitespace-before-marker":
      return t`Missing space before marker`;
    case "missing-horizontal-whitespace-after-marker-name":
      return t`Missing space after marker`;
    case "missing-tag-end-delimiter-after-marker":
      return t`Missing marker end delimiter`;
    case "missing-content-space-after-close-marker":
      return t`Missing space after closing marker`;
    case "verse-in-section-or-other-paragraph":
      return t`Verse in a section or heading`;
    case "content-after-blank-marker":
      return t`Content after blank marker`;

    default:
      return humanizeFindingCode(code);
  }
}

// Last-resort only: "lex.excess-h-whitespace" -> "Excess h whitespace". Add a
// `case` above for any code that actually surfaces — this exists so an unmapped
// new engine code degrades to readable rather than a raw dotted identifier.
function humanizeFindingCode(code: string): string {
  const tail = code.includes(".") ? code.slice(code.indexOf(".") + 1) : code;
  const spaced = tail.replace(/[-_]+/g, " ").trim();
  if (!spaced) return code;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
