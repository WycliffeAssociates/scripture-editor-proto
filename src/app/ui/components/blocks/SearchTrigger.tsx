import { ActionIcon } from "@mantine/core";
import { Search as IconSearch } from "lucide-react";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";

export function SearchInput() {
  const { search } = useWorkspaceContext();
  return (
    <ActionIcon
      variant="subtle"
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
