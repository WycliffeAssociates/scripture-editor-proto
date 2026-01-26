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

export function ReferencePicker() {
    const { t } = useLingui();
    const [search, setSearch] = useState("");
    const [debouncedSearch] = useDebouncedValue(search, 200);

    const [open, setOpen] = useState(false);
    const { project, actions } = useWorkspaceContext();
    const {
        currentFileBibleIdentifier,
        currentChapter,
        workingFiles,
        pickedFile,
    } = project;
    const { isSm } = useWorkspaceMediaQuery();

    const currentBook = pickedFile?.bookCode ?? t`Select`;
    const currentDisplay =
        currentChapter >= 0
            ? `${currentBook} ${currentChapter === 0 ? t`Introduction` : currentChapter}`
            : currentBook;

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
                    <ReferencePickerDropdown
                        search={search}
                        setSearch={setSearch}
                        uniqueFilesStartsWith={uniqueFilesStartsWith}
                        currentFileBibleIdentifier={currentFileBibleIdentifier}
                        currentChapter={currentChapter}
                        actions={actions}
                        setOpen={setOpen}
                        transitionStyle={transitionStyle}
                    />
                )}
            </Transition>
        </Popover>
    );
}

function ReferencePickerDropdown({
    search,
    setSearch,
    uniqueFilesStartsWith,
    currentFileBibleIdentifier,
    currentChapter,
    actions,
    setOpen,
    transitionStyle,
}: {
    search: string;
    setSearch: (value: string) => void;
    uniqueFilesStartsWith: Array<{
        title: string;
        bookCode: string;
        chapters: Array<{ chapNumber: number }>;
    }>;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    actions: {
        switchBookOrChapter: (bookCode: string, chapter: number) => void;
        goToReference: (input: string) => boolean;
    };
    setOpen: (open: boolean) => void;
    transitionStyle: React.CSSProperties;
}) {
    return (
        <Popover.Dropdown
            p={0}
            className={classes.dropdown}
            style={transitionStyle}
        >
            <ReferencePickerSearch
                search={search}
                setSearch={setSearch}
                actions={actions}
                setOpen={setOpen}
            />
            <ScrollArea style={{ flex: 1 }}>
                <Accordion
                    variant="none"
                    data-testid={TESTING_IDS.reference.booksAccordion}
                    classNames={{
                        item: classes.accordionItem,
                        control: classes.accordionControl,
                        content: classes.accordionContent,
                    }}
                >
                    {uniqueFilesStartsWith.map((file) => (
                        <BookAccordionItem
                            key={file.title}
                            file={file}
                            currentFileBibleIdentifier={
                                currentFileBibleIdentifier
                            }
                            currentChapter={currentChapter}
                            actions={actions}
                            setOpen={setOpen}
                        />
                    ))}
                </Accordion>
            </ScrollArea>
        </Popover.Dropdown>
    );
}

function ReferencePickerSearch({
    search,
    setSearch,
    actions,
    setOpen,
}: {
    search: string;
    setSearch: (value: string) => void;
    actions: {
        goToReference: (input: string) => boolean;
    };
    setOpen: (open: boolean) => void;
}) {
    const { t } = useLingui();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const success = actions.goToReference(search);
        if (success) {
            setOpen(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <TextInput
                autoFocus
                value={search}
                data-testid={TESTING_IDS.reference.pickerSearchInput}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t`Search (e.g. Mat 9, 1Co 1)`}
                variant="unstyled"
                px="sm"
                py="xs"
                className={classes.searchInput}
            />
        </form>
    );
}

function BookAccordionItem({
    file,
    currentFileBibleIdentifier,
    currentChapter,
    actions,
    setOpen,
}: {
    file: {
        title: string;
        bookCode: string;
        chapters: Array<{ chapNumber: number }>;
    };
    currentFileBibleIdentifier: string;
    currentChapter: number;
    actions: {
        switchBookOrChapter: (bookCode: string, chapter: number) => void;
        goToReference: (input: string) => boolean;
    };
    setOpen: (open: boolean) => void;
}) {
    const { t } = useLingui();
    const fileTitle = file.title || file.bookCode;
    const isCurrentBook = currentFileBibleIdentifier === file.bookCode;

    return (
        <Accordion.Item key={file.title} value={fileTitle}>
            <Accordion.Control
                data-testid={TESTING_IDS.reference.bookControl}
                className={
                    isCurrentBook ? classes.activeBookControl : undefined
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
                data-testid={TEST_ID_GENERATORS.bookChapterPanel(file.bookCode)}
            >
                <Grid gutter="xs" justify="flex-start">
                    {file.chapters
                        .sort((a, b) => a.chapNumber - b.chapNumber)
                        .map((chap) => (
                            <Grid.Col span="content" key={chap.chapNumber}>
                                <Button
                                    size="xs"
                                    data-testid={
                                        TESTING_IDS.reference
                                            .chapterAccordionButton
                                    }
                                    data-test-id-specific={TEST_ID_GENERATORS.bookChapterBtn(
                                        file.bookCode,
                                        chap.chapNumber,
                                    )}
                                    variant={
                                        chap.chapNumber === currentChapter
                                            ? "filled"
                                            : "subtle"
                                    }
                                    className={
                                        chap.chapNumber === currentChapter
                                            ? classes.activeChapter
                                            : undefined
                                    }
                                    style={{ width: "3rem", height: "3rem" }}
                                    onClick={() => {
                                        actions.switchBookOrChapter(
                                            file.bookCode,
                                            chap.chapNumber,
                                        );
                                        setOpen(false);
                                    }}
                                >
                                    {chap.chapNumber === 0 ? (
                                        <Tooltip
                                            label={t`This is introductory material for this book`}
                                        >
                                            <InfoIcon size={16} />
                                        </Tooltip>
                                    ) : (
                                        chap.chapNumber
                                    )}
                                </Button>
                            </Grid.Col>
                        ))}
                </Grid>
            </Accordion.Panel>
        </Accordion.Item>
    );
}
