import {
    Accordion,
    ActionIcon,
    Button,
    Grid,
    Popover,
    TextInput,
    useMantineTheme,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { BookIcon, ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspaceContext } from "@/app/ui/contexts/WorkspaceContext.tsx";
import referencePickerCss from "@/app/ui/styles/modules/ReferencePicker.module.css";
import { parseReference } from "@/core/data/bible/bible.ts";

export function ReferencePicker() {
    const [search, setSearch] = useState("");
    const [debouncedSearch] = useDebouncedValue(search, 200);

    const [open, setOpen] = useState(false);
    const theme = useMantineTheme();
    const { allProjects, project, actions } = useWorkspaceContext();
    const {
        currentFileBibleIdentifier,
        currentChapter,
        workingFiles,
        pickedFile,
    } = project;

    // --- derived state
    const currentBook = pickedFile?.bookCode ?? "Select";
    const currentDisplay =
        currentChapter >= 0 ? `${currentBook} ${currentChapter}` : currentBook;

    // --- handlers
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!allProjects.length) return;
        const ref = parseReference(search);
        if (!ref) return;

        // match one, a bible id matched fuzzily from above
        let file = ref.knownBookId
            ? workingFiles.find(
                  (f) =>
                      f.bookCode?.toLowerCase() ===
                      ref.knownBookId?.toLowerCase(),
              )
            : undefined;
        // match 2, a unique startsWith, whhich actuall takes priority from fuzzy in that we overwrite file here if we find
        const uniqueStartsWith = workingFiles.filter(
            (f) =>
                f.title
                    ?.toLocaleLowerCase()
                    .startsWith(ref.bookMatch.toLocaleLowerCase()) ||
                f.title
                    ?.toLocaleLowerCase()
                    .startsWith(ref.bookMatch.toLocaleLowerCase()),
        );
        if (uniqueStartsWith.length === 1) {
            file = uniqueStartsWith[0];
        }
        if (file) {
            actions.switchBookOrChapter(
                file.bookCode,
                ref.chapter ?? currentChapter ?? 1,
            );
            // setSearch("");
            setOpen(false);
        }
    }
    const uniqueFilesStartsWith = useMemo(() => {
        const ref = parseReference(debouncedSearch);
        if (!ref) return workingFiles;
        return workingFiles.filter(
            (f) =>
                f.title
                    ?.toLocaleLowerCase()
                    .startsWith(ref.bookMatch.toLocaleLowerCase()) ||
                f.title
                    ?.toLocaleLowerCase()
                    .startsWith(ref.bookMatch.toLocaleLowerCase()),
        );
    }, [workingFiles, debouncedSearch]);

    return (
        <Popover
            opened={open}
            onChange={setOpen}
            width={380}
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
                    {uniqueFilesStartsWith.map((file) => {
                        const fileTitle = file.title || file.bookCode;

                        return (
                            <Accordion.Item key={file.title} value={fileTitle}>
                                <Accordion.Control
                                    className={
                                        currentFileBibleIdentifier ===
                                        file.bookCode
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
                                                <Grid.Col
                                                    span="content"
                                                    key={chap}
                                                >
                                                    <ActionIcon
                                                        variant={
                                                            chap ===
                                                            currentChapter
                                                                ? "filled"
                                                                : "subtle"
                                                        }
                                                        color={
                                                            chap ===
                                                            currentChapter
                                                                ? theme.primaryColor
                                                                : "gray"
                                                        }
                                                        size="lg"
                                                        onClick={() =>
                                                            actions.switchBookOrChapter(
                                                                file.bookCode,
                                                                chap,
                                                            )
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
