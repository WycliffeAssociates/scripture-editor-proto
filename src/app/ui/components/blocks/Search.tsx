import { Trans, useLingui } from "@lingui/react/macro";
import {
    ActionIcon,
    Badge,
    Button,
    Drawer,
    Group,
    Loader,
    Popover,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    ArrowRight,
    ArrowUpDown,
    Braces,
    CaseSensitive,
    ChevronLeft,
    ChevronRight,
    CornerRightDown,
    Replace,
    Search,
    WholeWord,
    X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import Highlighter from "react-highlight-words";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import type { UseSearchReturn } from "@/app/ui/hooks/useSearch.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import searchClassNames from "@/app/ui/styles/modules/Search.module.css.ts";

export function SearchPanel() {
    const { search } = useWorkspaceContext();
    const { isSm, isDarkTheme } = useWorkspaceMediaQuery();

    if (!search.isSearchPaneOpen) return null;

    if (isSm) {
        return (
            <Drawer
                opened={search.isSearchPaneOpen}
                onClose={() => search.setIsSearchPaneOpen(false)}
                position="bottom"
                size="100%"
                title={
                    <Text fw={700} size="xl">
                        <Trans>Search</Trans>
                    </Text>
                }
                padding="md"
            >
                <div className={searchClassNames.drawerContent}>
                    <SearchControls search={search} />
                    <SearchResults search={search} isMobile={isSm} />
                </div>
            </Drawer>
        );
    }

    return (
        <aside
            className={searchClassNames.searchPanel}
            data-dark={isDarkTheme ? "true" : undefined}
        >
            <div className={searchClassNames.resultsHeader}>
                <Text fw={700} size="sm" c="white">
                    <Trans>All search results</Trans>
                </Text>
            </div>
            <SearchResults search={search} isMobile={false} />
        </aside>
    );
}

export function SearchControls({ search }: { search: UseSearchReturn }) {
    const { t } = useLingui();
    const { isSm } = useWorkspaceMediaQuery();
    const isSortActive = search.currentSort === "caseMismatch";
    const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
    const [suppressedTooltip, setSuppressedTooltip] = useState<string | null>(
        null,
    );

    function handleTooltipEnter(id: string) {
        if (suppressedTooltip === id) return;
        setHoveredTooltip(id);
    }

    function handleTooltipLeave(id: string) {
        if (hoveredTooltip === id) {
            setHoveredTooltip(null);
        }
        if (suppressedTooltip === id) {
            setSuppressedTooltip(null);
        }
    }

    function handleTooltipAction(id: string, action: () => void) {
        setHoveredTooltip(null);
        setSuppressedTooltip(id);
        action();
    }

    return (
        <div className={searchClassNames.controls}>
            <div className={searchClassNames.compactLayout}>
                <div className={searchClassNames.inputStack}>
                    <TextInput
                        size="sm"
                        radius="md"
                        value={search.searchTerm}
                        data-testid={TESTING_IDS.searchInput}
                        data-js="search-input"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                search.submitSearchNow();
                            }
                        }}
                        onChange={(e) =>
                            search.onSearchChange(e.currentTarget.value)
                        }
                        placeholder={t`Search`}
                        leftSection={<Search size={16} className="" />}
                        rightSectionWidth={62}
                        rightSection={
                            <Group wrap="nowrap">
                                {search.isSearching ? (
                                    <Loader size={14} />
                                ) : null}
                                <Tooltip
                                    label={t`Run search`}
                                    withArrow
                                    opened={hoveredTooltip === "run-search"}
                                >
                                    <ActionIcon
                                        size="sm"
                                        variant="light"
                                        color="blue"
                                        data-testid={
                                            TESTING_IDS.searchRunButton
                                        }
                                        aria-label={t`Run search`}
                                        onMouseEnter={() =>
                                            handleTooltipEnter("run-search")
                                        }
                                        onMouseLeave={() =>
                                            handleTooltipLeave("run-search")
                                        }
                                        onClick={() =>
                                            handleTooltipAction(
                                                "run-search",
                                                search.submitSearchNow,
                                            )
                                        }
                                    >
                                        <CornerRightDown size={13} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        }
                    />

                    <TextInput
                        data-testid={TESTING_IDS.replaceInput}
                        size="xs"
                        value={search.replaceTerm}
                        disabled={search.searchReference}
                        onChange={(e) =>
                            search.setReplaceTerm(e.currentTarget.value)
                        }
                        placeholder={t`Replace with...`}
                        leftSection={<Replace size={13} />}
                    />
                </div>

                <div className={searchClassNames.controlRail}>
                    <div className={searchClassNames.statsAndNavRow}>
                        <Text
                            size="xs"
                            fw={600}
                            className={searchClassNames.statsText}
                        >
                            <span data-testid={TESTING_IDS.searchStats}>
                                {search.pickedResultIdx >= 0
                                    ? `${search.pickedResultIdx + 1} of ${search.results.length} results`
                                    : `${search.results.length} results`}
                            </span>
                        </Text>
                        <Tooltip
                            label={t`Previous result`}
                            withArrow
                            opened={hoveredTooltip === "prev-result"}
                        >
                            <ActionIcon
                                data-testid={TESTING_IDS.searchPrevButton}
                                onClick={() =>
                                    handleTooltipAction(
                                        "prev-result",
                                        search.prevMatch,
                                    )
                                }
                                disabled={!search.hasPrev}
                                variant="transparent"
                                color="gray"
                                aria-label={t`Previous result`}
                                onMouseEnter={() =>
                                    handleTooltipEnter("prev-result")
                                }
                                onMouseLeave={() =>
                                    handleTooltipLeave("prev-result")
                                }
                            >
                                <ChevronLeft size={16} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            label={t`Next result`}
                            withArrow
                            opened={hoveredTooltip === "next-result"}
                        >
                            <ActionIcon
                                data-testid={TESTING_IDS.searchNextButton}
                                onClick={() => {
                                    handleTooltipAction(
                                        "next-result",
                                        search.nextMatch,
                                    );
                                }}
                                disabled={!search.hasNext}
                                variant="transparent"
                                color="gray"
                                aria-label={t`Next result`}
                                onMouseEnter={() =>
                                    handleTooltipEnter("next-result")
                                }
                                onMouseLeave={() =>
                                    handleTooltipLeave("next-result")
                                }
                            >
                                <ChevronRight size={16} />
                            </ActionIcon>
                        </Tooltip>
                    </div>

                    <div className={searchClassNames.filterIconsRow}>
                        <Tooltip
                            label={
                                isSortActive
                                    ? t`Remove sort`
                                    : t`Group case mismatches`
                            }
                            withArrow
                            opened={hoveredTooltip === "sort"}
                        >
                            <ActionIcon
                                data-testid={TESTING_IDS.sortToggleButton}
                                size="sm"
                                variant={isSortActive ? "filled" : "light"}
                                color={isSortActive ? "orange" : "gray"}
                                onClick={() =>
                                    handleTooltipAction("sort", () =>
                                        search.sortBy(
                                            isSortActive
                                                ? "canonical"
                                                : "caseMismatch",
                                        ),
                                    )
                                }
                                disabled={!search.results.length}
                                aria-label={
                                    isSortActive
                                        ? t`Remove sort`
                                        : t`Group case mismatches`
                                }
                                onMouseEnter={() => handleTooltipEnter("sort")}
                                onMouseLeave={() => handleTooltipLeave("sort")}
                            >
                                <ArrowUpDown size={14} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            label={
                                search.matchCase
                                    ? t`Disable match case`
                                    : t`Match case`
                            }
                            withArrow
                            opened={hoveredTooltip === "match-case"}
                        >
                            <ActionIcon
                                data-testid={TESTING_IDS.matchCaseCheckbox}
                                size="sm"
                                variant={search.matchCase ? "filled" : "light"}
                                color={search.matchCase ? "blue" : "gray"}
                                onClick={() =>
                                    handleTooltipAction("match-case", () =>
                                        search.setMatchCase(!search.matchCase),
                                    )
                                }
                                aria-label={
                                    search.matchCase
                                        ? t`Disable match case`
                                        : t`Match case`
                                }
                                onMouseEnter={() =>
                                    handleTooltipEnter("match-case")
                                }
                                onMouseLeave={() =>
                                    handleTooltipLeave("match-case")
                                }
                            >
                                <CaseSensitive size={14} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            label={
                                search.matchWholeWord
                                    ? t`Disable whole word`
                                    : t`Whole word`
                            }
                            withArrow
                            opened={hoveredTooltip === "whole-word"}
                        >
                            <ActionIcon
                                data-testid={TESTING_IDS.matchWholeWordCheckbox}
                                size="sm"
                                variant={
                                    search.matchWholeWord ? "filled" : "light"
                                }
                                color={search.matchWholeWord ? "blue" : "gray"}
                                onClick={() =>
                                    handleTooltipAction("whole-word", () =>
                                        search.setMatchWholeWord(
                                            !search.matchWholeWord,
                                        ),
                                    )
                                }
                                aria-label={
                                    search.matchWholeWord
                                        ? t`Disable whole word`
                                        : t`Whole word`
                                }
                                onMouseEnter={() =>
                                    handleTooltipEnter("whole-word")
                                }
                                onMouseLeave={() =>
                                    handleTooltipLeave("whole-word")
                                }
                            >
                                <WholeWord size={14} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            label={
                                search.searchUSFM
                                    ? t`Disable USFM markers`
                                    : t`Include USFM markers`
                            }
                            withArrow
                            opened={hoveredTooltip === "search-usfm"}
                        >
                            <ActionIcon
                                data-testid={
                                    TESTING_IDS.includeUSFMMarkersCheckbox
                                }
                                size="sm"
                                variant={search.searchUSFM ? "filled" : "light"}
                                color={search.searchUSFM ? "blue" : "gray"}
                                onClick={() =>
                                    handleTooltipAction("search-usfm", () =>
                                        search.setSearchUSFM(
                                            !search.searchUSFM,
                                        ),
                                    )
                                }
                                aria-label={
                                    search.searchUSFM
                                        ? t`Disable USFM markers`
                                        : t`Include USFM markers`
                                }
                                onMouseEnter={() =>
                                    handleTooltipEnter("search-usfm")
                                }
                                onMouseLeave={() =>
                                    handleTooltipLeave("search-usfm")
                                }
                            >
                                <Braces size={14} />
                            </ActionIcon>
                        </Tooltip>
                        {search.hasReferenceSearchAvailable ? (
                            <Tooltip
                                label={
                                    search.searchReference
                                        ? t`Disable search reference`
                                        : t`Search reference`
                                }
                                withArrow
                                opened={hoveredTooltip === "search-reference"}
                            >
                                <ActionIcon
                                    data-testid={
                                        TESTING_IDS.searchReferenceToggle
                                    }
                                    size="sm"
                                    variant={
                                        search.searchReference
                                            ? "filled"
                                            : "light"
                                    }
                                    color={
                                        search.searchReference ? "blue" : "gray"
                                    }
                                    onClick={() =>
                                        handleTooltipAction(
                                            "search-reference",
                                            () =>
                                                search.setSearchReference(
                                                    !search.searchReference,
                                                ),
                                        )
                                    }
                                    aria-label={
                                        search.searchReference
                                            ? t`Disable search reference`
                                            : t`Search reference`
                                    }
                                    onMouseEnter={() =>
                                        handleTooltipEnter("search-reference")
                                    }
                                    onMouseLeave={() =>
                                        handleTooltipLeave("search-reference")
                                    }
                                >
                                    R
                                </ActionIcon>
                            </Tooltip>
                        ) : null}
                    </div>
                </div>
            </div>

            {isSortActive && (
                <div className={searchClassNames.sortBadgeRow}>
                    <Badge
                        data-testid={TESTING_IDS.searchCaseMismatchLabel}
                        color="orange"
                        variant="light"
                    >
                        {t`Case mismatches first`} ({search.numCaseMismatches})
                    </Badge>
                </div>
            )}

            <div className={searchClassNames.buttonStack}>
                <Group grow wrap={isSm ? "wrap" : "nowrap"}>
                    <Button
                        data-testid={TESTING_IDS.replaceAllButton}
                        size="xs"
                        variant="default"
                        onClick={search.replaceAllInChapter}
                        disabled={
                            search.searchReference ||
                            !search.totalMatches ||
                            search.replaceTerm.trim().length === 0 ||
                            search.pickedResult?.source === "reference"
                        }
                    >
                        {t`Replace all in this chapter`}
                    </Button>
                    <Button
                        data-testid={TESTING_IDS.replaceButton}
                        size="xs"
                        variant="filled"
                        onClick={search.replaceCurrentMatch}
                        disabled={
                            search.searchReference ||
                            !search.totalMatches ||
                            search.replaceTerm.trim().length === 0 ||
                            search.pickedResult?.source === "reference"
                        }
                    >
                        {t`Replace`}
                    </Button>
                </Group>
            </div>
        </div>
    );
}

export function SearchPopoverControls() {
    const { search, project, bookCodeToProjectLocalizedTitle } =
        useWorkspaceContext();
    const { t } = useLingui();
    const activeBookCode =
        search.pickedResult?.bibleIdentifier ?? project.pickedFile.bookCode;
    const activeChapter =
        search.pickedResult?.chapNum ??
        project.pickedChapter?.chapNumber ??
        project.currentChapter;
    const chapterResults = search.results.filter(
        (result) =>
            result.bibleIdentifier === activeBookCode &&
            result.chapNum === activeChapter,
    );
    const chapterTotalMatches = chapterResults.length;
    const chapterMatchIndex = search.pickedResult
        ? chapterResults.findIndex(
              (result) =>
                  result.sid === search.pickedResult?.sid &&
                  result.source === search.pickedResult?.source &&
                  result.sidOccurrenceIndex ===
                      search.pickedResult?.sidOccurrenceIndex,
          )
        : -1;
    const chapterMatchNumber =
        chapterMatchIndex >= 0 ? chapterMatchIndex + 1 : 0;
    const activeBookTitle = bookCodeToProjectLocalizedTitle({
        bookCode: activeBookCode,
    });
    const chapterLabel =
        activeChapter === 0 ? t`Introduction` : String(activeChapter);

    return (
        <Popover.Dropdown className={searchClassNames.popoverDropdown} p="sm">
            <div className={searchClassNames.popoverHeader}>
                <div className={searchClassNames.popoverHeaderInfo}>
                    <Text fw={700} size="sm">
                        <Trans>Search</Trans>
                    </Text>
                    <Text
                        size="xs"
                        className={searchClassNames.popoverHelpText}
                    >
                        <Trans>
                            Match {chapterMatchNumber} of {chapterTotalMatches}{" "}
                            in {activeBookTitle} {chapterLabel}
                        </Trans>
                    </Text>
                </div>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => search.setIsSearchPaneOpen(false)}
                    aria-label={t`Close search`}
                >
                    <X size={18} />
                </ActionIcon>
            </div>
            <SearchControls search={search} />
        </Popover.Dropdown>
    );
}

function SearchResults({
    search,
    isMobile,
}: {
    search: UseSearchReturn;
    isMobile: boolean;
}) {
    const { t } = useLingui();
    const { allProjects, currentProjectRoute, referenceProject } =
        useWorkspaceContext();
    const parentRef = useRef<HTMLDivElement>(null);
    const isGroupedMode =
        search.searchReference && search.hasReferenceSearchAvailable;
    const currentProjectName = useMemo(() => {
        const project = allProjects.find(
            (item) => item.projectDirectoryPath === currentProjectRoute,
        );
        return project?.name || t`Current project`;
    }, [allProjects, currentProjectRoute, t]);
    const sourceProjectName = useMemo(() => {
        const project = allProjects.find(
            (item) =>
                item.projectDirectoryPath ===
                referenceProject.referenceProjectId,
        );
        return project?.name || t`Reference project`;
    }, [allProjects, referenceProject.referenceProjectId, t]);
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
        estimateSize: () => 72,
        overscan: 5,
    });

    // Handle empty/loading states
    if (!search.searchTerm && !search.isSearching) {
        return (
            <div className={searchClassNames.emptyState}>
                <Search size={48} className={searchClassNames.searchIcon} />
                <Text>Type to start searching</Text>
            </div>
        );
    }

    // If loading, you might want to show nothing or a skeleton,
    // but keeping the 'Searching for...' text is also fine.
    if (search.isSearching) {
        return (
            <div className={searchClassNames.searchingState}>
                <Trans>
                    Searching for <strong>{search.searchTerm}</strong>...
                </Trans>
            </div>
        );
    }
    if (search.searchTerm && !search.results?.length) {
        return (
            <div className={searchClassNames.noResultsState}>
                <Trans>
                    No results found for <strong>{search.searchTerm}</strong>
                </Trans>
            </div>
        );
    }

    return (
        <div
            data-testid={TESTING_IDS.searchResultsContainer}
            data-js="search-results-scroll-container"
            data-num-search-results={search.results.length}
            ref={parentRef}
            className={searchClassNames.resultsContainer}
            style={{
                overflow: "auto",
                // Ensure container has a defined height (usually handled by flex parent, but check this)
                height: "100%",
            }}
        >
            <div
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
                    const activeOccurrenceIndex = isActive
                        ? result.sidOccurrenceIndex
                        : -1;

                    const findChunks = ({
                        searchWords,
                        textToHighlight,
                    }: {
                        searchWords: Array<string | RegExp>;
                        textToHighlight: string;
                    }) => {
                        const query = searchWords[0];
                        if (typeof query !== "string" || !textToHighlight)
                            return [];
                        const chunks = [];
                        const flags = search.matchCase ? "g" : "gi";
                        const escapedTerm =
                            typeof query === "string"
                                ? search.escapeRegex(query)
                                : query;
                        const pattern = search.matchWholeWord
                            ? `\\b${escapedTerm}\\b`
                            : escapedTerm;
                        const regex = new RegExp(pattern, flags);
                        let match: RegExpExecArray | null;
                        while (
                            // biome-ignore lint/suspicious/noAssignInExpressions: <intentional>
                            (match = regex.exec(textToHighlight)) !== null
                        ) {
                            chunks.push({
                                start: match.index,
                                end: match.index + match[0].length,
                            });
                        }
                        return chunks;
                    };

                    return (
                        <UnstyledButton
                            data-testid={TESTING_IDS.searchResultItem}
                            data-search-source={result.source}
                            data-search-row-type={
                                groupedItem ? "grouped" : "single"
                            }
                            data-search-book={result.bibleIdentifier}
                            data-search-chapter={String(result.chapNum)}
                            key={
                                groupedItem?.key ||
                                `${result.source}-${result.sid}-${result.sidOccurrenceIndex}-${result.naturalIndex}-${virtualRow.index}`
                            }
                            // 1. CRITICAL: Add data-index for the measurer
                            data-index={virtualRow.index}
                            // 2. CRITICAL: Measure the element
                            ref={virtualizer.measureElement}
                            onKeyUp={(e) => {
                                e.key === "Enter" &&
                                    search.pickSearchResult(
                                        groupedItem
                                            ? groupedItem.sourceResult
                                            : result,
                                    );
                            }}
                            onClick={() => {
                                search.pickSearchResult(
                                    groupedItem
                                        ? groupedItem.sourceResult
                                        : result,
                                );
                                // Close search panel on mobile after navigating to result
                                if (isMobile) {
                                    search.setIsSearchPaneOpen(false);
                                }
                            }}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",

                                // 3. Position using transform
                                transform: `translateY(${virtualRow.start}px)`,

                                // 4. CRITICAL: Remove fixed 'height'.
                                // Let the CSS padding + content determine the height.
                                // The virtualizer will read this height via the ref.

                                // Keep the flex styles for layout
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                alignItems: "stretch",
                                textAlign: "left",
                            }}
                            data-active={isActive ? "true" : "false"}
                            className={searchClassNames.searchResult}
                        >
                            <span
                                className={searchClassNames.resultHeader}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                }}
                            >
                                {!groupedItem ? (
                                    <span
                                        className={
                                            searchClassNames.resultSource
                                        }
                                    >
                                        {result.source === "reference"
                                            ? t`SRC`
                                            : t`TGT`}
                                    </span>
                                ) : null}
                                <span className={searchClassNames.resultSid}>
                                    {result.sid}
                                </span>
                                <ArrowRight
                                    size={14}
                                    className={searchClassNames.resultArrow}
                                />
                            </span>

                            {groupedItem ? (
                                <div className={searchClassNames.resultPair}>
                                    <div
                                        className={
                                            searchClassNames.resultPairBlock
                                        }
                                    >
                                        <span
                                            className={
                                                searchClassNames.resultProjectLabel
                                            }
                                            data-project-label="source"
                                        >
                                            {sourceProjectName}
                                        </span>
                                        <span
                                            className={
                                                searchClassNames.resultText
                                            }
                                            style={{ display: "block" }}
                                        >
                                            <Highlighter
                                                caseSensitive={search.matchCase}
                                                findChunks={findChunks}
                                                searchWords={[
                                                    search.searchTerm,
                                                ]}
                                                activeIndex={
                                                    activeOccurrenceIndex
                                                }
                                                activeClassName={
                                                    searchClassNames.activeHighlight
                                                }
                                                textToHighlight={
                                                    groupedItem.sourceResult
                                                        .text
                                                }
                                                highlightClassName={
                                                    searchClassNames.highlight
                                                }
                                            />
                                        </span>
                                    </div>
                                    <div
                                        className={
                                            searchClassNames.resultPairBlock
                                        }
                                    >
                                        <span
                                            className={
                                                searchClassNames.resultProjectLabel
                                            }
                                            data-project-label="target"
                                        >
                                            {currentProjectName}
                                        </span>
                                        <span
                                            className={
                                                searchClassNames.resultText
                                            }
                                            style={{ display: "block" }}
                                        >
                                            <Highlighter
                                                caseSensitive={search.matchCase}
                                                findChunks={findChunks}
                                                searchWords={[
                                                    search.searchTerm,
                                                ]}
                                                activeIndex={
                                                    activeOccurrenceIndex
                                                }
                                                activeClassName={
                                                    searchClassNames.activeHighlight
                                                }
                                                textToHighlight={
                                                    groupedItem.targetResult
                                                        ?.text ?? ""
                                                }
                                                highlightClassName={
                                                    searchClassNames.highlight
                                                }
                                            />
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <span
                                    className={searchClassNames.resultText}
                                    style={{ display: "block" }}
                                >
                                    <Highlighter
                                        caseSensitive={search.matchCase}
                                        findChunks={findChunks}
                                        searchWords={[search.searchTerm]}
                                        activeIndex={activeOccurrenceIndex}
                                        activeClassName={
                                            searchClassNames.activeHighlight
                                        }
                                        textToHighlight={result.text}
                                        highlightClassName={
                                            searchClassNames.highlight
                                        }
                                    />
                                </span>
                            )}
                        </UnstyledButton>
                    );
                })}
            </div>
        </div>
    );
}
