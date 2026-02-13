import { Trans, useLingui } from "@lingui/react/macro";
import {
    Accordion,
    ActionIcon,
    Button,
    Checkbox,
    Drawer,
    Group,
    Loader,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    ArrowRight,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Replace,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";
import { useRef } from "react";
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
            <div className={searchClassNames.header}>
                <Text fw={700} size="xl">
                    Search
                </Text>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => search.setIsSearchPaneOpen(false)}
                >
                    <X size={24} />
                </ActionIcon>
            </div>

            <SearchControls search={search} />
            <SearchResults search={search} isMobile={false} />
        </aside>
    );
}

function SearchControls({ search }: { search: UseSearchReturn }) {
    const { t } = useLingui();
    const isSortActive = search.currentSort === "caseMismatch";

    return (
        <div className={searchClassNames.controls}>
            {/* SEARCH INPUT */}
            <div className={searchClassNames.searchInputSection}>
                <TextInput
                    size="md"
                    radius="md"
                    // 1. Bind to the local state (controlled)
                    value={search.searchTerm}
                    data-testid={TESTING_IDS.searchInput}
                    data-js="search-input"
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            search.onSearchChange(search.searchTerm);
                        }
                    }}
                    // 2. Use the new handler that updates local state AND triggers debounce
                    onChange={(e) =>
                        search.onSearchChange(e.currentTarget.value)
                    }
                    placeholder={t`Search`}
                    leftSection={<Search size={18} className="" />}
                    // 3. Right section now handles Loading OR Navigation
                    rightSectionWidth={search.isSearching ? 40 : 70}
                    rightSection={
                        search.isSearching ? (
                            <Loader size={20} />
                        ) : (
                            <Group gap={0} mr={4}>
                                <ActionIcon
                                    data-testid={TESTING_IDS.searchPrevButton}
                                    onClick={search.prevMatch}
                                    disabled={!search.hasPrev}
                                    variant="transparent"
                                    color="gray"
                                >
                                    <ChevronLeft size={18} />
                                </ActionIcon>
                                <ActionIcon
                                    data-testid={TESTING_IDS.searchNextButton}
                                    onClick={() => {
                                        search.nextMatch();
                                    }}
                                    disabled={!search.hasNext}
                                    variant="transparent"
                                    color="gray"
                                >
                                    <ChevronRight size={18} />
                                </ActionIcon>
                            </Group>
                        )
                    }
                />
            </div>

            <div className={searchClassNames.stats}>
                {/* Sort Toggle */}
                <Group gap={6}>
                    <Tooltip
                        label={
                            isSortActive
                                ? t`Remove sort`
                                : t`Group case mismatches`
                        }
                        withArrow
                        position="top"
                    >
                        <ActionIcon
                            data-testid={TESTING_IDS.sortToggleButton}
                            size="sm"
                            variant={isSortActive ? "filled" : "light"}
                            color={isSortActive ? "orange" : "gray"}
                            onClick={() =>
                                search.sortBy(
                                    isSortActive ? "canonical" : "caseMismatch",
                                )
                            }
                            disabled={!search.totalMatches}
                        >
                            <ArrowUpDown size={14} />
                        </ActionIcon>
                    </Tooltip>

                    {isSortActive && (
                        <Text
                            data-testid={TESTING_IDS.searchCaseMismatchLabel}
                            size="xs"
                            c="orange"
                            fw={600}
                            style={{ lineHeight: 1 }}
                        >
                            {t`Case mismatches first`} (
                            {search.numCaseMismatches})
                        </Text>
                    )}
                </Group>

                {/* Counts */}
                <Stack gap={0}>
                    <span data-testid={TESTING_IDS.searchStats}>
                        {search.pickedResultIdx >= 0
                            ? `${search.pickedResultIdx + 1} of ${search.results.length} results`
                            : `${search.results.length} results`}
                    </span>
                </Stack>
            </div>

            <Accordion
                className={searchClassNames.optionsAccordion}
                variant="filled"
                radius="md"
                chevronPosition="right"
            >
                <Accordion.Item value="options">
                    <Accordion.Control icon={<SlidersHorizontal size={16} />}>
                        <Trans>Options</Trans>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Stack gap="sm">
                            <Group gap="md">
                                <Checkbox
                                    data-testid={TESTING_IDS.matchCaseCheckbox}
                                    label={t`Match Case`}
                                    checked={search.matchCase}
                                    onChange={(e) =>
                                        search.setMatchCase(
                                            e.currentTarget.checked,
                                        )
                                    }
                                    size="xs"
                                />
                                <Checkbox
                                    data-testid={
                                        TESTING_IDS.matchWholeWordCheckbox
                                    }
                                    label={t`Whole Word`}
                                    checked={search.matchWholeWord}
                                    onChange={(e) =>
                                        search.setMatchWholeWord(
                                            e.currentTarget.checked,
                                        )
                                    }
                                    size="xs"
                                />
                                <Checkbox
                                    data-testid={
                                        TESTING_IDS.includeUSFMMarkersCheckbox
                                    }
                                    label={t`Include USFM markers`}
                                    checked={search.searchUSFM}
                                    onChange={(e) =>
                                        search.setSearchUSFM(
                                            e.currentTarget.checked,
                                        )
                                    }
                                    size="xs"
                                />
                            </Group>

                            <div className={searchClassNames.replaceSection}>
                                <Text fw={600} size="sm">
                                    <Trans>Replace</Trans>
                                </Text>
                                <TextInput
                                    data-testid={TESTING_IDS.replaceInput}
                                    size="sm"
                                    value={search.replaceTerm}
                                    onChange={(e) =>
                                        search.setReplaceTerm(
                                            e.currentTarget.value,
                                        )
                                    }
                                    placeholder={t`Replace with...`}
                                    leftSection={<Replace size={14} />}
                                />
                                <Group grow>
                                    <Button
                                        data-testid={TESTING_IDS.replaceButton}
                                        size="xs"
                                        variant="default"
                                        onClick={search.replaceCurrentMatch}
                                        disabled={!search.totalMatches}
                                    >
                                        {t`Replace`}
                                    </Button>
                                    <Button
                                        data-testid={
                                            TESTING_IDS.replaceAllButton
                                        }
                                        size="xs"
                                        variant="default"
                                        onClick={search.replaceAllInChapter}
                                        disabled={!search.totalMatches}
                                    >
                                        {t`Replace all in this chapter`}
                                    </Button>
                                </Group>
                            </div>
                        </Stack>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </div>
    );
}

function SearchResults({
    search,
    isMobile,
}: {
    search: UseSearchReturn;
    isMobile: boolean;
}) {
    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: search.results.length,
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
                    const result = search.results[virtualRow.index];
                    const isActive = search.pickedResult === result;

                    return (
                        <UnstyledButton
                            data-testid={TESTING_IDS.searchResultItem}
                            key={`${result.sid}-${virtualRow.index}`}
                            // 1. CRITICAL: Add data-index for the measurer
                            data-index={virtualRow.index}
                            // 2. CRITICAL: Measure the element
                            ref={virtualizer.measureElement}
                            onKeyUp={(e) => {
                                e.key === "Enter" &&
                                    search.pickSearchResult(result);
                            }}
                            onClick={() => {
                                search.pickSearchResult(result);
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
                                <span className={searchClassNames.resultSid}>
                                    {result.sid}
                                </span>
                                <ArrowRight
                                    size={14}
                                    className={searchClassNames.resultArrow}
                                />
                            </span>

                            <span
                                className={searchClassNames.resultText}
                                style={{ display: "block" }}
                            >
                                <Highlighter
                                    caseSensitive={search.matchCase}
                                    findChunks={({
                                        searchWords,
                                        textToHighlight,
                                    }) => {
                                        const query = searchWords[0]; // We only have one search term
                                        if (!query || !textToHighlight)
                                            return [];

                                        const chunks = [];

                                        // A. Handle Case Sensitivity
                                        const flags = search.matchCase
                                            ? "g"
                                            : "gi";

                                        // B. Handle Whole Word vs Substring
                                        const escapedTerm =
                                            typeof query === "string"
                                                ? search.escapeRegex(query)
                                                : query;
                                        const pattern = search.matchWholeWord
                                            ? `\\b${escapedTerm}\\b`
                                            : escapedTerm;

                                        const regex = new RegExp(
                                            pattern,
                                            flags,
                                        );

                                        // C. Execute Regex to find all occurrences
                                        let match: RegExpExecArray | null;
                                        while (
                                            // biome-ignore lint/suspicious/noAssignInExpressions: <intentional>
                                            (match =
                                                regex.exec(textToHighlight)) !==
                                            null
                                        ) {
                                            chunks.push({
                                                start: match.index,
                                                end:
                                                    match.index +
                                                    match[0].length,
                                            });
                                        }

                                        return chunks;
                                    }}
                                    searchWords={[search.searchTerm]}
                                    textToHighlight={result.text}
                                    highlightClassName={
                                        searchClassNames.highlight
                                    }
                                />
                            </span>
                        </UnstyledButton>
                    );
                })}
            </div>
        </div>
    );
}
