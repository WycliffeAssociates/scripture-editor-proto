import { ActionIcon } from "@mantine/core";
import { Search as IconSearch } from "lucide-react";
import { TESTING_IDS } from "@/app/data/constants.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";

export function SearchInput() {
    const { search } = useWorkspaceContext();
    return (
        <ActionIcon
            variant="subtle"
            data-testid={TESTING_IDS.searchTrigger}
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
    );
}
