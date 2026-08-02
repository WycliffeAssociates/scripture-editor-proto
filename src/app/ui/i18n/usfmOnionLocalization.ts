import { t } from "@lingui/core/macro";
import type { LintCode } from "usfm-onion-web";

import type { LintIssue, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * UI-localized labels for USFM onion diagnostics and fixes.
 *
 * The wording here mirrors the upstream ICU templates carried on each
 * {@link LintIssue}. The library renders an English `message` and also
 * exposes the canonical `template` plus the populated `messageParams`,
 * so localizers (this file) can re-render the same template against
 * translated wording without diverging from upstream semantics.
 */
function getParam(
  params: Record<string, string> | undefined,
  key: string,
  fallback = "",
) {
  return params?.[key] ?? fallback;
}

function markerForIssue(issue: LintIssue) {
  return getParam(issue.messageParams, "marker", issue.marker ?? "");
}

function markerForFix(fix: TokenFix) {
  return getParam(fix.labelParams, "marker", "");
}

export const LOCALIZED_LINT_CODES = [
  "missing-id-marker",
  "duplicate-id-marker",
  "id-marker-not-at-file-start",
  "empty-paragraph",
  "missing-chapter-number",
  "missing-verse-number",
  "verse-is-empty",
  "unknown-token",
  "unknown-marker",
  "unknown-close-marker",
  "content-before-first-chapter",
  "verse-outside-explicit-paragraph",
  "note-submarker-outside-note",
  "metadata-outside-target",
  "marker-not-valid-in-context",
  "missing-milestone-self-close",
  "stray-close-marker",
  "misnested-close-marker",
  "implicitly-closed-marker",
  "unclosed-marker",
  "duplicate-chapter-number",
  "duplicate-verse-number",
  "invalid-number-range",
  "number-range-not-preceded-by-marker-expecting-number",
  "missing-whitespace-before-marker",
  "missing-horizontal-whitespace-after-marker-name",
  "missing-tag-end-delimiter-after-marker",
  "missing-content-space-after-close-marker",
  "verse-in-section-or-other-paragraph",
  "content-after-blank-marker",
  "invalid-book-code",
  "book-code-not-uppercase",
] as const;

// Keep the app-owned wording census closed over the generated upstream union.
// A newly shipped Braid code must add a localized branch before this module
// typechecks; engine English is never an acceptable UI fallback.
const _allLintCodesCovered: Exclude<
  Exclude<LintCode, "book-id-mismatch">,
  (typeof LOCALIZED_LINT_CODES)[number]
> extends never
  ? true
  : never = true;
void _allLintCodesCovered;

export function formatLintIssueMessage(issue: LintIssue): string {
  const marker = markerForIssue(issue);
  const expected = getParam(issue.messageParams, "expected");
  const chapter = getParam(issue.messageParams, "chapter");
  const verse = getParam(issue.messageParams, "verse");
  const context = getParam(issue.messageParams, "context");
  const kind = getParam(issue.messageParams, "kind");
  const target = getParam(issue.messageParams, "target");
  const closer = getParam(issue.messageParams, "closer");
  const form = getParam(issue.messageParams, "form");
  const category = getParam(issue.messageParams, "category");
  const location = getParam(issue.messageParams, "location");
  const text = getParam(issue.messageParams, "text");
  switch (issue.code) {
    case "missing-id-marker":
      return t`File is missing its \\id (book identifier).`;
    case "duplicate-id-marker":
      return t`This file has more than one \\id; only one is allowed.`;
    case "id-marker-not-at-file-start":
      return t`\\id must come before any other content.`;
    case "empty-paragraph":
      return t`\\${marker} starts an empty paragraph — the next paragraph begins right after, with no content in between.`;
    case "missing-chapter-number":
      return t`\\c needs a chapter number after it.`;
    case "missing-verse-number":
      return t`\\v needs a verse number after it.`;
    case "verse-is-empty":
      return t`This verse has no content.`;
    case "unknown-token":
      return text
        ? t`Couldn't recognize "${text}".`
        : t`Couldn't recognize this token.`;
    case "unknown-marker":
      return t`\\${marker} is not a known USFM marker.`;
    case "unknown-close-marker":
      return t`\\${marker}* is not a known closing marker.`;
    case "content-before-first-chapter":
      if (kind === "paragraph") {
        return t`Paragraph marker \\${marker} appears before the first \\c.`;
      }
      if (kind === "verse") {
        return t`Verse marker \\v appears before the first \\c.`;
      }
      return t`\\${marker} appears before the first \\c.`;
    case "verse-outside-explicit-paragraph":
      return t`Verses must appear inside a paragraph, list, or table.`;
    case "note-submarker-outside-note":
      return t`\\${marker} is part of a footnote or cross-reference and must appear inside one.`;
    case "metadata-outside-target":
      if (target === "chapter") {
        return t`\\${marker} must follow a \\c chapter marker.`;
      }
      if (target === "verse") {
        return t`\\${marker} must follow a \\v verse marker.`;
      }
      return t`\\${marker} must follow its target marker.`;
    case "marker-not-valid-in-context":
      return context
        ? t`\\${marker} is not allowed inside a ${context}.`
        : t`\\${marker} is not allowed in this context.`;
    case "missing-milestone-self-close":
      return t`\\${marker} is a milestone and needs to end with \\*.`;
    case "stray-close-marker":
      if (form === "milestone-end") {
        return t`Found \\* with no open milestone to close.`;
      }
      return t`\\${marker}* has no matching opening \\${marker}.`;
    case "misnested-close-marker":
      return expected
        ? t`Expected \\${expected}* here, but found \\${marker}*.`
        : t`\\${marker}* does not match the marker that is currently open.`;
    case "implicitly-closed-marker":
      return t`\\${marker} was never closed; \\${closer}* closed it indirectly. Add an explicit \\${marker}* before \\${closer}*.`;
    case "unclosed-marker": {
      const kindLabel =
        kind === "note"
          ? t`Note`
          : kind === "character"
            ? t`Character marker`
            : t`Marker`;
      if (location === "at-eof") {
        return t`${kindLabel} \\${marker} was opened but never closed before the file ended.`;
      }
      if (location === "at-boundary") {
        return t`${kindLabel} \\${marker} was opened but never closed before a new block began.`;
      }
      return t`${kindLabel} \\${marker} was opened but never closed.`;
    }
    case "duplicate-chapter-number":
      return t`Chapter ${chapter} appears more than once.`;
    // chapter-expected-increase-by-one, inconsistent-chapter-label, and
    // verse-expected-increase-by-one were dropped from the library: they
    // are consistency heuristics, not USFM validity, and live as a
    // consumer-side token-space reduce.
    case "duplicate-verse-number":
      return t`Verse ${verse} appears more than once in chapter ${chapter}.`;
    case "invalid-number-range":
      return verse
        ? t`'${verse}' is not a valid verse range.`
        : t`This is not a valid verse range.`;
    case "number-range-not-preceded-by-marker-expecting-number":
      return t`This number range is not preceded by a marker that expects a number (like \\c or \\v).`;
    case "missing-whitespace-before-marker":
      return t`\\${marker} needs a space or newline before it.`;
    case "missing-horizontal-whitespace-after-marker-name":
      return t`\\${marker} needs a space after the marker name.`;
    case "missing-tag-end-delimiter-after-marker":
      return t`\\${marker} needs a space before the text that follows.`;
    case "missing-content-space-after-close-marker":
      return t`\\${marker}* is directly followed by text with no space. If this is an intentional contraction (e.g. \\nd Lord\\nd*'s) you can ignore this.`;
    case "verse-in-section-or-other-paragraph":
      if (category === "section") {
        return t`\\v is not allowed inside a section heading; verses must appear inside body paragraphs, lists, or tables.`;
      }
      return t`\\v is not allowed inside a non-content paragraph; verses must appear inside body paragraphs, lists, or tables.`;
    case "content-after-blank-marker":
      return t`\\${marker} is a blank line and takes no content; put this content in its own paragraph (\\p, \\q, …).`;
    case "invalid-book-code":
      return t`The \\id book code "${getParam(issue.messageParams, "code", text)}" is not a recognized USFM book identifier.`;
    case "book-code-not-uppercase":
      return t`The \\id book code "${getParam(issue.messageParams, "code", text)}" must be uppercase: ${getParam(issue.messageParams, "uppercase")}.`;
    case "book-id-mismatch":
      return t`The \\id book code does not match the book this file is expected to contain.`;
    default:
      return assertNever(issue.code);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled Braid lint code: ${String(value)}`);
}

// Last-resort prettifier for fix codes we haven't given an explicit localized
// label yet: turn an upstream enum name ("CollapseContentWhitespace" or
// "collapse-content-whitespace") into "Collapse content whitespace" so the
// button never shows a raw identifier. Not translated — add a `case` above for
// anything user-facing that needs real localization.
function humanizeFixLabel(label: string): string {
  const spaced = label
    .replace(/[-_]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return label;
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatTokenFixLabel(fix: TokenFix): string {
  const marker = markerForFix(fix);
  const number = getParam(fix.labelParams, "number");

  switch (fix.code) {
    case "insert-separator-after-marker":
      return t`Insert separator after ${marker}`;
    case "remove-empty-paragraph":
      return t`Remove empty ${marker} paragraph`;
    case "set-number":
      return t`Set number to ${number}`;
    case "split-unknown-token":
      return t`Split unknown token`;
    case "insert-close-marker":
      return t`Insert close marker for ${marker}`;
    case "collapse-content-whitespace":
      return t`Collapse to a single space`;
    case "collapse-whitespace-around-marker":
      return marker
        ? t`Collapse spaces around ${marker}`
        : t`Collapse extra spaces`;
    case "insert-whitespace-before-marker":
      return t`Add a space before ${marker}`;
    case "insert-whitespace-after-marker-name":
      return t`Add a space after ${marker}`;
    case "insert-tag-end-delimiter-after-marker":
      return t`Add required space after ${marker}`;
    default:
      return humanizeFixLabel(fix.label);
  }
}
