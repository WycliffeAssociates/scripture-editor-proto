import { useLingui } from "@lingui/react/macro";
import {
    Accordion,
    Button,
    Grid,
    Popover,
    rem,
    TextInput,
    Tooltip,
    Transition,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { BookIcon, ChevronDownIcon, InfoIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { TEST_ID_GENERATORS, TESTING_IDS } from "@/app/data/constants.ts";
import { ActionIconSimple } from "@/app/ui/components/primitives/ActionIcon.tsx";
import { useWorkspaceMediaQuery } from "@/app/ui/contexts/MediaQuery.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as classes from "@/app/ui/styles/modules/ReferencePicker.css.ts";

type ReferencePickerFile = {
    title: string;
    bookCode: string;
    chapters: Array<{ chapNumber: number }>;
    _chaptersSorted: Array<{ chapNumber: number }>;
    _titleLower: string;
    _bookCodeLower: string;
};

type PickerScope = "main" | "reference";

type ReferencePickerProps = {
    scope?: PickerScope;
    bookCode?: string;
    chapter?: number;
    workingFiles?: Array<{
        title: string;
        bookCode: string;
        chapters: Array<{ chapNumber: number }>;
    }>;
    onSwitchBookOrChapter?: (bookCode: string, chapter: number) => void;
    onGoToReference?: (input: string) => boolean;
    disabled?: boolean;
};

export function ReferencePicker(props: ReferencePickerProps = {}) {
    const { t } = useLingui();
    const scope = props.scope ?? "main";
    const [search, setSearch] = useState("");
    const [debouncedSearch] = useDebouncedValue(search, 200);

    const [open, setOpen] = useState(false);
    const { project, actions } = useWorkspaceContext();

    const currentFileBibleIdentifier =
        props.bookCode ?? project.currentFileBibleIdentifier;
    const currentChapter = props.chapter ?? project.currentChapter;
    const workingFiles = props.workingFiles ?? project.workingFiles;
    const switchBookOrChapter =
        props.onSwitchBookOrChapter ?? actions.switchBookOrChapter;
    const goToReference = props.onGoToReference ?? actions.goToReference;

    const { isSm } = useWorkspaceMediaQuery();
    const handleTriggerMouseDown = (e: React.MouseEvent) => {
        if (props.disabled) return;
        e.preventDefault();
        setOpen((o) => !o);
    };

    const currentBook = currentFileBibleIdentifier ?? t`Select`;
    const currentDisplay =
        currentChapter >= 0
            ? `${currentBook} ${currentChapter === 0 ? t`Introduction` : currentChapter}`
            : currentBook;

    const filesWithSearchMeta = useMemo<ReferencePickerFile[]>(() => {
        return workingFiles.map((f) => ({
            ...f,
            _titleLower: f.title?.toLocaleLowerCase() ?? "",
            _bookCodeLower: f.bookCode?.toLocaleLowerCase() ?? "",
            _chaptersSorted: [...f.chapters].sort(
                (a, b) => a.chapNumber - b.chapNumber,
            ),
        }));
    }, [workingFiles]);

    const uniqueFilesStartsWith = useMemo(() => {
        const searchLower = debouncedSearch.toLocaleLowerCase();
        return filesWithSearchMeta.filter(
            (f) =>
                f._titleLower.startsWith(searchLower) ||
                f._bookCodeLower.startsWith(searchLower),
        );
    }, [filesWithSearchMeta, debouncedSearch]);

    const pickerTestId =
        scope === "reference"
            ? TESTING_IDS.reference.stickyPicker
            : TESTING_IDS.referencePicker;

    return (
        <Popover
            opened={open}
            onChange={setOpen}
            width={isSm ? rem(300) : rem(380)}
            withArrow
            shadow="md"
            position="bottom-start"
            data-testid={pickerTestId}
            data-test-book-code={currentFileBibleIdentifier}
            data-test-current-chapter={currentChapter}
        >
            <Popover.Target>
                {isSm ? (
                    <ActionIconSimple
                        aria-label={t`Open reference picker`}
                        title={currentDisplay}
                        onMouseDown={handleTriggerMouseDown}
                        disabled={props.disabled}
                    >
                        <BookIcon size={16} />
                    </ActionIconSimple>
                ) : (
                    <Button
                        onMouseDown={handleTriggerMouseDown}
                        variant="default"
                        className={classes.triggerButton}
                        leftSection={<BookIcon size={16} />}
                        rightSection={<ChevronDownIcon size={16} />}
                        classNames={{
                            inner: classes.triggerInner,
                            label: classes.triggerLabel,
                        }}
                        disabled={props.disabled}
                    >
                        {currentDisplay}
                    </Button>
                )}
            </Popover.Target>
            <Transition
                mounted={open}
                transition="fade"
                duration={50}
                timingFunction="ease"
            >
                {(transitionStyle) => (
                    <ReferencePickerDropdown
                        search={search}
                        setSearch={setSearch}
                        uniqueFilesStartsWith={uniqueFilesStartsWith}
                        currentFileBibleIdentifier={currentFileBibleIdentifier}
                        currentChapter={currentChapter}
                        switchBookOrChapter={switchBookOrChapter}
                        goToReference={goToReference}
                        setOpen={setOpen}
                        transitionStyle={transitionStyle}
                        disabled={props.disabled}
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
    switchBookOrChapter,
    goToReference,
    setOpen,
    transitionStyle,
    disabled,
}: {
    search: string;
    setSearch: (value: string) => void;
    uniqueFilesStartsWith: ReferencePickerFile[];
    currentFileBibleIdentifier: string;
    currentChapter: number;
    switchBookOrChapter: (bookCode: string, chapter: number) => void;
    goToReference: (input: string) => boolean;
    setOpen: (open: boolean) => void;
    transitionStyle: React.CSSProperties;
    disabled?: boolean;
}) {
    const [openBook, setOpenBook] = useState<string | null>(null);

    return (
        <Popover.Dropdown
            p={0}
            className={classes.dropdown}
            style={transitionStyle}
        >
            <ReferencePickerSearch
                search={search}
                setSearch={setSearch}
                goToReference={goToReference}
                setOpen={setOpen}
                disabled={disabled}
            />
            <div className={classes.booksScrollRegion}>
                <Accordion
                    variant="none"
                    value={openBook}
                    onChange={setOpenBook}
                    data-testid={TESTING_IDS.reference.booksAccordion}
                    classNames={{
                        item: classes.accordionItem,
                        control: classes.accordionControl,
                        content: classes.accordionContent,
                    }}
                >
                    {uniqueFilesStartsWith.map((file) => (
                        <BookAccordionItem
                            key={file.bookCode}
                            file={file}
                            currentFileBibleIdentifier={
                                currentFileBibleIdentifier
                            }
                            currentChapter={currentChapter}
                            switchBookOrChapter={switchBookOrChapter}
                            setOpen={setOpen}
                            isOpen={openBook === (file.title || file.bookCode)}
                            disabled={disabled}
                        />
                    ))}
                </Accordion>
            </div>
        </Popover.Dropdown>
    );
}

function ReferencePickerSearch({
    search,
    setSearch,
    goToReference,
    setOpen,
    disabled,
}: {
    search: string;
    setSearch: (value: string) => void;
    goToReference: (input: string) => boolean;
    setOpen: (open: boolean) => void;
    disabled?: boolean;
}) {
    const { t } = useLingui();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (disabled) return;
        const success = goToReference(search);
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
                disabled={disabled}
            />
        </form>
    );
}

function BookAccordionItem({
    file,
    currentFileBibleIdentifier,
    currentChapter,
    switchBookOrChapter,
    setOpen,
    isOpen,
    disabled,
}: {
    file: ReferencePickerFile;
    currentFileBibleIdentifier: string;
    currentChapter: number;
    switchBookOrChapter: (bookCode: string, chapter: number) => void;
    setOpen: (open: boolean) => void;
    isOpen: boolean;
    disabled?: boolean;
}) {
    const { t } = useLingui();
    const fileTitle = file.title || file.bookCode;
    const isCurrentBook = currentFileBibleIdentifier === file.bookCode;

    return (
        <Accordion.Item key={file.bookCode} value={fileTitle}>
            <Accordion.Control
                data-testid={TESTING_IDS.reference.bookControl}
                className={
                    isCurrentBook ? classes.activeBookControl : undefined
                }
                disabled={disabled}
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
                {isOpen ? (
                    <Grid gutter="xs" justify="flex-start">
                        {file._chaptersSorted.map((chap) => (
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
                                        chap.chapNumber === currentChapter &&
                                        isCurrentBook
                                            ? "filled"
                                            : "subtle"
                                    }
                                    className={
                                        chap.chapNumber === currentChapter &&
                                        isCurrentBook
                                            ? classes.activeChapter
                                            : undefined
                                    }
                                    style={{ width: "3rem", height: "3rem" }}
                                    disabled={disabled}
                                    onClick={() => {
                                        switchBookOrChapter(
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
                ) : null}
            </Accordion.Panel>
        </Accordion.Item>
    );
}
