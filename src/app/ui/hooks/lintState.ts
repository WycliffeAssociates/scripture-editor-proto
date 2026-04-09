import { parseSid, sortListBySidCanonical } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

/**
 * Canonical lint-state shape keyed by book.
 *
 * The workspace UI often needs book-scoped updates even when the visible editor
 * only shows one chapter. Keeping lint grouped by book lets history replay,
 * save/revert, and editor updates replace the narrow slice they touched.
 */
export type LintMessagesByBook = Record<string, LintIssue[]>;
export type LintSnapshotStatus = "pending" | "ready";

export type LintSnapshot = {
    requestId: number;
    bookCode: string;
    chapter: number;
    issues: LintIssue[];
    status: LintSnapshotStatus;
    createdAt: number;
    basedOnDocumentVersion: number;
};

export type LintSnapshotsByChapter = Record<string, LintSnapshot>;

const issueKeyCache = new WeakMap<LintIssue, string>();
export function getLintIssueKey(issue: LintIssue): string {
    const cached = issueKeyCache.get(issue);
    if (cached) return cached;

    const fixIdentity = issue.fix ? JSON.stringify(issue.fix) : "";
    const spanIdentity = issue.span
        ? `${issue.span.start}:${issue.span.end}`
        : "";
    const relatedSpanIdentity = issue.relatedSpan
        ? `${issue.relatedSpan.start}:${issue.relatedSpan.end}`
        : "";
    const key = [
        issue.sid ?? "",
        issue.code,
        issue.tokenId ?? "",
        issue.relatedTokenId ?? "",
        spanIdentity,
        relatedSpanIdentity,
        issue.message,
        fixIdentity,
    ].join(":");
    issueKeyCache.set(issue, key);
    return key;
}

export function getLintSnapshotChapterKey(bookCode: string, chapter: number) {
    return `${normalizeBookKey(bookCode)}:${chapter}`;
}

export function createLintSnapshot(input: {
    requestId: number;
    bookCode: string;
    chapter: number;
    issues: LintIssue[];
    status: LintSnapshotStatus;
    basedOnDocumentVersion?: number;
    createdAt?: number;
}): LintSnapshot {
    const normalizedIssues = sortLintIssues(dedupeLintIssueList(input.issues));
    return {
        requestId: input.requestId,
        bookCode: normalizeBookKey(input.bookCode),
        chapter: input.chapter,
        issues: normalizedIssues,
        status: input.status,
        createdAt: input.createdAt ?? Date.now(),
        basedOnDocumentVersion: input.basedOnDocumentVersion ?? 0,
    };
}

function dedupeLintIssueList(issues: LintIssue[]): LintIssue[] {
    const deduped = new Map<string, LintIssue>();
    for (const issue of issues) {
        deduped.set(getLintIssueKey(issue), issue);
    }
    return Array.from(deduped.values());
}

function sortLintIssues(issues: LintIssue[]): LintIssue[] {
    const withSid: Array<
        LintIssue & {
            sid: string;
        }
    > = [];
    const withoutSid: LintIssue[] = [];

    for (const issue of issues) {
        if (issue.sid) {
            withSid.push(issue as LintIssue & { sid: string });
            continue;
        }
        withoutSid.push(issue);
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

    const leftKeys = left.map(getLintIssueKey).sort();
    const rightKeys = right.map(getLintIssueKey).sort();

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

export function flattenLintSnapshotsByChapter(
    snapshotsByChapter: LintSnapshotsByChapter,
): LintIssue[] {
    return sortLintIssues(
        Object.values(snapshotsByChapter).flatMap(
            (snapshot) => snapshot.issues,
        ),
    );
}

export function buildLintMessagesByBookFromSnapshots(
    snapshotsByChapter: LintSnapshotsByChapter,
): LintMessagesByBook {
    const grouped: LintMessagesByBook = {};
    for (const snapshot of Object.values(snapshotsByChapter)) {
        const bookCode = normalizeBookKey(snapshot.bookCode);
        grouped[bookCode] ??= [];
        grouped[bookCode].push(...snapshot.issues);
    }

    for (const [book, bookIssues] of Object.entries(grouped)) {
        grouped[book] = sortLintIssues(bookIssues);
    }

    return grouped;
}
