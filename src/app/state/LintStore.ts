import {
    createLintSnapshot,
    getLintSnapshotChapterKey,
    type LintMessagesByBook,
    type LintSnapshotsByChapter,
} from "@/app/ui/hooks/lintState.ts";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type Listener = () => void;

/**
 * Workspace-scoped store for lint snapshots. The lint pipeline (and the
 * post-undo/redo relint effect) calls `commitBookLintResults` with the
 * latest results; React consumers read via `useSyncExternalStore(subscribe,
 * getSnapshot)`.
 *
 * Pipeline cancellation upstream (`Stream.switchMap`) guarantees only the
 * newest pass writes here. `requestCounter` exists for the snapshot ID
 * downstream UI uses to order/dedupe per-chapter displays, not for in-store
 * staleness checks.
 */
export class LintStore {
    private state: LintSnapshotsByChapter;
    private readonly listeners = new Set<Listener>();
    private requestCounter = 0;

    constructor(initialIssuesByBook: LintMessagesByBook) {
        this.state = createInitialSnapshots(initialIssuesByBook);
    }

    read(): LintSnapshotsByChapter {
        return this.state;
    }

    /** React-side `useSyncExternalStore` getSnapshot. */
    getSnapshot = (): LintSnapshotsByChapter => this.state;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /**
     * Batch-replace lint results for one or more books. Used by the lint
     * pipeline (typing / programmatic edits) and by the post-undo/redo relint
     * effect in `WorkspaceContext`.
     */
    commitBookLintResults(resultsByBook: Record<string, LintIssue[]>): void {
        let next = this.state;
        let mutated = false;
        for (const [bookCode, issues] of Object.entries(resultsByBook)) {
            const normalizedBookCode = bookCode.toUpperCase();
            const requestId = ++this.requestCounter;
            const chapterKeyPrefix = `${normalizedBookCode}:`;

            if (!mutated) {
                next = { ...this.state };
                mutated = true;
            }
            for (const existingKey of Object.keys(next)) {
                if (existingKey.startsWith(chapterKeyPrefix)) {
                    delete next[existingKey];
                }
            }

            for (const {
                chapter,
                issues: chapterIssues,
            } of issuesByChapterFromFlatIssues(issues)) {
                const chapterKey = getLintSnapshotChapterKey(
                    normalizedBookCode,
                    chapter,
                );
                next[chapterKey] = createLintSnapshot({
                    requestId,
                    bookCode: normalizedBookCode,
                    chapter,
                    issues: chapterIssues,
                    status: "ready",
                });
            }
        }
        if (!mutated) return;
        this.state = next;
        this.notify();
    }

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}

function createInitialSnapshots(
    initialIssuesByBook: LintMessagesByBook,
): LintSnapshotsByChapter {
    const next: LintSnapshotsByChapter = {};
    const requestId = 0;
    for (const [bookCode, issues] of Object.entries(initialIssuesByBook)) {
        const issuesByChapter = new Map<number, LintIssue[]>();
        for (const issue of issues) {
            const parsed = issue.sid ? parseSid(issue.sid) : null;
            const chapter = parsed?.chapter;
            if (!chapter) continue;
            const previous = issuesByChapter.get(chapter);
            if (previous) previous.push(issue);
            else issuesByChapter.set(chapter, [issue]);
        }
        for (const [chapter, chapterIssues] of issuesByChapter.entries()) {
            const key = getLintSnapshotChapterKey(bookCode, chapter);
            next[key] = createLintSnapshot({
                requestId,
                bookCode,
                chapter,
                issues: chapterIssues,
                status: "ready",
                basedOnDocumentVersion: 0,
            });
        }
    }
    return next;
}

function issuesByChapterFromFlatIssues(issues: LintIssue[]) {
    const grouped = new Map<number, LintIssue[]>();
    for (const issue of issues) {
        const parsed = issue.sid ? parseSid(issue.sid) : null;
        const chapter = parsed?.chapter;
        if (!chapter) continue;
        const previous = grouped.get(chapter);
        if (previous) previous.push(issue);
        else grouped.set(chapter, [issue]);
    }
    return Array.from(grouped.entries()).map(([chapter, chapterIssues]) => ({
        chapter,
        issues: chapterIssues,
    }));
}
