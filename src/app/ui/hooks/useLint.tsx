/**
 * Workspace-owned lint state.
 *
 * Snapshot data lives in `LintStore` (a workspace-scoped class); this hook is
 * a React-facing view that subscribes to the store via `useSyncExternalStore`
 * and adds filter UI state (scope / issue-type / selected codes / books).
 * The editor and overlays project from these snapshots — they do not decide
 * which issues exist or which lint result "wins" when requests overlap.
 *
 * Filter state stays in React state so the lint popover and the DOM annotator
 * render the same filtered set — what the user sees in the popover is exactly
 * what gets highlighted in the editor.
 */
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import type { LintStore } from "@/app/state/LintStore.ts";
import { getLintIssueBookCode } from "@/app/ui/components/blocks/lintFilters.tsx";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";
import {
    buildLintMessagesByBookFromSnapshots,
    flattenLintSnapshotsByChapter,
    getLintSnapshotChapterKey,
} from "./lintState.ts";

export type LintScope = "local" | "all";
export type LintIssueTypeFilter = "all" | "usfm" | "content";

export type UseLintReturn = ReturnType<typeof useLint>;

type UseLintProps = {
    lintStore: LintStore;
    visibleBookCode: string;
    visibleChapter: number;
};

export function useLint({
    lintStore,
    visibleBookCode,
    visibleChapter,
}: UseLintProps) {
    const snapshotsByChapter = useSyncExternalStore(
        lintStore.subscribe,
        lintStore.getSnapshot,
    );

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
        useState<LintIssueTypeFilter>("all");
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

    // Reconcile selection when the universe of codes/books changes:
    // - drop selections that no longer exist
    // - if the previous selection was matching-all, expand to include
    //   any newly-arrived entries (otherwise new lint codes for a fully-
    //   checked filter would silently arrive de-selected)
    const prevKnownCodesRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const prev = prevKnownCodesRef.current;
        prevKnownCodesRef.current = knownCodes;
        const allCodes = Array.from(knownCodes);
        setSelectedCodes((current) => {
            if (!current.length) return allCodes;
            const wasMatchingAll =
                current.length === prev.size &&
                current.every((code) => prev.has(code));
            if (wasMatchingAll) return allCodes;
            const next = current.filter((code) => knownCodes.has(code));
            return next.length ? next : allCodes;
        });
    }, [knownCodes]);

    const prevKnownBooksRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const prev = prevKnownBooksRef.current;
        prevKnownBooksRef.current = knownBooks;
        const allBooks = Array.from(knownBooks);
        setSelectedBooks((current) => {
            if (!current.length) return allBooks;
            const wasMatchingAll =
                current.length === prev.size &&
                current.every((book) => prev.has(book));
            if (wasMatchingAll) return allBooks;
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

    const filteredVisibleIssues = useMemo(
        () =>
            visibleIssues.filter((issue) =>
                matchesActiveFilters(issue, scope === "all"),
            ),
        [visibleIssues, matchesActiveFilters, scope],
    );

    const filteredAllIssues = useMemo(
        () =>
            typeFilteredAllIssues.filter((issue) =>
                matchesActiveFilters(issue, true),
            ),
        [typeFilteredAllIssues, matchesActiveFilters],
    );

    const commitBookLintResults = useCallback(
        (resultsByBook: Record<string, LintIssue[]>) =>
            lintStore.commitBookLintResults(resultsByBook),
        [lintStore],
    );

    return {
        snapshotsByChapter,
        issuesByBook,
        allIssues,
        visibleChapterKey,
        visibleSnapshot,
        visibleIssues,
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
