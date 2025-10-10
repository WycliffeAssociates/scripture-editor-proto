import {
  Accordion,
  ActionIcon,
  Button,
  Grid,
  Popover,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import {BookIcon, ChevronDownIcon} from "lucide-react";
import {useState} from "react";
import type {ParsedFile} from "@/app/data/parsedProject";
import {useProjectContext} from "@/app/ui/contexts/ProjectContext";
import referencePickerCss from "@/app/ui/styles/modules/ReferencePicker.module.css";
import {parseReference} from "@/core/data/bible/bible";

type Props = {
  // allFiles?: ParsedFile[];
  // currentFile?: string;
  // currentChapter?: number;
};

export function ReferencePicker() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const theme = useMantineTheme();
  const {allProjects, project, actions} = useProjectContext();
  const {currentFile, currentChapter, workingFiles, pickedFile} = project;

  // --- derived state
  const currentBook = pickedFile?.bibleIdentifier ?? "Select";
  const currentDisplay =
    currentChapter >= 0 ? `${currentBook} ${currentChapter}` : currentBook;

  // --- handlers
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allProjects.length) return;

    const ref = parseReference(search);
    if (!ref) return;

    const file = allProjects.find(
      (f) => f.name?.toLowerCase() === ref.book.toLowerCase()
    );
    if (file) {
      actions.switchBookOrChapter(
        file.path,
        ref.chapter ?? currentChapter ?? 1
      );
      // setSearch("");
      setOpen(false);
    }
  }

  return (
    <Popover
      opened={open}
      onChange={setOpen}
      width={280}
      withArrow
      shadow="md"
      position="bottom-start"
    >
      <Popover.Target>
        <Button
          onClick={() => setOpen((o) => !o)}
          variant="default"
          w={250}
          justify="space-between"
          leftSection={<BookIcon size={16} />}
          rightSection={<ChevronDownIcon size={16} />}
          classNames={{
            inner: referencePickerCss.triggerInner,
            label: referencePickerCss.triggerLabel,
          }}
        >
          {currentDisplay}
        </Button>
      </Popover.Target>

      <Popover.Dropdown p={0} className={referencePickerCss.dropdown}>
        <form onSubmit={handleSubmit}>
          <TextInput
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search (e.g. Mat 9, 1Co 1)"
            variant="unstyled"
            px="sm"
            py="xs"
            className={referencePickerCss.searchInput}
          />
        </form>

        <Accordion
          variant="default"
          classNames={{
            item: referencePickerCss.accordionItem,
            control: referencePickerCss.accordionControl,
            content: referencePickerCss.accordionContent,
          }}
        >
          {workingFiles.map((file) => {
            const fileTitle =
              file.title ||
              file.bibleIdentifier ||
              file.path.split("/").pop() ||
              "Unknown";

            return (
              <Accordion.Item key={file.path} value={fileTitle}>
                <Accordion.Control
                  className={
                    currentFile === file.path
                      ? referencePickerCss.activeBook
                      : undefined
                  }
                >
                  {fileTitle}
                </Accordion.Control>
                <Accordion.Panel>
                  <Grid gutter="xs" justify="flex-start">
                    {Object.keys(file.chapters)
                      .map(Number)
                      .sort((a, b) => a - b)
                      .map((chap) => (
                        <Grid.Col span="content" key={chap}>
                          <ActionIcon
                            variant={
                              chap === currentChapter ? "filled" : "subtle"
                            }
                            color={
                              chap === currentChapter
                                ? theme.primaryColor
                                : "gray"
                            }
                            size="lg"
                            onClick={() =>
                              actions.switchBookOrChapter(file.path, chap)
                            }
                          >
                            {chap}
                          </ActionIcon>
                        </Grid.Col>
                      ))}
                  </Grid>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      </Popover.Dropdown>
    </Popover>
  );
}
