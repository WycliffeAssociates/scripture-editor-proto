import { Trans, useLingui } from "@lingui/react/macro";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { DATA_JS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";
import { SearchResultItem } from "./SearchResultItem.tsx";

export function SearchResults() {
    const { t } = useLingui();
    const { search, allProjects, currentProjectRoute, referenceResource } =
        useWorkspaceContext();
    const parentRef = useRef<HTMLDivElement>(null);
    const isGroupedMode =
        search.searchReference &&
        (search.referenceResults.length > 0 || search.targetResults.length > 0);

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

    const groupedItems = useMemo(() => {
        if (!isGroupedMode) return [];

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
    }, [isGroupedMode, search.referenceResults, search.targetResults]);

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
                <span>{t`Type to start searching`}</span>
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
                    const isActive = groupedItem
                        ? search.pickedResult === groupedItem.sourceResult ||
                          search.pickedResult === groupedItem.targetResult
                        : search.pickedResult === result;

                    return (
                        <div
                            key={
                                groupedItem?.key ||
                                `${result.source}-${result.sid}-${result.sidOccurrenceIndex}-${virtualRow.index}`
                            }
                            data-index={virtualRow.index}
                            ref={virtualizer.measureElement}
                            className={styles.searchResultRow}
                            style={{
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <SearchResultItem
                                result={result}
                                isActive={isActive}
                                searchTerm={search.searchTerm}
                                matchCase={search.matchCase}
                                matchWholeWord={search.matchWholeWord}
                                onPick={() =>
                                    search.pickSearchResult(
                                        groupedItem
                                            ? groupedItem.sourceResult
                                            : result,
                                    )
                                }
                                sourceProjectName={
                                    groupedItem ? sourceProjectName : undefined
                                }
                                currentProjectName={
                                    groupedItem ? currentProjectName : undefined
                                }
                                targetResult={groupedItem?.targetResult}
                                canReplace={!search.searchReference}
                                defaultReplaceTerm={search.replaceTerm}
                                onReplace={async (replacement) => {
                                    const replaceTarget =
                                        groupedItem?.targetResult ?? result;
                                    await search.replaceSearchResult(
                                        replaceTarget,
                                        replacement,
                                    );
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
