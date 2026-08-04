// useFindings.ts
//
// Workspace-owned findings views (successor of the lint-only `useLint`).
//
// Data lives in `FindingsStore`; this hook subscribes via
// `useSyncExternalStore`, owns the user's sticky filter state, and derives
// every surface's shown set through THE presentation policy
// (`presentFinding`). Hidden-by-policy findings (e.g. the `\s5` app-default
// row) exist in the store but appear in NO view or count here — surfaces
// must read these policy-filtered views, never the raw store.
//
// Filter state stays in React state so the issues panel and the overlay
// render the same filtered picture — what the user sees listed is exactly
// what gets highlighted.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { EditorModeSetting } from "@/app/data/editor.ts";
import type { FindingCategory } from "@/app/domain/editor/annotations/finding.ts";
import {
  DEFAULT_FINDING_USER_PREFS,
  type FindingSuppressions,
  type FindingUserPrefs,
  presentFinding,
} from "@/app/domain/editor/annotations/presentFinding.ts";
import { segmentsForBook } from "@/app/domain/editor/annotations/vrefProjection.ts";
import {
  chapterFindingsAcrossSources,
  type FlatFinding,
  flattenFindings,
} from "@/app/state/findingsSelectors.ts";
import type { FindingsStore } from "@/app/state/FindingsStore.ts";
import type { WorkingFilesStore } from "@/app/state/WorkingFilesStore.ts";

export type FindingCategoryFilter = "all" | FindingCategory;

export type UseFindingsReturn = ReturnType<typeof useFindings>;

/** Reserved presentation-policy input; always empty until hash-and-ignore ships. */
const NO_SUPPRESSIONS: FindingSuppressions = [];

type UseFindingsProps = {
  findingsStore: FindingsStore;
  /** Content anchors resolve against the tokens currently being drawn. */
  workingFilesStore: WorkingFilesStore;
  visibleBookCode: string;
  visibleChapter: number;
  editorMode: EditorModeSetting;
};

export function useFindings({
  findingsStore,
  workingFilesStore,
  visibleBookCode,
  visibleChapter,
  editorMode,
}: UseFindingsProps) {
  const snapshot = useSyncExternalStore(
    findingsStore.subscribe,
    findingsStore.getSnapshot,
  );
  const workingFiles = useSyncExternalStore(
    workingFilesStore.subscribe,
    workingFilesStore.getSnapshot,
  );

  // The ONE flat view — lazily derived, cached on the root reference.
  const flat = useMemo(() => flattenFindings(snapshot), [snapshot]);

  const [scope, setScope] = useState<"local" | "all">("local");
  const [categoryFilter, setCategoryFilter] =
    useState<FindingCategoryFilter>("all");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [selectedBooks, setSelectedBooks] = useState<string[]>([]);

  // Base panel set: app-default + mode rows applied, user prefs NOT — what
  // the filter ribbon's own counts and option lists are built over (a
  // user's current selection must not erase the other options).
  const panelBase = useMemo(
    () =>
      flat.filter(
        (entry) =>
          presentFinding(entry.finding, {
            userPrefs: DEFAULT_FINDING_USER_PREFS,
            suppressions: NO_SUPPRESSIONS,
            mode: editorMode,
            surface: "panel",
            bookCode: entry.bookCode,
          }) !== "hide",
      ),
    [flat, editorMode],
  );

  const categoryFilteredAll = useMemo(
    () =>
      categoryFilter === "all"
        ? panelBase
        : panelBase.filter(
            (entry) => entry.finding.category === categoryFilter,
          ),
    [panelBase, categoryFilter],
  );

  const knownCodes = useMemo(() => {
    const set = new Set<string>();
    for (const entry of categoryFilteredAll) {
      if (entry.finding.code) set.add(entry.finding.code);
    }
    return set;
  }, [categoryFilteredAll]);

  const knownBooks = useMemo(() => {
    const set = new Set<string>();
    for (const entry of categoryFilteredAll) {
      set.add(entry.bookCode);
    }
    return set;
  }, [categoryFilteredAll]);

  // Reconcile selection when the universe of codes/books changes:
  // - drop selections that no longer exist
  // - if the previous selection was matching-all, expand to include
  //   any newly-arrived entries (otherwise new codes for a fully-
  //   checked filter would silently arrive de-selected)
  const prevKnownCodesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevKnownCodesRef.current;
    prevKnownCodesRef.current = knownCodes;
    const allCodes = Array.from(knownCodes);
    setSelectedCodes((current) => {
      if (!current.length) return allCodes;
      const wasMatchingAll =
        current.length === prev.size && current.every((code) => prev.has(code));
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
        current.length === prev.size && current.every((book) => prev.has(book));
      if (wasMatchingAll) return allBooks;
      const next = current.filter((book) => knownBooks.has(book));
      return next.length ? next : allBooks;
    });
  }, [knownBooks]);

  const userPrefs: FindingUserPrefs = useMemo(
    () => ({
      scope,
      category: categoryFilter,
      selectedCodes,
      codesMatchAll: selectedCodes.length === knownCodes.size,
      selectedBooks,
      booksMatchAll: selectedBooks.length === knownBooks.size,
    }),
    [
      scope,
      categoryFilter,
      selectedCodes,
      selectedBooks,
      knownCodes,
      knownBooks,
    ],
  );

  // Panel shown sets — `shown = flatten(state).filter(policy)`, memo-keyed
  // on [snapshot-derived flat, prefs, mode].
  const shownAll = useMemo(
    () =>
      flat.filter(
        (entry) =>
          presentFinding(entry.finding, {
            userPrefs,
            suppressions: NO_SUPPRESSIONS,
            mode: editorMode,
            surface: "panel",
            bookCode: entry.bookCode,
          }) === "list",
      ),
    [flat, userPrefs, editorMode],
  );

  const visibleChapterFindings = useMemo(
    () =>
      chapterFindingsAcrossSources(snapshot, visibleBookCode, visibleChapter),
    [snapshot, visibleBookCode, visibleChapter],
  );

  const shownVisible = useMemo(
    () =>
      visibleChapterFindings
        .filter(
          (finding) =>
            presentFinding(finding, {
              userPrefs,
              suppressions: NO_SUPPRESSIONS,
              mode: editorMode,
              surface: "panel",
              bookCode: visibleBookCode.toUpperCase(),
            }) === "list",
        )
        .map(
          (finding): FlatFinding => ({
            bookCode: visibleBookCode.toUpperCase(),
            chapter: visibleChapter,
            finding,
          }),
        ),
    [
      visibleChapterFindings,
      userPrefs,
      editorMode,
      visibleBookCode,
      visibleChapter,
    ],
  );

  // Overlay shown set: the visible chapter through the overlay surface —
  // same user prefs, so the editor highlights exactly what the panel lists.
  const overlayFindings = useMemo(
    () =>
      visibleChapterFindings.filter(
        (finding) =>
          presentFinding(finding, {
            userPrefs,
            suppressions: NO_SUPPRESSIONS,
            mode: editorMode,
            surface: "overlay",
            bookCode: visibleBookCode.toUpperCase(),
          }) === "highlight",
      ),
    [visibleChapterFindings, userPrefs, editorMode, visibleBookCode],
  );

  // The visible book's verse→token map, derived from the tokens on screen
  // rather than shipped with an analysis result: cheaper, and it cannot
  // describe a generation the DOM has already moved past.
  const sousSegments = useMemo(
    () => segmentsForBook(workingFiles, visibleBookCode),
    [workingFiles, visibleBookCode],
  );

  // Category tallies for the type select — over the policy-visible base,
  // before the user's own narrowing (the menu offers what exists).
  const categoryCounts = useMemo(() => {
    let structure = 0;
    let content = 0;
    for (const entry of panelBase) {
      if (entry.finding.category === "content") content++;
      else structure++;
    }
    return { all: panelBase.length, structure, content };
  }, [panelBase]);

  // Empty-state discriminator: issues in the active scope before code/book
  // filters apply ("no issues" vs "filters exclude everything").
  const baseScopeCount = useMemo(() => {
    if (scope === "local") {
      const visible = visibleChapterFindings.filter(
        (finding) =>
          presentFinding(finding, {
            userPrefs: DEFAULT_FINDING_USER_PREFS,
            suppressions: NO_SUPPRESSIONS,
            mode: editorMode,
            surface: "panel",
            bookCode: visibleBookCode.toUpperCase(),
          }) !== "hide",
      );
      return categoryFilter === "all"
        ? visible.length
        : visible.filter((f) => f.category === categoryFilter).length;
    }
    return categoryFilteredAll.length;
  }, [
    scope,
    categoryFilter,
    visibleChapterFindings,
    categoryFilteredAll,
    editorMode,
    visibleBookCode,
  ]);

  return {
    // Shown sets (policy-filtered; the only sets surfaces render).
    shownAll,
    shownVisible,
    overlayFindings,
    sousSegments,
    // Filter ribbon state + its option universes.
    scope,
    setScope,
    categoryFilter,
    setCategoryFilter,
    selectedCodes,
    setSelectedCodes,
    selectedBooks,
    setSelectedBooks,
    categoryFilteredAll,
    categoryCounts,
    baseScopeCount,
  };
}
