import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { buildTargetSidTextLookup } from "@/app/domain/search/SearchService.ts";
import type { StetTerm } from "@/app/domain/stet/stetCatalog.ts";
import {
  PublicStetCatalogSource,
  type StetCatalogSource,
} from "@/app/domain/stet/StetCatalogSource.ts";
import {
  buildStetRows,
  computeCoverage,
  formatStetDefinition,
  resolveTermVerseSet,
} from "@/app/domain/stet/stetDerivation.ts";
import type {
  ResultColumn,
  ResultRow,
} from "@/app/ui/components/views/result-browser/resultRow.ts";
import { navigateEditorToSid } from "@/app/ui/hooks/navigateEditorToSid.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { parseSid } from "@/core/data/bible/bible.ts";

export type StetTermEntry = { key: string; term: StetTerm };

/**
 * Feature-local state for the Spiritual Terms Evaluation panel. Created by
 * `StetPanel` (not the workspace provider): catalog fetch via TanStack Query
 * through the `StetCatalogSource` seam, term filter/selection, the additive
 * exhaustive toggle, and the derived neutral result rows. It reads only existing
 * workspace data (current project files for the HL lookup, the localized
 * book-name resolver) from context; it never writes to global state.
 */
export function useStet(options?: {
  source?: StetCatalogSource;
  /**
   * Reveal the editor for a row navigation: docks STET beside the editor on
   * desktop, or closes STET on small screens. Supplied by the layout, which
   * knows the screen size. Absent in isolated tests (navigation still switches
   * the chapter; only the reveal is skipped).
   */
  onRevealEditor?: () => void;
}) {
  const { t } = useLingui();
  const {
    workingFilesStore,
    bookCodeToProjectLocalizedTitle,
    allProjects,
    currentProjectRoute,
    editorRef,
    actions,
  } = useWorkspaceContext();
  const onRevealEditor = options?.onRevealEditor;

  const source = useMemo(
    () => options?.source ?? new PublicStetCatalogSource(),
    [options?.source],
  );

  const [filter, setFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showExhaustive, setShowExhaustive] = useState(false);
  const [selectedRowSid, setSelectedRowSid] = useState<string | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<string | null>(null);

  const guidesQuery = useQuery({
    queryKey: ["stetGuides"],
    queryFn: ({ signal }) => source.listGuides(signal),
  });

  const guides = guidesQuery.data ?? [];

  // Default to the English guide until the user picks another; falls back to
  // the first listed guide if English isn't available.
  const guide = useMemo(() => {
    if (selectedLocale) {
      const picked = guides.find((entry) => entry.locale === selectedLocale);
      if (picked) return picked;
    }
    return guides.find((entry) => entry.locale === "en") ?? guides[0] ?? null;
  }, [guides, selectedLocale]);

  const catalogQuery = useQuery({
    // Keyed by provenanceId so a future snapshot bump invalidates naturally.
    queryKey: ["stetCatalog", guide?.locale, guide?.provenanceId],
    queryFn: ({ signal }) => {
      if (!guide) throw new Error("no STET guide available");
      return source.loadCatalog(guide, signal);
    },
    enabled: Boolean(guide),
  });
  const catalog = catalogQuery.data ?? null;

  // Live HL lookup: rebuilds when the working files commit (edits, undo, import).
  const subscribe = useCallback(
    (listener: () => void) => workingFilesStore.subscribe(listener),
    [workingFilesStore],
  );
  const getSnapshot = useCallback(
    () => workingFilesStore.getSnapshot(),
    [workingFilesStore],
  );
  const files = useSyncExternalStore(subscribe, getSnapshot);
  const targetLookup = useMemo(
    () => buildTargetSidTextLookup({ files, searchUSFM: false }),
    [files],
  );

  // Locale-aware sort of display term; stable by input index for ties.
  const termEntries = useMemo<StetTermEntry[]>(() => {
    if (!catalog) return [];
    return catalog.terms
      .map((term, index) => ({ key: `${index}:${term.term}`, term, index }))
      .sort(
        (a, b) => a.term.term.localeCompare(b.term.term) || a.index - b.index,
      )
      .map(({ key, term }) => ({ key, term }));
  }, [catalog]);

  const filteredTerms = useMemo<StetTermEntry[]>(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return termEntries;
    return termEntries.filter((entry) =>
      entry.term.term.toLowerCase().includes(needle),
    );
  }, [termEntries, filter]);

  // Selection: keep the user's pick while it's visible; otherwise fall to the
  // first visible term (or nothing when the filter matches none).
  const effectiveKey = useMemo(() => {
    if (
      selectedKey &&
      filteredTerms.some((entry) => entry.key === selectedKey)
    ) {
      return selectedKey;
    }
    return filteredTerms[0]?.key ?? null;
  }, [filteredTerms, selectedKey]);

  const selectedTerm = useMemo(
    () =>
      filteredTerms.find((entry) => entry.key === effectiveKey)?.term ?? null,
    [filteredTerms, effectiveKey],
  );

  // Changing the selected term resets the exhaustive toggle and any row focus.
  useEffect(() => {
    setShowExhaustive(false);
    setSelectedRowSid(null);
  }, [effectiveKey]);

  const currentProjectName = useMemo(() => {
    const project = allProjects.find(
      (item) => item.folderName === currentProjectRoute,
    );
    return project?.displayName || t`Your project`;
  }, [allProjects, currentProjectRoute, t]);

  const referenceDisplayName = catalog?.reference.displayName ?? "";

  const verseSet = useMemo(
    () =>
      selectedTerm ? resolveTermVerseSet(selectedTerm, showExhaustive) : null,
    [selectedTerm, showExhaustive],
  );

  // Deduped-union counts for the toggle copy (never the raw array lengths).
  const verseCounts = useMemo(() => {
    if (!selectedTerm) return { curated: 0, union: 0 };
    return {
      curated: resolveTermVerseSet(selectedTerm, false).designatedCount,
      union: resolveTermVerseSet(selectedTerm, true).designatedCount,
    };
  }, [selectedTerm]);

  const verseRows = useMemo(() => {
    if (!selectedTerm || !catalog) return [];
    return buildStetRows({
      term: selectedTerm,
      showExhaustive,
      referenceVerses: catalog.referenceVerses,
      targetLookup,
    });
  }, [selectedTerm, showExhaustive, catalog, targetLookup]);

  const coverage = useMemo(() => computeCoverage(verseRows), [verseRows]);

  const definitionParagraphs = useMemo(
    () => (selectedTerm ? formatStetDefinition(selectedTerm.definition) : []),
    [selectedTerm],
  );

  const notInSnapshot = t`Not in the frozen reference snapshot`;
  const notInProject = t`Verse not available in this project`;

  const rows = useMemo<ResultRow[]>(() => {
    return verseRows.map((row) => {
      const parsed = parseSid(row.sid);
      const bookName = parsed
        ? bookCodeToProjectLocalizedTitle({ bookCode: parsed.book })
        : "";
      const locationLabel = parsed
        ? `${bookName || parsed.book} ${parsed.chapter}:${parsed.verseStart}`
        : row.sid;

      const source: ResultColumn = {
        kind: "source",
        label: referenceDisplayName,
        text: row.sourceText ?? "",
        missingText: notInSnapshot,
        highlight:
          row.hasSource && row.ranges.length > 0
            ? { mode: "ranges", ranges: row.ranges }
            : undefined,
      };
      const target: ResultColumn = {
        kind: "target",
        label: currentProjectName,
        text: row.targetText,
        missingText: notInProject,
      };

      return {
        key: row.sid,
        sid: row.sid,
        locationLabel,
        columns: [source, target],
        active: selectedRowSid === row.sid,
        // Navigate the HL main editor to this verse: reveal the editor (dock on
        // desktop / close STET on mobile — the layout decides), switch to the
        // book/chapter, then scroll the SID into view. A missing HL verse is
        // non-navigable (guarded here and disabled on the control) so we never
        // jump to a fallback chapter.
        onNavigate: () => {
          setSelectedRowSid(row.sid);
          if (!row.hasTarget) return;
          onRevealEditor?.();
          navigateEditorToSid({
            editorRef,
            switchBookOrChapter: actions.switchBookOrChapter,
            sid: row.sid,
          });
        },
        navigateDisabled: !row.hasTarget,
        navigateDisabledLabel: row.hasTarget ? undefined : notInProject,
        testId: TESTING_IDS.stet.resultItem,
      };
    });
  }, [
    verseRows,
    actions,
    editorRef,
    onRevealEditor,
    bookCodeToProjectLocalizedTitle,
    referenceDisplayName,
    currentProjectName,
    notInSnapshot,
    notInProject,
    selectedRowSid,
  ]);

  const isLoading =
    guidesQuery.isPending || (Boolean(guide) && catalogQuery.isPending);
  const isError = guidesQuery.isError || catalogQuery.isError;
  // Distinct from an ordinary filter-no-match (which still has unfiltered
  // terms): the catalog resolved to no terms, or the manifest had no usable
  // guide at all.
  const isEmpty = !isLoading && !isError && termEntries.length === 0;

  const retry = useCallback(() => {
    if (guidesQuery.isError) void guidesQuery.refetch();
    if (catalogQuery.isError) void catalogQuery.refetch();
  }, [guidesQuery, catalogQuery]);

  return {
    isLoading,
    isError,
    isEmpty,
    retry,
    filter,
    setFilter,
    terms: filteredTerms,
    selectedKey: effectiveKey,
    selectTerm: setSelectedKey,
    selectedTerm,
    definitionParagraphs,
    showExhaustive,
    setShowExhaustive,
    hasExhaustiveExtra: verseSet?.hasExhaustiveExtra ?? false,
    verseCounts,
    coverage,
    rows,
    referenceDisplayName,
    selectedRowSid,
    guides,
    selectedGuideLocale: guide?.locale ?? null,
    selectGuideLocale: setSelectedLocale,
  };
}
