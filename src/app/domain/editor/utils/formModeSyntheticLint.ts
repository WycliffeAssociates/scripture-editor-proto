// formModeSyntheticLint.ts
//
// Form mode runs a small, deliberately NON-EXHAUSTIVE set of its own structural
// checks rather than the full lint pipeline. Form mode is an intentionally
// reduced, guided view of incomplete data — it is not trying to surface every
// rule the other editor modes do.
//
// For the conditions it DOES track, we still want the shared lint popover and
// its localized wording instead of one-off tooltips. So each tracked condition
// is mapped here to a synthetic `LintIssue`. There are two flavors:
//
//   1. PIPELINE-BACKED — the condition has a real lint-pipeline equivalent.
//      Use that `code`; the popover localizes it through
//      `formatLintIssueMessage(code)`, so we reuse the canonical translation
//      and `message` is just a fallback. (e.g. `verse-is-empty`.)
//
//   2. FORM-ONLY — no pipeline equivalent. Author the localized text right
//      here with `t\`…\`` and pass it as the message; `formatLintIssueMessage`
//      doesn't recognize the `form:`-namespaced code, so it falls through to
//      that message verbatim. The `form:` prefix can never collide with a real
//      `LintCode`.
//
// To add a form-only message: add a factory that calls `formOnlySyntheticIssue`
// with a `t\`…\`` string. Keep this list to what form mode actually surfaces.

import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

// `code` is widened past the pipeline's `LintCode` union on purpose so we can
// carry `form:`-namespaced codes; the object is cast once here rather than at
// every call site.
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
 * Form-only synthetic issue with no lint-pipeline equivalent. Pass an already
 * localized `t\`…\`` message; it renders verbatim via the popover because
 * `formatLintIssueMessage` falls through to `issue.message` for the
 * `form:`-namespaced code.
 */
export function formOnlySyntheticIssue(
    formCode: string,
    localizedMessage: string,
    sid?: string,
): LintIssue {
    return syntheticIssue(`form:${formCode}`, localizedMessage, sid);
}

/**
 * A verse-start row with no content. Pipeline-backed: reuses the pipeline's
 * localized `verse-is-empty` wording (the English string here is only a
 * fallback if that case is ever removed).
 */
export function emptyVerseSyntheticIssue(sid: string | undefined): LintIssue {
    return syntheticIssue("verse-is-empty", "This verse has no content.", sid);
}

// Example of a form-only message (uncomment + adapt when form mode needs one):
//
// export function poetryNeedsTextSyntheticIssue(sid?: string): LintIssue {
//     return formOnlySyntheticIssue(
//         "poetry-line-empty",
//         t`This poetry line is empty.`,
//         sid,
//     );
// }
