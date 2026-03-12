import { parseSid, sortListBySidCanonical } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

export type LintMessagesByBook = Record<string, LintIssue[]>;

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

function normalizeBookKey(book: string): string {
    return book.toUpperCase();
}

function bookForIssue(issue: LintIssue): string | null {
    if (!issue.sid || issue.sid === "unknown location") return null;
    const sid = parseSid(issue.sid);
    return sid?.book ? normalizeBookKey(sid.book) : null;
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

export function buildLintMessagesByBook(
    issues: LintIssue[],
): LintMessagesByBook {
    const grouped: LintMessagesByBook = {};

    for (const issue of issues) {
        const book = bookForIssue(issue);
        if (!book) continue;
        grouped[book] ??= [];
        grouped[book].push(issue);
    }

    for (const [book, bookIssues] of Object.entries(grouped)) {
        grouped[book] = sortLintIssues(dedupeLintIssueList(bookIssues));
    }

    return grouped;
}

export function flattenLintMessagesByBook(
    messagesByBook: LintMessagesByBook,
): LintIssue[] {
    return sortLintIssues(
        dedupeLintIssueList(Object.values(messagesByBook).flat()),
    );
}

export function replaceLintErrorsForBook(
    prevMessagesByBook: LintMessagesByBook,
    book: string,
    newErrors: LintIssue[],
): LintMessagesByBook {
    const targetBook = normalizeBookKey(book);
    const nextErrors = sortLintIssues(dedupeLintIssueList(newErrors));
    if (prevMessagesByBook[targetBook] === newErrors) {
        return prevMessagesByBook;
    }

    return {
        ...prevMessagesByBook,
        [targetBook]: nextErrors,
    };
}

export function replaceLintErrorsForChapter(
    prevMessagesByBook: LintMessagesByBook,
    book: string,
    chapter: number,
    newErrors: LintIssue[],
): LintMessagesByBook {
    const targetBook = book.toUpperCase();
    const prevMessages = prevMessagesByBook[targetBook] ?? [];
    const filtered = prevMessages.filter((m) => {
        if (!m.sid || m.sid === "unknown location") return false;
        const sid = parseSid(m.sid);
        if (!sid) return true;
        return sid.book !== targetBook || sid.chapter !== chapter;
    });
    const nextErrors = sortLintIssues(
        dedupeLintIssueList([...filtered, ...newErrors]),
    );
    if (prevMessages === nextErrors) {
        return prevMessagesByBook;
    }

    return {
        ...prevMessagesByBook,
        [targetBook]: nextErrors,
    };
}
