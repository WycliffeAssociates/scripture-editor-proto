import { useLingui } from "@lingui/react/macro";
import { ActionIcon, Popover, Tooltip } from "@mantine/core";
import { Search as IconSearch } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { SearchPopoverControls } from "@/app/ui/components/blocks/Search.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function SearchInput() {
    const { search } = useWorkspaceContext();
    const { t } = useLingui();
    return (
        <Popover
            opened={search.isSearchPaneOpen}
            onChange={(opened) => search.setIsSearchPaneOpen(opened)}
            position="bottom-end"
            withArrow
            shadow="lg"
            offset={8}
            closeOnClickOutside={false}
            floatingStrategy="fixed"
            middlewares={{ flip: false, shift: false }}
        >
            <Popover.Target>
                <Tooltip label={t`Search`} withArrow position="top">
                    <ActionIcon
                        variant={search.isSearchPaneOpen ? "filled" : "subtle"}
                        color={search.isSearchPaneOpen ? "dark" : "gray"}
                        data-testid={TESTING_IDS.searchTrigger}
                        aria-label={t`Search`}
                        onClick={() => {
                            search.setIsSearchPaneOpen((o) => !o);
                            setTimeout(() => {
                                const input = document.querySelector(
                                    'input[data-js="search-input"]',
                                ) as HTMLInputElement;
                                if (input) {
                                    input.focus();
                                }
                            }, 50);
                        }}
                    >
                        <IconSearch size={16} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <SearchPopoverControls />
        </Popover>
    );
}
