import {Button, Group, Stack, Text, TextInput} from "@mantine/core";
import {
  ChevronLeft,
  ChevronRight,
  Search as IconSearch,
  Replace,
  ReplaceAll,
} from "lucide-react";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";

export function SearchInput() {
  const {search} = useProjectContext();
  const {
    searchTerm,
    setSearch,
    replaceTerm,
    setReplaceTerm,
    searchProject,
    nextMatch,
    prevMatch,
    replaceCurrentMatch,
    replaceAllInChapter,
    currentMatchIndex,
    totalMatches,
    hasNext,
    hasPrev,
  } = search;
  // debugger;
  return (
    <Stack gap="xs">
      <Group gap="xs" display="flex" align="center">
        <TextInput
          placeholder="Search (e.g. grace, Matthew 5)"
          value={searchTerm}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          w={250}
          onKeyDown={(e) => {
            if (e.key === "Enter") searchProject();
          }}
        />
        <Button onClick={searchProject} variant="filled">
          Search
        </Button>
      </Group>

      {totalMatches > 0 && (
        <Stack gap="xs">
          <Group gap="xs" align="center">
            <TextInput
              placeholder="Replace with..."
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.currentTarget.value)}
              w={250}
            />
            <Button
              onClick={replaceCurrentMatch}
              variant="light"
              leftSection={<Replace size={16} />}
            >
              Replace
            </Button>
            <Button
              onClick={replaceAllInChapter}
              variant="light"
              leftSection={<ReplaceAll size={16} />}
            >
              Replace All in Chapter
            </Button>
          </Group>

          <Group gap="xs" align="center">
            <Button
              onClick={prevMatch}
              disabled={!hasPrev}
              variant="subtle"
              size="sm"
              leftSection={<ChevronLeft size={16} />}
            >
              Previous
            </Button>
            <Text size="sm">
              {currentMatchIndex + 1} of {totalMatches}
            </Text>
            <Button
              onClick={nextMatch}
              disabled={!hasNext}
              variant="subtle"
              size="sm"
              rightSection={<ChevronRight size={16} />}
            >
              Next
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
