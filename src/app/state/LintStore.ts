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
 * Workspace-scoped store for lint snapshots.
 *
 * Replaces the React-internal lint state previously held inside `useLint`. The
 * editor-side scheduler / commit-stream pipeline writes here; React consumers
 * read via `useSyncExternalStore(subscribe, getSnapshot)`.
 *
 * Cancellation today still uses the begin/commit request-id pattern so the
 * legacy `useEditorLinter` listener keeps working unchanged. Stage 2A.2 layers
 * a `Stream`-driven pipeline on top (whose `switchMap` handles cancellation
 * via fiber interruption); 2A.3 deletes the request-id bookkeeping along with
 * the legacy listener.
 */
export class LintStore {
    private state: LintSnapshotsByChapter;
    private readonly listeners = new Set<Listener>();
    private requestCounter = 0;
    private readonly latestRequestIdByChapter: Record<string, number> = {};

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
     * Mark a chapter's lint pass as in-flight and return a requestId. Latest
     * begin call for a chapter wins; previous in-flight results are dropped
     * by `commitLintResult` when the requestId no longer matches.
     */
    beginLintRequest(input: {
        bookCode: string;
        chapter: number;
        basedOnDocumentVersion?: number;
    }): number {
        const requestId = ++this.requestCounter;
        const chapterKey = getLintSnapshotChapterKey(
            input.bookCode,
            input.chapter,
        );
        this.latestRequestIdByChapter[chapterKey] = requestId;

        const previous = this.state[chapterKey];
        const retainedIssues = previous?.issues ?? [];
        const nextSnapshot = createLintSnapshot({
            requestId,
            bookCode: input.bookCode,
            chapter: input.chapter,
            issues: retainedIssues,
            status: "pending",
            basedOnDocumentVersion: input.basedOnDocumentVersion ?? 0,
        });

        if (
            previous &&
            previous.requestId === nextSnapshot.requestId &&
            previous.status === nextSnapshot.status &&
            previous.basedOnDocumentVersion ===
                nextSnapshot.basedOnDocumentVersion
        ) {
            return requestId;
        }

        this.state = { ...this.state, [chapterKey]: nextSnapshot };
        this.notify();
        return requestId;
    }

    commitLintResult(input: {
        bookCode: string;
        chapter: number;
        requestId: number;
        issues: LintIssue[];
        basedOnDocumentVersion?: number;
    }): boolean {
        const chapterKey = getLintSnapshotChapterKey(
            input.bookCode,
            input.chapter,
        );
        if (this.latestRequestIdByChapter[chapterKey] !== input.requestId) {
            return false;
        }
        const nextSnapshot = createLintSnapshot({
            requestId: input.requestId,
            bookCode: input.bookCode,
            chapter: input.chapter,
            issues: input.issues,
            status: "ready",
            basedOnDocumentVersion: input.basedOnDocumentVersion ?? 0,
        });
        this.state = { ...this.state, [chapterKey]: nextSnapshot };
        this.notify();
        return true;
    }

    /**
     * Batch-replace lint results for one or more books. Used by the
     * post-undo/redo relint pass and by code paths that lint a whole book at
     * once (e.g., format match, prettify project).
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
                this.latestRequestIdByChapter[chapterKey] = requestId;
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
