import { useLingui } from "@lingui/react/macro";
import {
    Accordion,
    Button,
    Grid,
    Popover,
    rem,
    ScrollArea,
    TextInput,
    Tooltip,
    Transition,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { BookIcon, ChevronDownIcon, InfoIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
// Internal Imports
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
// Styles
import * as classes from "@/app/ui/styles/modules/ReferencePicker.css.ts";
import { parseReference } from "@/core/data/bible/bible.ts";

export function ReferencePicker() {
    const { t } = useLingui();
    const [search, setSearch] = useState("");
    const [debouncedSearch] = useDebouncedValue(search, 200);

    const [open, setOpen] = useState(false);
    const { allProjects, project, actions } = useWorkspaceContext();
    const {
        currentFileBibleIdentifier,
        currentChapter,
        workingFiles,
        pickedFile,
    } = project;
    const { isSm } = useWorkspaceMediaQuery();

    // --- derived state
    const currentBook = pickedFile?.bookCode ?? t`Select`;
    const currentDisplay =
        currentChapter >= 0
            ? `${currentBook} ${currentChapter === 0 ? t`Introduction` : currentChapter}`
            : currentBook;

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

        // match 2, a unique startsWith
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
            setOpen(false);
        }
    }

    const uniqueFilesStartsWith = useMemo(() => {
        return workingFiles.filter(
            (f) =>
                f.title
                    ?.toLocaleLowerCase()
                    .startsWith(debouncedSearch.toLocaleLowerCase()) ||
                f.bookCode
                    ?.toLocaleLowerCase()
                    .startsWith(debouncedSearch.toLocaleLowerCase()),
        );
    }, [workingFiles, debouncedSearch]);

    return (
        <Popover
            opened={open}
            onChange={setOpen}
            width={isSm ? rem(300) : rem(380)}
            withArrow
            shadow="md"
            position="bottom-start"
            data-testid={TESTING_IDS.referencePicker}
            data-test-book-code={pickedFile?.bookCode}
            data-test-current-chapter={currentChapter}
        >
            <Popover.Target>
                {isSm ? (
                    <ActionIconSimple
                        aria-label={t`Open reference picker`}
                        title={currentDisplay}
                        onClick={() => setOpen((o) => !o)}
                    >
                        <BookIcon size={16} />
                    </ActionIconSimple>
                ) : (
                    <Button
                        onClick={() => setOpen((o) => !o)}
                        variant="default"
                        className={classes.triggerButton}
                        leftSection={<BookIcon size={16} />}
                        rightSection={<ChevronDownIcon size={16} />}
                        classNames={{
                            inner: classes.triggerInner,
                            label: classes.triggerLabel,
                        }}
                    >
                        {currentDisplay}
                    </Button>
                )}
            </Popover.Target>
            <Transition
                mounted={open}
                transition="fade"
                duration={100}
                timingFunction="ease"
            >
                {(transitionStyle) => (
                    <Popover.Dropdown
                        p={0}
                        className={classes.dropdown}
                        style={transitionStyle}
                    >
                        <form onSubmit={handleSubmit}>
                            <TextInput
                                autoFocus
                                value={search}
                                data-testid={
                                    TESTING_IDS.reference.pickerSearchInput
                                }
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t`Search (e.g. Mat 9, 1Co 1)`}
                                variant="unstyled"
                                px="sm"
                                py="xs"
                                className={classes.searchInput}
                            />
                        </form>
                        <ScrollArea style={{ flex: 1 }}>
                            <Accordion
                                variant="none"
                                data-testid={
                                    TESTING_IDS.reference.booksAccordion
                                }
                                classNames={{
                                    item: classes.accordionItem,
                                    control: classes.accordionControl,
                                    content: classes.accordionContent,
                                }}
                            >
                                {uniqueFilesStartsWith.map((file) => {
                                    const fileTitle =
                                        file.title || file.bookCode;

                                    const isCurrentBook =
                                        currentFileBibleIdentifier ===
                                        file.bookCode;

                                    return (
                                        <Accordion.Item
                                            key={file.title}
                                            value={fileTitle}
                                        >
                                            <Accordion.Control
                                                data-testid={
                                                    TESTING_IDS.reference
                                                        .bookControl
                                                }
                                                className={
                                                    isCurrentBook
                                                        ? classes.activeBookControl
                                                        : undefined
                                                }
                                            >
                                                <span
                                                    data-test-id-specific={TEST_ID_GENERATORS.bookTitle(
                                                        file.bookCode,
                                                    )}
                                                >
                                                    {fileTitle}
                                                </span>
                                            </Accordion.Control>
                                            <Accordion.Panel
                                                data-testid={TEST_ID_GENERATORS.bookChapterPanel(
                                                    file.bookCode,
                                                )}
                                            >
                                                <Grid
                                                    gutter="xs"
                                                    justify="flex-start"
                                                >
                                                    {Object.keys(file.chapters)
                                                        .map(Number)
                                                        .sort((a, b) => a - b)
                                                        .map((chap) => (
                                                            <Grid.Col
                                                                span="content"
                                                                key={chap}
                                                            >
                                                                <Button
                                                                    size="xs"
                                                                    data-testid={
                                                                        TESTING_IDS
                                                                            .reference
                                                                            .chapterAccordionButton
                                                                    }
                                                                    data-test-id-specific={TEST_ID_GENERATORS.bookChapterBtn(
                                                                        file.bookCode,
                                                                        chap,
                                                                    )}
                                                                    variant={
                                                                        chap ===
                                                                        currentChapter
                                                                            ? "filled"
                                                                            : "subtle"
                                                                    }
                                                                    // Keeping mantine color logic here as it interfaces
                                                                    // directly with the ActionIcon's internal theme lookup
                                                                    className={
                                                                        chap ===
                                                                        currentChapter
                                                                            ? classes.activeChapter
                                                                            : undefined
                                                                    }
                                                                    style={{
                                                                        width: "3rem",
                                                                        height: "3rem",
                                                                    }}
                                                                    onClick={() => {
                                                                        actions.switchBookOrChapter(
                                                                            file.bookCode,
                                                                            chap,
                                                                        );
                                                                        // close the popover
                                                                        setOpen(
                                                                            false,
                                                                        );
                                                                    }}
                                                                >
                                                                    {chap ===
                                                                    0 ? (
                                                                        <Tooltip
                                                                            label={t`This is introductory material for this book`}
                                                                        >
                                                                            <InfoIcon
                                                                                size={
                                                                                    16
                                                                                }
                                                                            />
                                                                        </Tooltip>
                                                                    ) : (
                                                                        chap
                                                                    )}
                                                                </Button>
                                                            </Grid.Col>
                                                        ))}
                                                </Grid>
                                            </Accordion.Panel>
                                        </Accordion.Item>
                                    );
                                })}
                            </Accordion>
                        </ScrollArea>
                    </Popover.Dropdown>
                )}
            </Transition>
        </Popover>
    );
}
