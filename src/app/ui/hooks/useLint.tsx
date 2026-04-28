/**
 * Workspace-owned lint state.
 *
 * This hook is the canonical home for diagnostics in the app. The editor and
 * overlays project from these snapshots, but they do not decide which issues
 * exist or which lint result "wins" when requests overlap.
 *
 * Filter state (scope, issueTypeFilter, selectedCodes, selectedBooks) is also
 * centralized here so the lint popover and the DOM annotator render the same
 * filtered set — what the user sees in the popover is exactly what gets
 * highlighted in the editor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLintIssueBookCode } from "@/app/ui/components/blocks/lintFilters.tsx";
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

export type LintScope = "local" | "all";
export type LintIssueTypeFilter = "all" | "usfm" | "content";

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

    const [scope, setScope] = useState<LintScope>("local");
    const [issueTypeFilter, setIssueTypeFilter] =
        useState<LintIssueTypeFilter>("content");
    const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
    const [selectedBooks, setSelectedBooks] = useState<string[]>([]);

    const typeFilteredAllIssues = useMemo(
        () =>
            issueTypeFilter === "all"
                ? allIssues
                : allIssues.filter(
                      (issue) => issue.issueType === issueTypeFilter,
                  ),
        [allIssues, issueTypeFilter],
    );

    const knownCodes = useMemo(() => {
        const set = new Set<string>();
        for (const issue of typeFilteredAllIssues) {
            if (issue.code) set.add(issue.code);
        }
        return set;
    }, [typeFilteredAllIssues]);

    const knownBooks = useMemo(() => {
        const set = new Set<string>();
        for (const issue of typeFilteredAllIssues) {
            set.add(getLintIssueBookCode(issue));
        }
        return set;
    }, [typeFilteredAllIssues]);

    // Reset selection to "all" when the universe of codes/books changes and the
    // current selection no longer matches anything available, or when first set.
    useEffect(() => {
        const allCodes = Array.from(knownCodes);
        setSelectedCodes((current) => {
            if (!current.length) return allCodes;
            const next = current.filter((code) => knownCodes.has(code));
            return next.length ? next : allCodes;
        });
    }, [knownCodes]);

    useEffect(() => {
        const allBooks = Array.from(knownBooks);
        setSelectedBooks((current) => {
            if (!current.length) return allBooks;
            const next = current.filter((book) => knownBooks.has(book));
            return next.length ? next : allBooks;
        });
    }, [knownBooks]);

    const codesMatchAll = selectedCodes.length === knownCodes.size;
    const booksMatchAll = selectedBooks.length === knownBooks.size;

    const matchesActiveFilters = useCallback(
        (issue: LintIssue, applyBookFilter: boolean): boolean => {
            if (
                issueTypeFilter !== "all" &&
                issue.issueType !== issueTypeFilter
            ) {
                return false;
            }
            if (!codesMatchAll && !selectedCodes.includes(issue.code)) {
                return false;
            }
            if (
                applyBookFilter &&
                !booksMatchAll &&
                !selectedBooks.includes(getLintIssueBookCode(issue))
            ) {
                return false;
            }
            return true;
        },
        [
            booksMatchAll,
            codesMatchAll,
            issueTypeFilter,
            selectedBooks,
            selectedCodes,
        ],
    );

    // Visible-chapter slice the DOM annotator and the popover's "this chapter"
    // tab both consume — books filter only matters when the popover is in
    // "whole project" scope.
    const filteredVisibleIssues = useMemo(
        () =>
            visibleIssues.filter((issue) =>
                matchesActiveFilters(issue, scope === "all"),
            ),
        [visibleIssues, matchesActiveFilters, scope],
    );

    // Whole-project slice the popover's "all" tab consumes.
    const filteredAllIssues = useMemo(
        () =>
            typeFilteredAllIssues.filter((issue) =>
                matchesActiveFilters(issue, true),
            ),
        [typeFilteredAllIssues, matchesActiveFilters],
    );

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
        // Filter state — single source of truth shared by popover + DOM
        // annotator so the user sees one consistent picture.
        scope,
        setScope,
        issueTypeFilter,
        setIssueTypeFilter,
        selectedCodes,
        setSelectedCodes,
        selectedBooks,
        setSelectedBooks,
        typeFilteredAllIssues,
        filteredVisibleIssues,
        filteredAllIssues,
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
