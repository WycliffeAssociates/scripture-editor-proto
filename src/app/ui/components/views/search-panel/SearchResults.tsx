import { Trans, useLingui } from "@lingui/react/macro";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef } from "react";

import { DATA_JS } from "@/app/data/constants.ts";
import {
  buildTargetSidTextLookup,
  type SearchResult,
} from "@/app/domain/search/SearchService.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

import { SearchResultItem } from "./SearchResultItem.tsx";

type GroupedItem = {
  key: string;
  sourceResult: SearchResult;
  targetResult: SearchResult | undefined;
};

export function SearchResults() {
  const { t } = useLingui();
  const {
    search,
    allProjects,
    currentProjectRoute,
    referenceResource,
    bookCodeToProjectLocalizedTitle,
  } = useWorkspaceContext();
  const parentRef = useRef<HTMLDivElement>(null);
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
      referenceResource.activeReferenceResourceDisplayName ||
      t`Reference project`
    );
  }, [referenceResource.activeReferenceResourceDisplayName, t]);

  const referenceSidTextLookup = useMemo(() => {
    if (!hasDisplayReference) return new Map<string, string>();
    return buildTargetSidTextLookup({
      files: referenceParsedFiles,
      searchUSFM: search.searchUSFM,
    });
  }, [hasDisplayReference, referenceParsedFiles, search.searchUSFM]);

  const groupedItems = useMemo(() => {
    if (search.searchReference) {
      const targetByKey = new Map(
        search.targetResults.map((result) => [
          [
            result.sid,
            result.sidOccurrenceIndex,
            result.bibleIdentifier,
            result.chapNum,
            result.naturalIndex,
          ].join("|"),
          result,
        ]),
      );

      return search.referenceResults.map((sourceResult) => {
        const key = [
          sourceResult.sid,
          sourceResult.sidOccurrenceIndex,
          sourceResult.bibleIdentifier,
          sourceResult.chapNum,
          sourceResult.naturalIndex,
        ].join("|");

        return {
          key,
          sourceResult,
          targetResult: targetByKey.get(key),
        };
      });
    }

    if (!hasDisplayReference) return [];

    return search.targetResults.map((targetResult) => {
      const key = [
        targetResult.sid,
        targetResult.sidOccurrenceIndex,
        targetResult.bibleIdentifier,
        targetResult.chapNum,
        targetResult.naturalIndex,
      ].join("|");
      const referenceText = referenceSidTextLookup.get(targetResult.sid) ?? "";
      const sourceResult: SearchResult = {
        ...targetResult,
        text: referenceText,
        source: "reference",
      };
      return {
        key,
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
    async (target: SearchResult, replacement: string, isActive: boolean) => {
      // The active row may have cycled to a later occurrence — replace exactly
      // that one. Other rows replace their (first) match by picking it first.
      if (isActive) {
        await search.replaceCurrentMatch(replacement);
      } else {
        await search.replaceSearchResult(target, replacement);
      }
    },
    [search],
  );

  const virtualizer = useVirtualizer({
    count: isGroupedMode ? groupedItems.length : search.results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

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
    <div
      ref={parentRef}
      className={styles.searchResultsContainer}
      data-js={DATA_JS.searchResultsScrollContainer}
      data-num-search-results={search.results.length}
    >
      <div
        className={styles.searchResultsInner}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const groupedItem = isGroupedMode
            ? groupedItems[virtualRow.index]
            : null;
          const result = groupedItem
            ? groupedItem.sourceResult
            : search.results[virtualRow.index];
          if (!result) return null;
          return (
            <SearchResultRow
              key={
                groupedItem?.key ||
                `${result.source}-${result.sid}-${result.sidOccurrenceIndex}-${virtualRow.index}`
              }
              virtualRow={virtualRow}
              measureRef={virtualizer.measureElement}
              result={result}
              groupedItem={groupedItem}
              isActive={resolveIsActive(
                search.pickedResult,
                result,
                groupedItem,
              )}
              pickResult={resolvePickResult(
                result,
                groupedItem,
                search.searchReference,
              )}
              searchTerm={search.searchTerm}
              matchCase={search.matchCase}
              matchWholeWord={search.matchWholeWord}
              canReplace={!search.searchReference}
              defaultReplaceTerm={search.replaceTerm}
              localizedBookName={bookCodeToProjectLocalizedTitle({
                bookCode: result.bibleIdentifier,
              })}
              sourceProjectName={sourceProjectName}
              currentProjectName={currentProjectName}
              occurrence={
                resolveIsActive(search.pickedResult, result, groupedItem)
                  ? search.activeMatchOccurrence
                  : null
              }
              onStep={search.stepActiveMatch}
              onPick={(pick) => {
                search.pickSearchResult(pick);
                search.setIsSearchPaneOpen(false);
              }}
              onReplace={handleReplace}
            />
          );
        })}
      </div>
    </div>
  );
}

function resolveIsActive(
  pickedResult: SearchResult | null | undefined,
  result: SearchResult,
  groupedItem: GroupedItem | null,
): boolean {
  if (groupedItem) {
    return (
      pickedResult === groupedItem.sourceResult ||
      pickedResult === groupedItem.targetResult
    );
  }
  return pickedResult === result;
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

function SearchResultRow(props: {
  virtualRow: VirtualItem;
  measureRef: (node: Element | null) => void;
  result: SearchResult;
  groupedItem: GroupedItem | null;
  isActive: boolean;
  pickResult: SearchResult;
  searchTerm: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  canReplace: boolean;
  defaultReplaceTerm: string;
  localizedBookName: string;
  sourceProjectName: string;
  currentProjectName: string;
  occurrence: { count: number; position: number } | null;
  onStep: (direction: "next" | "prev") => void;
  onPick: (pick: SearchResult) => void;
  onReplace: (
    target: SearchResult,
    replacement: string,
    isActive: boolean,
  ) => Promise<void>;
}) {
  const { groupedItem, result } = props;
  return (
    <div
      data-index={props.virtualRow.index}
      ref={props.measureRef}
      className={styles.searchResultRow}
      style={{
        transform: `translateY(${props.virtualRow.start}px)`,
      }}
    >
      <SearchResultItem
        result={result}
        isActive={props.isActive}
        searchTerm={props.searchTerm}
        matchCase={props.matchCase}
        matchWholeWord={props.matchWholeWord}
        localizedBookName={props.localizedBookName}
        onPick={() => props.onPick(props.pickResult)}
        sourceProjectName={groupedItem ? props.sourceProjectName : undefined}
        currentProjectName={groupedItem ? props.currentProjectName : undefined}
        targetResult={groupedItem?.targetResult}
        canReplace={props.canReplace}
        defaultReplaceTerm={props.defaultReplaceTerm}
        occurrence={props.occurrence}
        onStep={props.onStep}
        onReplace={(replacement) =>
          props.onReplace(
            groupedItem?.targetResult ?? result,
            replacement,
            props.isActive,
          )
        }
      />
    </div>
  );
}
