import { Trans, useLingui } from "@lingui/react/macro";
import {
  ActionIcon,
  Button,
  Checkbox,
  Drawer,
  darken,
  Group,
  Loader,
  type MantineTheme,
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
  X,
} from "lucide-react";
import { useRef } from "react";
import Highlighter from "react-highlight-words";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import type { UseSearchReturn } from "@/app/ui/hooks/useSearch.tsx";
import searchClassNames from "@/app/ui/styles/modules/Search.module.css.ts";

export function SearchPanel() {
  const { search } = useWorkspaceContext();
  const { isSm, theme, isDarkTheme } = useWorkspaceMediaQuery();

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
          <SearchResults search={search} theme={theme} isDark={isDarkTheme} />
        </div>
      </Drawer>
    );
  }

  return (
    <aside
      style={{
        backgroundColor: isDarkTheme
          ? darken(theme.colors.surfaceDark[0], 0.2)
          : theme.colors.primary[0],
      }}
      className={searchClassNames.searchPanel}
      data-dark={isDarkTheme}
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
      <SearchResults search={search} theme={theme} isDark={isDarkTheme} />
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
          data-js="search-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              search.onSearchChange(search.searchTerm);
            }
          }}
          // 2. Use the new handler that updates local state AND triggers debounce
          onChange={(e) => search.onSearchChange(e.currentTarget.value)}
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
                  onClick={search.prevMatch}
                  disabled={!search.hasPrev}
                  variant="transparent"
                  color="gray"
                >
                  <ChevronLeft size={18} />
                </ActionIcon>
                <ActionIcon
                  onClick={search.nextMatch}
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

        <Group gap="md">
          <Checkbox
            label={t`Match Case`}
            checked={search.matchCase}
            onChange={(e) => search.setMatchCase(e.currentTarget.checked)}
            size="xs"
          />
          <Checkbox
            label={t`Whole Word`}
            checked={search.matchWholeWord}
            onChange={(e) => search.setMatchWholeWord(e.currentTarget.checked)}
            size="xs"
          />
        </Group>
      </div>

      <div className={searchClassNames.replaceSection}>
        <Text>
          <Trans>Replace With:</Trans>
        </Text>
        <TextInput
          size="sm"
          value={search.replaceTerm}
          onChange={(e) => search.setReplaceTerm(e.currentTarget.value)}
          placeholder={t`Replace with...`}
          leftSection={<Replace size={14} />}
        />
        <Group grow>
          <Button
            size="xs"
            variant="default"
            onClick={search.replaceCurrentMatch}
            disabled={!search.totalMatches}
          >
            {t`Replace`}
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={search.replaceAllInChapter}
            disabled={!search.totalMatches}
          >
            {t`Replace All`}
          </Button>
        </Group>
      </div>

      <div className={searchClassNames.stats}>
        {/* Sort Toggle */}
        <Group gap={6}>
          <Tooltip
            label={isSortActive ? t`Remove sort` : t`Group case mismatches`}
            withArrow
            position="top"
          >
            <ActionIcon
              size="sm"
              variant={isSortActive ? "filled" : "light"}
              color={isSortActive ? "orange" : "gray"}
              onClick={() =>
                search.sortBy(isSortActive ? "canonical" : "caseMismatch")
              }
              disabled={!search.totalMatches}
            >
              <ArrowUpDown size={14} />
            </ActionIcon>
          </Tooltip>

          {isSortActive && (
            <Text size="xs" c="orange" fw={600} style={{ lineHeight: 1 }}>
              {t`Case mismatches first`} ({search.numCaseMismatches})
            </Text>
          )}
        </Group>

        {/* Counts */}
        <Group gap={4}>
          <span>
            {search.totalMatches > 0
              ? `${search.currentMatchIndex + 1} / ${search.totalMatches}`
              : "0 / 0"}
          </span>
        </Group>
      </div>
    </div>
  );
}

function SearchResults({
  search,
  theme,
  isDark,
}: {
  search: UseSearchReturn;
  theme: MantineTheme;
  isDark: boolean;
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

  const getStyles = (isActive: boolean) => {
    const base = isDark
      ? {
          bg: isActive ? theme.colors.primary[8] : theme.colors.dark[8],
          text: theme.colors.textDark[0],
          hoverBg: isActive
            ? theme.colors.primary[8]
            : darken(theme.colors.primary[8], 0.3),
        }
      : {
          bg: isActive ? theme.colors.primary[8] : "",
          text: isActive ? theme.colors.textDark[0] : theme.colors.textLight[0],
          hoverBg: isActive
            ? theme.colors.primary[8]
            : darken(theme.colors.primary[0], 0.1),
        };

    return {
      "--data-bg": base.bg,
      "--data-text": base.text,
      "--data-hover-bg": base.hoverBg,
    };
  };

  return (
    <div
      ref={parentRef}
      className={searchClassNames.resultsContainer}
      style={{
        overflow: "auto",
        // Ensure the container has a defined height (usually handled by flex parent, but check this)
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
          const isActive =
            search.results[search.currentMatchIndex]?.sid === result?.sid;

          return (
            <UnstyledButton
              key={`${result.sid}-${virtualRow.index}`}
              // 1. CRITICAL: Add data-index for the measurer
              data-index={virtualRow.index}
              // 2. CRITICAL: Measure the element
              ref={virtualizer.measureElement}
              onKeyUp={(e) =>
                e.key === "Enter" && search.pickSearchResult(result)
              }
              onClick={() => search.pickSearchResult(result)}
              style={{
                ...getStyles(isActive),
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
              data-active={isActive}
              data-bg={isDark ? theme.colors.primary[8] : theme.colors.gray[1]}
              data-text={isDark ? theme.colors.gray[1] : theme.colors.gray[700]}
              className={searchClassNames.searchResult}
            >
              <span
                className={searchClassNames.resultHeader}
                style={{ display: "flex", alignItems: "center" }}
              >
                <span className={searchClassNames.resultSid}>{result.sid}</span>
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
                  findChunks={({ searchWords, textToHighlight }) => {
                    const query = searchWords[0]; // We only have one search term
                    if (!query || !textToHighlight) return [];

                    const chunks = [];

                    // A. Handle Case Sensitivity
                    const flags = search.matchCase ? "g" : "gi";

                    // B. Handle Whole Word vs Substring
                    const escapedTerm =
                      typeof query === "string"
                        ? search.escapeRegex(query)
                        : query;
                    const pattern = search.matchWholeWord
                      ? `\\b${escapedTerm}\\b`
                      : escapedTerm;

                    const regex = new RegExp(pattern, flags);

                    // C. Execute Regex to find all occurrences
                    let match: RegExpExecArray | null;
                    // biome-ignore lint/suspicious/noAssignInExpressions: <intentional>
                    while ((match = regex.exec(textToHighlight)) !== null) {
                      chunks.push({
                        start: match.index,
                        end: match.index + match[0].length,
                      });
                    }

                    return chunks;
                  }}
                  searchWords={[search.searchTerm]}
                  textToHighlight={result.text}
                  highlightClassName={searchClassNames.highlight}
                />
              </span>
            </UnstyledButton>
          );
        })}
      </div>
    </div>
  );
}
