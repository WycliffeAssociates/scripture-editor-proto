/**
 * Workspace-owned lint state.
 *
 * This hook is the canonical home for diagnostics in the app. The editor and
 * overlays project from these snapshots, but they do not decide which issues
 * exist or which lint result "wins" when requests overlap.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { parseSid } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";
import {
    buildLintMessagesByBookFromSnapshots,
    createLintSnapshot,
    flattenLintSnapshotsByChapter,
    getLintSnapshotChapterKey,
    type LintMessagesByBook,
    type LintSnapshotsByChapter,
} from "./lintState.ts";

export type LintRequestReason =
    | "typing"
    | "cut"
    | "paste"
    | "undo"
    | "redo"
    | "chapter-load"
    | "programmatic";

export type UseLintReturn = ReturnType<typeof useLint>;

type UseLintProps = {
    initialLintErrorsByBook: LintMessagesByBook;
    visibleBookCode: string;
    visibleChapter: number;
};

function createInitialSnapshots(
    initialLintErrorsByBook: LintMessagesByBook,
): LintSnapshotsByChapter {
    const next: LintSnapshotsByChapter = {};
    const requestId = 0;

    for (const [bookCode, issues] of Object.entries(initialLintErrorsByBook)) {
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

export function useLint({
    initialLintErrorsByBook,
    visibleBookCode,
    visibleChapter,
}: UseLintProps) {
    const [snapshotsByChapter, setSnapshotsByChapter] =
        useState<LintSnapshotsByChapter>(() =>
            createInitialSnapshots(initialLintErrorsByBook),
        );
    const requestCounterRef = useRef(0);
    const latestRequestIdByChapterRef = useRef<Record<string, number>>({});

    const visibleChapterKey = useMemo(
        () => getLintSnapshotChapterKey(visibleBookCode, visibleChapter),
        [visibleBookCode, visibleChapter],
    );

    const allIssues = useMemo(
        () => flattenLintSnapshotsByChapter(snapshotsByChapter),
        [snapshotsByChapter],
    );

    const issuesByBook = useMemo(
        () => buildLintMessagesByBookFromSnapshots(snapshotsByChapter),
        [snapshotsByChapter],
    );

    const visibleSnapshot = snapshotsByChapter[visibleChapterKey] ?? null;
    const visibleIssues = visibleSnapshot?.issues ?? [];

    const beginLintRequest = useCallback(
        ({
            bookCode,
            chapter,
            basedOnDocumentVersion = 0,
        }: {
            reason: LintRequestReason;
            bookCode: string;
            chapter: number;
            basedOnDocumentVersion?: number;
        }) => {
            const requestId = ++requestCounterRef.current;
            const chapterKey = getLintSnapshotChapterKey(bookCode, chapter);
            latestRequestIdByChapterRef.current[chapterKey] = requestId;

            setSnapshotsByChapter((prev) => {
                const previous = prev[chapterKey];
                const retainedIssues = previous?.issues ?? [];
                const nextSnapshot = createLintSnapshot({
                    requestId,
                    bookCode,
                    chapter,
                    issues: retainedIssues,
                    status: "pending",
                    basedOnDocumentVersion,
                });

                if (
                    previous &&
                    previous.requestId === nextSnapshot.requestId &&
                    previous.status === nextSnapshot.status &&
                    previous.basedOnDocumentVersion ===
                        nextSnapshot.basedOnDocumentVersion
                ) {
                    return prev;
                }

                return {
                    ...prev,
                    [chapterKey]: nextSnapshot,
                };
            });

            return requestId;
        },
        [],
    );

    const commitLintResult = useCallback(
        ({
            bookCode,
            chapter,
            requestId,
            issues,
            basedOnDocumentVersion = 0,
        }: {
            bookCode: string;
            chapter: number;
            requestId: number;
            issues: LintIssue[];
            basedOnDocumentVersion?: number;
        }) => {
            const chapterKey = getLintSnapshotChapterKey(bookCode, chapter);
            if (latestRequestIdByChapterRef.current[chapterKey] !== requestId) {
                return false;
            }

            setSnapshotsByChapter((prev) => {
                const nextSnapshot = createLintSnapshot({
                    requestId,
                    bookCode,
                    chapter,
                    issues,
                    status: "ready",
                    basedOnDocumentVersion,
                });
                return {
                    ...prev,
                    [chapterKey]: nextSnapshot,
                };
            });

            return true;
        },
        [],
    );

    const commitBookLintResults = useCallback(
        (resultsByBook: Record<string, LintIssue[]>) => {
            setSnapshotsByChapter((prev) => {
                let next = prev;
                for (const [bookCode, issues] of Object.entries(
                    resultsByBook,
                )) {
                    const normalizedBookCode = bookCode.toUpperCase();
                    const requestId = ++requestCounterRef.current;
                    const chapterKeyPrefix = `${normalizedBookCode}:`;

                    if (next === prev) next = { ...prev };
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
                        latestRequestIdByChapterRef.current[chapterKey] =
                            requestId;
                        const snapshot = createLintSnapshot({
                            requestId,
                            bookCode: normalizedBookCode,
                            chapter,
                            issues: chapterIssues,
                            status: "ready",
                        });
                        next[chapterKey] = snapshot;
                    }
                }
                return next;
            });
        },
        [],
    );

    return {
        snapshotsByChapter,
        issuesByBook,
        allIssues,
        visibleChapterKey,
        visibleSnapshot,
        visibleIssues,
        beginLintRequest,
        commitLintResult,
        commitBookLintResults,
    };
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
