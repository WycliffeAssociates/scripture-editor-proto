import {
    ActionIcon,
    Group,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from "@mantine/core";
import {
    CaseSensitive,
    ChevronLeft,
    ChevronRight,
    Search as IconSearch,
    Replace,
    ReplaceAll,
    WholeWord,
    X,
} from "lucide-react";
import { useState } from "react";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext";
import type { UseSearchReturn } from "@/app/ui/hooks/useSearch";

export function SearchPanel() {
    const { search } = useWorkspaceContext();

    if (!search.isSearchPaneOpen) return null;

    return (
        <aside className="w-full bg-gray-100  h-full grid grid-rows-[auto_1fr] overflow-hidden">
            <SearchControls search={search} />
            <SearchResults search={search} />
        </aside>
    );
}

function SearchControls({ search }: { search: UseSearchReturn }) {
    return (
        <div className="relative w-full bg-gray-200 p-2 border-b">
            <span className="absolute top-2 right-2">
                <ActionIcon
                    variant="subtle"
                    onClick={() => search.setIsSearchPaneOpen((o) => !o)}
                >
                    <X size={16} />
                </ActionIcon>
            </span>
            <Stack gap={4} className="">
                {/* Search bar */}
                <Group gap={4} align="center" wrap="nowrap">
                    <TextInput
                        value={search.searchTerm}
                        data-js="search-input"
                        onChange={(e) =>
                            search.setSearch(e.currentTarget.value)
                        }
                        onKeyDown={(e) =>
                            e.key === "Enter" && search.searchProject()
                        }
                        placeholder="Find"
                        leftSection={<IconSearch size={16} />}
                        rightSectionWidth={64}
                        rightSection={
                            <Group gap={2} align="center">
                                <Tooltip label="Match Case">
                                    <ActionIcon
                                        variant={
                                            search.matchCase
                                                ? "filled"
                                                : "subtle"
                                        }
                                        onClick={() =>
                                            search.setMatchCase((v) => !v)
                                        }
                                    >
                                        <CaseSensitive size={16} />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Match Whole Word">
                                    <ActionIcon
                                        variant={
                                            search.matchWholeWord
                                                ? "filled"
                                                : "subtle"
                                        }
                                        onClick={() =>
                                            search.setMatchWholeWord((v) => !v)
                                        }
                                    >
                                        <WholeWord size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        }
                        w={250}
                    />

                    <Group gap={2}>
                        <ActionIcon
                            onClick={search.prevMatch}
                            disabled={!search.hasPrev}
                            variant="subtle"
                        >
                            <ChevronLeft size={16} />
                        </ActionIcon>
                        <ActionIcon
                            onClick={search.nextMatch}
                            disabled={!search.hasNext}
                            variant="subtle"
                        >
                            <ChevronRight size={16} />
                        </ActionIcon>
                    </Group>
                </Group>

                {/* Replace bar */}
                <Group gap={4} align="center" wrap="nowrap">
                    <TextInput
                        value={search.replaceTerm}
                        onChange={(e) =>
                            search.setReplaceTerm(e.currentTarget.value)
                        }
                        placeholder="Replace"
                        leftSection={<Replace size={16} />}
                        w={250}
                    />

                    <Group gap={4}>
                        <Tooltip label="Replace">
                            <ActionIcon
                                onClick={search.replaceCurrentMatch}
                                variant="subtle"
                                disabled={!search.totalMatches}
                            >
                                <Replace size={16} />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label="Replace All in Chapter">
                            <ActionIcon
                                onClick={search.replaceAllInChapter}
                                variant="subtle"
                                disabled={!search.totalMatches}
                            >
                                <ReplaceAll size={16} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
                <Stack gap={4} align="start" mt="xs">
                    <Text size="sm" c="dimmed">
                        {search.totalMatches > 0
                            ? `${search.currentMatchIndex + 1} of ${
                                  search.totalMatches
                              } in this chapter`
                            : "No results in this chapter"}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {search.results.length} total results
                    </Text>
                </Stack>
            </Stack>
        </div>
    );
}
function SearchResults({ search }: { search: UseSearchReturn }) {
    if (search.searchTerm && !search.results?.length) {
        return <div>No results</div>;
    }
    if (!search.searchTerm) {
        return <div>Enter a search term to see results</div>;
    }
    return (
        <div className="overflow-y-auto">
            <ul className="p-2 flex flex-col gap-2">
                {search.results.map((result) => (
                    <li
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                search.pickSearchResult(result);
                            }
                        }}
                        className="text-xs flex flex-col gap-1"
                        key={result.sid}
                        onClick={() => search.pickSearchResult(result)}
                    >
                        <span className="font-bold">{result.sid}</span>
                        {result.text}
                    </li>
                ))}
            </ul>
        </div>
    );
}
