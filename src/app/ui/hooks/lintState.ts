import { parseSid, sortListBySidCanonical } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

function lintIssueIdentity(issue: LintIssue): string {
    const fixIdentity = issue.fix ? JSON.stringify(issue.fix) : "";
    const relatedSpanIdentity = issue.relatedSpan
        ? `${issue.relatedSpan.start}:${issue.relatedSpan.end}`
        : "";
    return [
        issue.sid ?? "",
        issue.code,
        issue.tokenId ?? "",
        issue.relatedTokenId ?? "",
        `${issue.span.start}:${issue.span.end}`,
        relatedSpanIdentity,
        issue.message,
        fixIdentity,
    ].join(":");
}

function dedupeLintIssueList(issues: LintIssue[]): LintIssue[] {
    return Array.from(
        new Map(
            issues.map((issue) => [lintIssueIdentity(issue), issue]),
        ).values(),
    );
}

function sortLintIssues(issues: LintIssue[]): LintIssue[] {
    const withSid: Array<LintIssue & { sid: string }> = [];
    const withoutSid: LintIssue[] = [];

    for (const issue of issues) {
        if (issue.sid) {
            withSid.push(issue as LintIssue & { sid: string });
        } else {
            withoutSid.push(issue);
        }
    }

    return [...sortListBySidCanonical(withSid), ...withoutSid];
}

export function areLintIssueListsEqual(
    left: LintIssue[],
    right: LintIssue[],
): boolean {
    if (left.length !== right.length) return false;
    if (left.length === 0) return true;

    const leftKeys = left.map(lintIssueIdentity).sort();
    const rightKeys = right.map(lintIssueIdentity).sort();

    for (let i = 0; i < leftKeys.length; i++) {
        if (leftKeys[i] !== rightKeys[i]) return false;
    }

    return true;
}

export function replaceLintErrorsForBook(
    prevMessages: LintIssue[],
    book: string,
    newErrors: LintIssue[],
): LintIssue[] {
    const targetBook = book.toUpperCase();
    const filtered = prevMessages.filter((m) => {
        if (!m.sid || m.sid === "unknown location") return false;
        const sid = parseSid(m.sid);
        if (!sid) return false; // if it's invalid sid, clean it up
        return sid.book !== targetBook;
    });
    return sortLintIssues(dedupeLintIssueList([...filtered, ...newErrors]));
}

export function replaceLintErrorsForChapter(
    prevMessages: LintIssue[],
    book: string,
    chapter: number,
    newErrors: LintIssue[],
): LintIssue[] {
    const targetBook = book.toUpperCase();
    const filtered = prevMessages.filter((m) => {
        if (!m.sid || m.sid === "unknown location") return false;
        const sid = parseSid(m.sid);
        if (!sid) return true;
        return sid.book !== targetBook || sid.chapter !== chapter;
    });
    return sortLintIssues(dedupeLintIssueList([...filtered, ...newErrors]));
}
