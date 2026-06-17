import { t } from "@lingui/core/macro";

import type { Finding } from "@/app/domain/editor/annotations/finding.ts";
import type { LocalLintCode } from "@/app/domain/editor/annotations/localLint/numberingRules.ts";

type LocalLintFinding = Extract<Finding, { source: "local-lint" }>;

/**
 * UI-localized messages for `local-lint` consistency findings, the sibling of
 * {@link formatLintIssueMessage} and {@link localizeSousFindingMessage}. The
 * finding is self-describing — its `code` selects the sentence and `params`
 * ({@link found}/{@link previous}) fills the numbers — so no engine string is
 * carried. The numbering arm's `code` is the closed `LocalLintCode`, so its
 * switch is exhaustive — a new code won't compile until it has a message.
 * `previous` is only set for gap/decrease, so it falls back for the rest.
 */
export function localizeLocalLintMessage(finding: LocalLintFinding): string {
  if (finding.code === "inconsistent-chapter-label") {
    return t`This chapter label “${finding.label}” differs from the rest of the project (“${finding.dominant}”).`;
  }
  // Narrowed to the numbering arm — `code` is a `LocalLintCode`, `params` set.
  const code: LocalLintCode = finding.code;
  const { found } = finding.params;
  const previous = finding.params.previous ?? "?";
  switch (code) {
    case "chapter-number-gap":
      return t`Chapter numbers jump from ${previous} to ${found} — a chapter looks missing.`;
    case "chapter-number-decrease":
      return t`Chapter ${found} comes after chapter ${previous}.`;
    case "chapter-starts-at-one":
      return t`This book starts at chapter ${found}, not chapter 1.`;
    case "verse-number-gap":
      return t`Verse numbers jump from ${previous} to ${found} — a verse looks missing.`;
    case "verse-number-decrease":
      return t`Verse ${found} comes after verse ${previous}.`;
    case "verse-starts-at-one":
      return t`This chapter starts at verse ${found}, not verse 1.`;
  }
}
