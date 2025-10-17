import {
  ActionIcon,
  Button,
  Group,
  Popover,
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
} from "lucide-react";
import {useState} from "react";
import {useWorkspaceContext} from "@/app/ui/contexts/WorkspaceContext";

export function SearchInput() {
  const {search} = useWorkspaceContext();
  return (
    <ActionIcon
      variant="subtle"
      onClick={() => {
        search.setIsSearchPaneOpen((o) => !o);
        setTimeout(() => {
          const input = document.querySelector(
            'input[data-js="search-input"]'
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
