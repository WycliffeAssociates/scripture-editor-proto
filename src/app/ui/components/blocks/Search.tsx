import { Trans } from "@lingui/react/macro";
import {
  ActionIcon,
  Button,
  Checkbox,
  Drawer,
  darken,
  Group,
  lighten,
  type MantineTheme,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Replace,
  Search,
  X,
} from "lucide-react"; // Assuming tabler icons based on your snippet
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import type { UseSearchReturn } from "@/app/ui/hooks/useSearch.tsx";
import searchClassNames from "@/app/ui/styles/modules/Search.module.css";
// ... import your context and types

export function SearchPanel() {
  const { search } = useWorkspaceContext();
  const { isSm, theme, isDarkTheme } = useWorkspaceMediaQuery();
  // If search is closed, render nothing
  if (!search.isSearchPaneOpen) return null;

  // Mobile Strategy: Use a Drawer component to take over the screen
  if (isSm) {
    return (
      <Drawer
        opened={search.isSearchPaneOpen}
        onClose={() => search.setIsSearchPaneOpen(false)}
        position="bottom" // or 'right'
        size="100%"
        title={
          <Text fw={700} size="xl">
            <Trans>Search</Trans>
          </Text>
        }
        padding="md"
      >
        {/* Re-use the inner content */}
        <div className="flex flex-col h-full overflow-hidden">
          <SearchControls search={search} isMobile={true} theme={theme} />
          <SearchResults search={search} theme={theme} isDark={isDarkTheme} />
        </div>
      </Drawer>
    );
  }

  // Desktop Strategy: The Sidebar as designed
  return (
    <aside
      style={{
        backgroundColor: isDarkTheme
          ? darken(theme.colors.surfaceDark[0], 0.2)
          : theme.colors.primary[0],
      }}
      className={`max-w-[50ch]  border-l h-full overflow-hidden grid grid-rows-[auto_1fr] shadow-xl dark:shadow-none z-20`}
    >
      {/* Header area matching Figma */}
      <div className="p-4 pb-2 flex justify-between items-center">
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

      <SearchControls search={search} isMobile={false} theme={theme} />
      <SearchResults search={search} theme={theme} isDark={isDarkTheme} />
    </aside>
  );
}

function SearchControls({
  search,
  isMobile,
  theme,
}: {
  search: UseSearchReturn;
  isMobile: boolean;
  theme: MantineTheme;
}) {
  return (
    <div className="w-full  px-4 py-2 border-b border-gray-100 flex flex-col gap-4">
      {/* SEARCH INPUT */}
      <div className="flex flex-col gap-2">
        <TextInput
          size="md"
          radius="md"
          value={search.searchTerm}
          data-js="search-input"
          onChange={(e) => search.setSearch(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && search.searchProject()}
          placeholder="Search"
          leftSection={<Search size={18} className="" />}
          // Clean right section: Just the navigator arrows
          rightSectionWidth={70}
          rightSection={
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
          }
        />

        {/* LITERACY FRIENDLY OPTIONS: Text instead of Icons */}
        <Group gap="md">
          <Checkbox
            label="Match Case"
            checked={search.matchCase}
            onChange={(e) => search.setMatchCase(e.currentTarget.checked)}
            size="xs"
          />
          <Checkbox
            label="Whole Word"
            checked={search.matchWholeWord}
            onChange={(e) => search.setMatchWholeWord(e.currentTarget.checked)}
            size="xs"
          />
        </Group>
      </div>

      {/* REPLACE SECTION - Explicit styling */}
      <div className="flex flex-col gap-3">
        <Text>
          {" "}
          <Trans>Replace With:</Trans>
        </Text>
        <TextInput
          size="sm"
          value={search.replaceTerm}
          onChange={(e) => search.setReplaceTerm(e.currentTarget.value)}
          placeholder="Replace with..."
          leftSection={<Replace size={14} />}
        />
        <Group grow>
          <Button
            size="xs"
            variant="default"
            onClick={search.replaceCurrentMatch}
            disabled={!search.totalMatches}
          >
            Replace
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={search.replaceAllInChapter}
            disabled={!search.totalMatches}
          >
            Replace All
          </Button>
        </Group>
      </div>

      {/* STATS */}
      <div className="flex justify-between items-end  text-xs mt-1">
        <span>
          {search.totalMatches > 0
            ? `${search.currentMatchIndex + 1} / ${search.totalMatches} in chapter`
            : "No results in chapter"}
        </span>
        <span>{search.results.length} total</span>
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
  if (!search.searchTerm) {
    return (
      <div className="p-8 text-center ">
        <Search size={48} className="mx-auto mb-2 opacity-20" />
        <Text>Type to start searching</Text>
      </div>
    );
  }

  if (search.searchTerm && !search.results?.length) {
    return <div className="p-4 text-center ">No results found</div>;
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
    <ScrollArea className="flex-1">
      <ul className="flex flex-col">
        {search.results.map((result, index) => {
          // Check if this specific result is the currently "active" one in the iterator
          // You might need to adjust logic if `currentMatchIndex` maps directly to this array
          const isActive =
            search.results[search.currentMatchIndex]?.sid === result.sid;

          return (
            <li
              key={result.sid}
              onKeyUp={(e) =>
                e.key === "Enter" && search.pickSearchResult(result)
              }
              onClick={() => search.pickSearchResult(result)}
              style={getStyles(isActive)}
              data-active={isActive}
              data-bg={isDark ? theme.colors.primary[8] : theme.colors.gray[1]}
              data-text={isDark ? theme.colors.gray[1] : theme.colors.gray[700]}
              className={`
                                ${searchClassNames.searchResult}
                            `}
            >
              <div className="flex justify-between items-center w-full">
                <span className={`font-bold text-xs uppercase tracking-wider`}>
                  {result.sid}
                </span>
                <ArrowRight
                  size={14}
                  className={`opacity-0 group-hover:opacity-100 `}
                />
              </div>

              {/* We assume result.text contains the full verse. 
                                Ideally, you would highlight the search term here using a helper function 
                                or react-highlight-words */}
              <p className={`text-sm leading-relaxed`}>{result.text}</p>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
