import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";

import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import {
  buildTargetSidTextLookup,
  type SearchResult,
} from "@/app/domain/search/SearchService.ts";
import { ResultBrowser } from "@/app/ui/components/views/result-browser/ResultBrowser.tsx";
import type {
  ResultColumn,
  ResultHighlight,
  ResultRow,
} from "@/app/ui/components/views/result-browser/resultRow.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/useWorkspaceMediaQuery.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

type GroupedItem = {
  key: string;
  sourceResult: SearchResult;
  targetResult: SearchResult | undefined;
};

/**
 * Find's adapter onto the neutral `ResultBrowser`. It owns everything
 * search-specific — source/target pairing, active-row resolution, occurrence
 * counts, and the replace verbs — and projects each hit into a neutral
 * `ResultRow`. The browser itself never sees a `SearchResult`.
 */
export function SearchResults() {
  const { t } = useLingui();
  const { isSm } = useWorkspaceMediaQuery();
  const {
    search,
    allProjects,
    currentProjectRoute,
    referenceResource,
    bookCodeToProjectLocalizedTitle,
  } = useWorkspaceContext();
  const referenceParsedFiles = useMemo(
    () => referenceResource.referenceScriptureQuery.data?.parsedFiles ?? [],
    [referenceResource.referenceScriptureQuery.data],
  );
  const hasDisplayReference =
    !search.searchReference &&
    Boolean(referenceResource.activeReferenceResourcePath) &&
    referenceParsedFiles.length > 0;

  const currentProjectName = useMemo(() => {
    const project = allProjects.find(
      (item) => item.folderName === currentProjectRoute,
    );
    return project?.displayName || t`Current project`;
  }, [allProjects, currentProjectRoute, t]);

  const sourceProjectName = useMemo(() => {
    return (
      referenceResource.activeReferenceResourceDisplayName || t`Source text`
    );
  }, [referenceResource.activeReferenceResourceDisplayName, t]);

  const referenceSidTextLookup = useMemo(() => {
    if (!hasDisplayReference) return new Map<string, string>();
    return buildTargetSidTextLookup({
      files: referenceParsedFiles,
      searchUSFM: search.searchUSFM,
    });
  }, [hasDisplayReference, referenceParsedFiles, search.searchUSFM]);

  const groupedItems = useMemo<GroupedItem[]>(() => {
    if (search.searchReference) {
      const targetByKey = new Map(
        search.targetResults.map((result) => [groupKey(result), result]),
      );
      return search.referenceResults.map((sourceResult) => ({
        key: groupKey(sourceResult),
        sourceResult,
        targetResult: targetByKey.get(groupKey(sourceResult)),
      }));
    }

    if (!hasDisplayReference) return [];

    return search.targetResults.map((targetResult) => {
      const referenceText = referenceSidTextLookup.get(targetResult.sid) ?? "";
      const sourceResult: SearchResult = {
        ...targetResult,
        text: referenceText,
        source: "reference",
      };
      return {
        key: groupKey(targetResult),
        sourceResult,
        targetResult,
      };
    });
  }, [
    hasDisplayReference,
    referenceSidTextLookup,
    search.referenceResults,
    search.searchReference,
    search.targetResults,
  ]);

  const isGroupedMode = groupedItems.length > 0;

  const handleReplace = useCallback(
    async (
      target: SearchResult,
      replacement: string,
      occurrenceIndex: number,
      isActive: boolean,
    ) => {
      // Un-cycled rows (cursor on the first match) keep the proven paths: the
      // active row replaces its current match, others replace their first.
      // A cycled row targets the exact occurrence the stepper is sitting on.
      if (occurrenceIndex === 0) {
        if (isActive) await search.replaceCurrentMatch(replacement);
        else await search.replaceSearchResult(target, replacement);
      } else {
        await search.replaceSearchResult(
          { ...target, sidOccurrenceIndex: occurrenceIndex },
          replacement,
        );
      }
    },
    [search],
  );

  const missingVerseFallback = t`Verse not available in this text`;

  const rows = useMemo<ResultRow[]>(() => {
    const canReplace = !search.searchReference;
    const highlight: ResultHighlight = {
      mode: "match",
      term: search.searchTerm,
      matchCase: search.matchCase,
      matchWholeWord: search.matchWholeWord,
    };

    const build = (
      result: SearchResult,
      groupedItem: GroupedItem | null,
      index: number,
    ): ResultRow => {
      const isActive = resolveIsActive(
        search.pickedResult,
        result,
        groupedItem,
      );
      const pickResult = resolvePickResult(
        result,
        groupedItem,
        search.searchReference,
      );
      const replaceTarget = groupedItem?.targetResult ?? result;
      const localizedBookName = bookCodeToProjectLocalizedTitle({
        bookCode: result.bibleIdentifier,
      });
      const locationLabel =
        result.chapNum === 0
          ? t`Introduction`
          : formatResultLocationLabel(result, localizedBookName);

      const columns: ResultColumn[] = groupedItem
        ? [
            {
              kind: "source",
              label: sourceProjectName,
              text: result.text,
              missingText: missingVerseFallback,
              highlight,
            },
            {
              kind: "target",
              label: currentProjectName,
              text: groupedItem.targetResult?.text ?? "",
              missingText: missingVerseFallback,
              highlight,
            },
          ]
        : [
            {
              kind: "target",
              label: "",
              text: result.text,
              missingText: missingVerseFallback,
              highlight,
            },
          ];

      return {
        key:
          groupedItem?.key ||
          `${result.source}-${result.sid}-${result.sidOccurrenceIndex}-${index}`,
        sid: result.sid,
        locationLabel,
        columns,
        active: isActive,
        onNavigate: () => {
          // The navigate arrow focuses the row AND opens the editor: dock it
          // beside find on desktop (no-op if already docked), or reveal it on
          // small screens. Occurrence cycling stays row-local and independent.
          search.pickSearchResult(pickResult);
          if (isSm) {
            search.setIsSearchPaneOpen(false);
          } else {
            search.dockSearchPane();
          }
        },
        find: {
          occurrenceCount: result.occurrenceCount,
          replacement: canReplace
            ? {
                defaultValue: search.replaceTerm,
                disabledReason: search.isReplaceGap(replaceTarget)
                  ? "hidden-markup-gap"
                  : undefined,
                onCommit: (value, occurrenceIndex) =>
                  handleReplace(
                    replaceTarget,
                    value,
                    occurrenceIndex,
                    isActive,
                  ),
                onEditInUsfm: () => search.editMatchInUsfmMode(replaceTarget),
              }
            : undefined,
        },
        testId: TESTING_IDS.searchResultItem,
        dataAttributes: {
          "data-search-sid": result.sid,
          "data-search-book": result.bibleIdentifier,
          "data-search-chapter": String(result.chapNum),
        },
      };
    };

    if (isGroupedMode) {
      return groupedItems.map((groupedItem, index) =>
        build(groupedItem.sourceResult, groupedItem, index),
      );
    }
    return search.results.map((result, index) => build(result, null, index));
  }, [
    bookCodeToProjectLocalizedTitle,
    currentProjectName,
    groupedItems,
    handleReplace,
    isGroupedMode,
    isSm,
    missingVerseFallback,
    search,
    sourceProjectName,
    t,
  ]);

  if (!search.searchTerm && !search.isSearching) {
    return (
      <div className={styles.searchEmptyState}>
        <span className={styles.searchEmptyIcon}>🔍</span>
        <span>
          <Trans>Type to start searching</Trans>
        </span>
      </div>
    );
  }

  if (search.isSearching) {
    return (
      <div className={styles.searchLoadingState}>
        <Trans>
          Searching for <strong>{search.searchTerm}</strong>...
        </Trans>
      </div>
    );
  }

  if (search.searchTerm && !search.results?.length) {
    return (
      <div className={styles.searchNoResultsState}>
        <Trans>
          No results found for <strong>{search.searchTerm}</strong>
        </Trans>
      </div>
    );
  }

  return (
    <ResultBrowser
      rows={rows}
      containerData={{
        "data-js": DATA_JS.searchResultsScrollContainer,
        "data-num-search-results": search.results.length,
      }}
    />
  );
}

function groupKey(result: SearchResult): string {
  return [
    result.sid,
    result.sidOccurrenceIndex,
    result.bibleIdentifier,
    result.chapNum,
    result.naturalIndex,
  ].join("|");
}

// Compare by verse identity, not object reference: the stepper picks an
// occurrence *variant* (`{ ...result, sidOccurrenceIndex }`), so a reference
// check would lose the active row the moment you cycle within a verse.
function isSameVerse(
  a: SearchResult | null | undefined,
  b: SearchResult | null | undefined,
): boolean {
  return (
    !!a &&
    !!b &&
    a.source === b.source &&
    a.sid === b.sid &&
    a.bibleIdentifier === b.bibleIdentifier &&
    a.chapNum === b.chapNum
  );
}

function resolveIsActive(
  pickedResult: SearchResult | null | undefined,
  result: SearchResult,
  groupedItem: GroupedItem | null,
): boolean {
  if (groupedItem) {
    return (
      isSameVerse(pickedResult, groupedItem.sourceResult) ||
      isSameVerse(pickedResult, groupedItem.targetResult)
    );
  }
  return isSameVerse(pickedResult, result);
}

function resolvePickResult(
  result: SearchResult,
  groupedItem: GroupedItem | null,
  searchReference: boolean,
): SearchResult {
  if (!groupedItem) return result;
  if (searchReference) return groupedItem.sourceResult;
  return groupedItem.targetResult ?? groupedItem.sourceResult;
}

function formatResultLocationLabel(
  result: SearchResult,
  localizedBookName?: string,
) {
  const parsed = result.parsedSid;
  if (!parsed) {
    return result.sid;
  }
  const bookLabel = localizedBookName || parsed.book;

  if (parsed.isBookChapOnly) {
    return `${bookLabel} ${parsed.chapter}`;
  }

  if (parsed.verseStart !== parsed.verseEnd) {
    return `${bookLabel} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`;
  }

  return `${bookLabel} ${parsed.chapter}:${parsed.verseStart}`;
}
