import { t } from "@lingui/core/macro";
import type { LintIssue, TokenFix } from "@/core/domain/usfm/usfmOnionTypes.ts";

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
    return getParam(fix.label_params, "marker", "");
}

export const LOCALIZED_LINT_CODES = [
    "missing-separator-after-marker",
    "empty-paragraph",
    "number-range-after-chapter-marker",
    "verse-range-expected-after-verse-marker",
    "verse-content-not-empty",
    "unknown-token",
    "char-not-closed",
    "note-not-closed",
    "paragraph-before-first-chapter",
    "verse-before-first-chapter",
    "note-submarker-outside-note",
    "duplicate-id-marker",
    "id-marker-not-at-file-start",
    "chapter-metadata-outside-chapter",
    "verse-metadata-outside-verse",
    "missing-chapter-number",
    "missing-verse-number",
    "missing-milestone-self-close",
    "implicitly-closed-marker",
    "stray-close-marker",
    "misnested-close-marker",
    "unclosed-note",
    "unclosed-marker-at-eof",
    "duplicate-chapter-number",
    "chapter-expected-increase-by-one",
    "duplicate-verse-number",
    "verse-expected-increase-by-one",
    "invalid-number-range",
    "number-range-not-preceded-by-marker-expecting-number",
    "verse-text-follows-verse-range",
    "unknown-marker",
    "unknown-close-marker",
    "inconsistent-chapter-label",
    "marker-not-valid-in-context",
    "verse-outside-explicit-paragraph",
] as const;

export const LOCALIZED_TOKEN_FIX_CODES = [
    "insert-separator-after-marker",
    "remove-empty-paragraph",
    "set-number",
    "split-unknown-token",
    "insert-close-marker",
] as const;

export function formatLintIssueMessage(issue: LintIssue): string {
    const marker = markerForIssue(issue);
    const expected = getParam(issue.messageParams, "expected");
    const found = getParam(issue.messageParams, "found");
    const chapter = getParam(issue.messageParams, "chapter");
    const verse = getParam(issue.messageParams, "verse");
    const context = getParam(issue.messageParams, "context");

    switch (issue.code) {
        case "missing-separator-after-marker":
            return t`Marker ${marker} is immediately followed by text.`;
        case "empty-paragraph":
            return t`Paragraph marker ${marker} creates an empty block before the next block marker.`;
        case "number-range-after-chapter-marker":
            return t`Chapter marker ${marker} must be followed by a chapter number.`;
        case "verse-range-expected-after-verse-marker":
            return t`Verse marker ${marker} must be followed by a verse number.`;
        case "verse-content-not-empty":
            return t`Verse number ${verse} is followed by unexpected content.`;
        case "unknown-token":
            return t`This token could not be classified.`;
        case "char-not-closed":
            return t`Character marker ${marker} was not closed.`;
        case "note-not-closed":
            return t`Note marker ${marker} was not closed before the next block boundary.`;
        case "paragraph-before-first-chapter":
            return t`Paragraph marker ${marker} appears before the first chapter marker.`;
        case "verse-before-first-chapter":
            return t`Verse marker ${marker} appears before the first chapter marker.`;
        case "note-submarker-outside-note":
            return t`Note submarker ${marker} appears outside a note.`;
        case "duplicate-id-marker":
            return t`The file contains more than one \\id marker.`;
        case "id-marker-not-at-file-start":
            return t`The \\id marker must be the first marker in the file.`;
        case "chapter-metadata-outside-chapter":
            return t`Chapter metadata appears outside a chapter.`;
        case "verse-metadata-outside-verse":
            return t`Verse metadata appears outside a verse.`;
        case "missing-chapter-number":
            return t`Chapter marker ${marker} is missing its chapter number.`;
        case "missing-verse-number":
            return t`Verse marker ${marker} is missing its verse number.`;
        case "missing-milestone-self-close":
            return t`Milestone marker ${marker} must be self-closing.`;
        case "implicitly-closed-marker":
            return t`Marker ${marker} was implicitly closed by the following structure.`;
        case "stray-close-marker":
            return t`Close marker ${marker} does not match any open marker.`;
        case "misnested-close-marker":
            return t`Close marker ${marker} closes markers out of order.`;
        case "unclosed-note":
            return t`Note marker ${marker} was not closed.`;
        case "unclosed-marker-at-eof":
            return t`Marker ${marker} was still open at the end of the file.`;
        case "duplicate-chapter-number":
            return t`Chapter number ${chapter} is duplicated.`;
        case "chapter-expected-increase-by-one":
            return t`Chapter numbering is out of sequence. Expected ${expected} but found ${found}.`;
        case "duplicate-verse-number":
            return t`Verse number ${verse} is duplicated.`;
        case "verse-expected-increase-by-one":
            return t`Verse numbering is out of sequence. Expected ${expected} but found ${found}.`;
        case "invalid-number-range":
            return t`Number range ${found} is invalid.`;
        case "number-range-not-preceded-by-marker-expecting-number":
            return t`A number appears without a preceding marker that expects a number.`;
        case "verse-text-follows-verse-range":
            return t`Verse text appears in an invalid position after the verse number.`;
        case "unknown-marker":
            return t`Marker ${marker} is not recognized.`;
        case "unknown-close-marker":
            return t`Close marker ${marker} is not recognized.`;
        case "inconsistent-chapter-label":
            return t`Chapter label ${found} does not match the expected chapter number ${expected}.`;
        case "marker-not-valid-in-context":
            return t`Marker ${marker} is not valid in this context${context ? ` (${context})` : ""}.`;
        case "verse-outside-explicit-paragraph":
            return t`Verse marker ${marker} appears outside an explicit paragraph.`;
        default:
            return issue.message;
    }
}

export function formatTokenFixLabel(fix: TokenFix): string {
    const marker = markerForFix(fix);
    const number = getParam(fix.label_params, "number");

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
        default:
            return fix.label;
    }
}
