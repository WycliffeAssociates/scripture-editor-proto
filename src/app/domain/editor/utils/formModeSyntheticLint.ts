// formModeSyntheticLint.ts
//
// Form mode runs a small, deliberately NON-EXHAUSTIVE set of its own structural
// checks rather than the full lint pipeline — it's a reduced, guided view of
// incomplete data, not an attempt to surface every rule the other editor modes
// do.
//
// For the conditions it DOES track, we want the shared lint popover and its
// localized wording instead of one-off tooltips, so each tracked condition maps
// to a synthetic `LintIssue` carrying a real pipeline `code`: the popover
// localizes it through `formatLintIssueMessage(code)`, so `message` here is only
// a fallback.

import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function syntheticIssue(
  code: string,
  message: string,
  sid: string | undefined,
): LintIssue {
  return {
    code,
    category: "structure",
    severity: "error",
    issueType: "content",
    template: "",
    message,
    messageParams: {},
    sid: sid || undefined,
  } as LintIssue;
}

/**
 * A verse-start row with no content. Reuses the pipeline's localized
 * `verse-is-empty` wording (the English string here is only a fallback if that
 * pipeline case is ever removed).
 */
export function emptyVerseSyntheticIssue(sid: string | undefined): LintIssue {
  return syntheticIssue("verse-is-empty", "This verse has no content.", sid);
}
