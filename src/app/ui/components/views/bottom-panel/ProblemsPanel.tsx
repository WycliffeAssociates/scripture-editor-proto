import { Menu } from "@base-ui/react/menu";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronDown, Filter } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as buttonStyles from "@/app/ui/components/primitives/Button/button.css.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/Projectview.css.ts";
import { parseSid, sortListByBookCanonical } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type FilterOption = { value: string; label: string };
const lintIssueBookCodeCache = new Map<string, string>();

export function ProblemsPanelContent() {
    const { actions, bookCodeToProjectLocalizedTitle, lint } =
        useWorkspaceContext();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
    const [selectedBooks, setSelectedBooks] = useState<string[]>([]);

    const codeOptions = useMemo(
        () => buildLintCodeOptions(lint.allIssues),
        [lint.allIssues],
    );
    const bookOptions = useMemo(
        () =>
            buildLintBookOptions(
                lint.allIssues,
                bookCodeToProjectLocalizedTitle,
            ),
        [bookCodeToProjectLocalizedTitle, lint.allIssues],
    );

    useEffect(() => {
        const allCodes = codeOptions
            .filter((option) => option.value !== "all")
            .map((option) => option.value);
        setSelectedCodes((current) => {
            if (!current.length) return allCodes;
            const next = current.filter((code) => allCodes.includes(code));
            return next.length ? next : allCodes;
        });
    }, [codeOptions]);

    useEffect(() => {
        const allBooks = bookOptions
            .filter((option) => option.value !== "all")
            .map((option) => option.value);
        setSelectedBooks((current) => {
            if (!current.length) return allBooks;
            const next = current.filter((book) => allBooks.includes(book));
            return next.length ? next : allBooks;
        });
    }, [bookOptions]);

    const filteredIssues = useMemo(
        () =>
            lint.allIssues.filter((issue) => {
                const matchesCode =
                    selectedCodes.length === codeOptions.length - 1 ||
                    selectedCodes.includes(issue.code);
                const matchesBook =
                    selectedBooks.length === bookOptions.length - 1 ||
                    selectedBooks.includes(getLintIssueBookCode(issue));
                return matchesCode && matchesBook;
            }),
        [
            bookOptions.length,
            codeOptions.length,
            lint.allIssues,
            selectedBooks,
            selectedCodes,
        ],
    );

    const virtualizer = useVirtualizer({
        count: filteredIssues.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => 40,
        overscan: 10,
        measureElement: (element) => element.getBoundingClientRect().height,
        getItemKey: (index) => lintIssueRowKey(filteredIssues[index], index),
    });

    useEffect(() => {
        virtualizer.measure();
    }, [virtualizer]);

    const codeSummary = summarizeSelection(selectedCodes, codeOptions);
    const bookSummary = summarizeSelection(selectedBooks, bookOptions);

    const toggleCode = (code: string) => {
        setSelectedCodes((current) =>
            toggleSelection(current, codeOptions, code),
        );
    };

    const toggleBook = (bookCode: string) => {
        setSelectedBooks((current) =>
            toggleSelection(current, bookOptions, bookCode),
        );
    };

    if (!lint.allIssues.length) {
        return (
            <div className={styles.bottomPanelContent}>
                <div className={styles.bottomPanelEmptyState}>
                    No lint issues right now.
                </div>
            </div>
        );
    }

    return (
        <div className={styles.bottomPanelContent}>
            <div className={styles.lintFilterRibbon}>
                <LintFilterMenu
                    label="Filter"
                    options={codeOptions}
                    activeValues={selectedCodes}
                    summary={codeSummary}
                    onToggle={toggleCode}
                />
                <LintFilterMenu
                    label="Books"
                    options={bookOptions}
                    activeValues={selectedBooks}
                    summary={bookSummary}
                    onToggle={toggleBook}
                />
            </div>

            {!filteredIssues.length ? (
                <div className={styles.bottomPanelEmptyState}>
                    No lint issues match this filter.
                </div>
            ) : (
                <ScrollArea.Root className={styles.lintIssuesScrollArea}>
                    <ScrollArea.Viewport
                        ref={scrollContainerRef}
                        className={styles.lintIssuesViewport}
                    >
                        <ScrollArea.Content
                            className={styles.lintIssueVirtualInner}
                            style={{
                                height: `${virtualizer.getTotalSize()}px`,
                            }}
                        >
                            {virtualizer.getVirtualItems().map((virtualRow) => {
                                const issue = filteredIssues[virtualRow.index];
                                if (!issue) return null;

                                return (
                                    <div
                                        key={lintIssueRowKey(
                                            issue,
                                            virtualRow.index,
                                        )}
                                        ref={virtualizer.measureElement}
                                        data-index={virtualRow.index}
                                        className={styles.lintIssueVirtualRow}
                                        style={{
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        <LintIssueRow
                                            issue={issue}
                                            localizedBookName={
                                                bookCodeToProjectLocalizedTitle(
                                                    {
                                                        bookCode:
                                                            getLintIssueBookCode(
                                                                issue,
                                                            ),
                                                    },
                                                ) || getLintIssueBookCode(issue)
                                            }
                                            onFixIssue={actions.fixLintError}
                                            onOpenIssue={(bookCode, chapter) =>
                                                actions.switchBookOrChapter(
                                                    bookCode,
                                                    chapter,
                                                )
                                            }
                                        />
                                    </div>
                                );
                            })}
                        </ScrollArea.Content>
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar
                        className={styles.lintListScrollbar}
                        keepMounted={true}
                    >
                        <ScrollArea.Thumb
                            className={styles.lintScrollbarThumb}
                        />
                    </ScrollArea.Scrollbar>
                </ScrollArea.Root>
            )}
        </div>
    );
}

function LintFilterMenu(props: {
    label: string;
    options: FilterOption[];
    activeValues: string[];
    summary: string;
    onToggle: (value: string) => void;
}) {
    const triggerClassName = [
        buttonStyles.buttonBase,
        buttonStyles.buttonVariants.secondary,
        buttonStyles.buttonSizes.xs,
        styles.lintFilterTrigger,
    ].join(" ");

    return (
        <Menu.Root>
            <Menu.Trigger className={triggerClassName}>
                <span className={styles.lintFilterTriggerLabel}>
                    <Filter size={14} />
                    {props.label}
                </span>
                <span className={styles.lintFilterTriggerValue}>
                    {props.summary}
                </span>
                <ChevronDown size={14} />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    alignOffset={0}
                    className={styles.lintFilterMenuPositioner}
                >
                    <Menu.Popup className={styles.lintFilterMenuPopup}>
                        <div className={styles.lintFilterMenuList}>
                            {props.options.map((option) => {
                                const checked =
                                    option.value === "all"
                                        ? props.activeValues.length ===
                                          props.options.length - 1
                                        : props.activeValues.includes(
                                              option.value,
                                          );
                                return (
                                    <Menu.CheckboxItem
                                        key={option.value}
                                        className={styles.lintFilterMenuItem}
                                        checked={checked}
                                        onCheckedChange={() =>
                                            props.onToggle(option.value)
                                        }
                                    >
                                        <span
                                            className={
                                                styles.lintFilterMenuIndicator
                                            }
                                            aria-hidden="true"
                                        >
                                            {checked ? (
                                                <Check size={14} />
                                            ) : null}
                                        </span>
                                        <span>{option.label}</span>
                                    </Menu.CheckboxItem>
                                );
                            })}
                        </div>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

function LintIssueRow(props: {
    issue: LintIssue;
    localizedBookName: string;
    onFixIssue: (issue: LintIssue) => void;
    onOpenIssue: (bookCode: string, chapter: number) => void;
}) {
    const { project, actions } = useWorkspaceContext();
    const parsed = props.issue.sid ? parseSid(props.issue.sid) : null;
    const locationLabel = parsed
        ? `${props.localizedBookName} ${parsed.chapter}${parsed.isBookChapOnly ? "" : `:${parsed.verseStart}${parsed.verseStart !== parsed.verseEnd ? `-${parsed.verseEnd}` : ""}`}`
        : props.localizedBookName;

    const handleNavigate = () => {
        if (!props.issue.sid) return;
        const sidParsed = parseSid(props.issue.sid);
        if (!sidParsed) return;

        const currentBook = project.pickedFile.bookCode;
        const currentChapter =
            project.pickedChapter?.chapterNumber ?? project.currentChapter;

        if (
            sidParsed.book === currentBook &&
            sidParsed.chapter === currentChapter
        ) {
            const tokenId = props.issue.tokenId ?? props.issue.relatedTokenId;
            if (tokenId) {
                const el = document.querySelector(
                    `[data-id="${tokenId}"]`,
                ) as HTMLElement | null;
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("selected");
                }
            }
        } else {
            actions.switchBookOrChapter(sidParsed.book, sidParsed.chapter);
            const tokenId = props.issue.tokenId ?? props.issue.relatedTokenId;
            if (tokenId) {
                const tryScroll = () => {
                    const el = document.querySelector(
                        `[data-id="${tokenId}"]`,
                    ) as HTMLElement | null;
                    if (el) {
                        el.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                        });
                        el.classList.add("selected");
                        return true;
                    }
                    return false;
                };
                let attempts = 0;
                const maxAttempts = 50;
                const interval = setInterval(() => {
                    attempts++;
                    if (tryScroll() || attempts >= maxAttempts) {
                        clearInterval(interval);
                    }
                }, 100);
            }
        }
    };

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: <todo fix>
        <div
            className={styles.lintIssueCard}
            data-token-id={
                props.issue.tokenId ?? props.issue.relatedTokenId ?? undefined
            }
            data-sid={props.issue.sid ?? undefined}
            onClick={handleNavigate}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    handleNavigate();
                }
            }}
            style={{ cursor: "pointer" }}
        >
            <div className={styles.lintIssueInline}>
                <span className={styles.lintIssueLocation}>
                    {locationLabel}
                </span>
                <span className={styles.lintIssueMessage}>
                    {props.issue.message}
                </span>
            </div>
            <div className={styles.lintIssueActions}>
                {parsed ? (
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            props.onOpenIssue(parsed.book, parsed.chapter);
                        }}
                    >
                        Open
                    </Button>
                ) : null}
                {props.issue.fix ? (
                    <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            props.onFixIssue(props.issue);
                        }}
                    >
                        Fix
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

function toggleSelection(
    current: string[],
    options: FilterOption[],
    value: string,
) {
    const allValues = options
        .filter((option) => option.value !== "all")
        .map((option) => option.value);
    if (value === "all") {
        return current.length === allValues.length ? [] : allValues;
    }
    return current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
}

function summarizeSelection(selected: string[], options: FilterOption[]) {
    const allCount = options.length - 1;
    if (selected.length === allCount) return "All";
    if (selected.length === 0) return "None";
    return `${selected.length}`;
}

function lintIssueRowKey(issue: LintIssue | undefined, index: number) {
    if (!issue) return `missing:${index}`;
    return [
        issue.code,
        issue.sid ?? "unknown",
        issue.tokenId ?? "",
        issue.relatedTokenId ?? "",
        issue.message,
        issue.severity,
        index,
    ].join(":");
}

function buildLintCodeOptions(messages: LintIssue[]) {
    const uniqueCodes = Array.from(
        new Set(messages.map((issue) => issue.code).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));

    return [
        { value: "all", label: "All" },
        ...uniqueCodes.map((code) => ({
            value: code,
            label: formatLintCodeLabel(code),
        })),
    ];
}

function buildLintBookOptions(
    messages: LintIssue[],
    localizeBook: (input: { bookCode: string }) => string,
) {
    const uniqueBooks = Array.from(
        new Set(messages.map((issue) => getLintIssueBookCode(issue))),
    );
    const canonicalBooks = sortListByBookCanonical(uniqueBooks, (book) => book);

    return [
        { value: "all", label: "All" },
        ...canonicalBooks.map((bookCode) => ({
            value: bookCode,
            label: localizeBook({ bookCode }) || bookCode,
        })),
    ];
}

function formatLintCodeLabel(code: string) {
    const words = code.replace(/[-_]/g, " ").trim();
    return words ? words[0].toUpperCase() + words.slice(1) : code;
}

function getLintIssueBookCode(issue: LintIssue) {
    const sid = issue.sid ?? "";
    if (lintIssueBookCodeCache.has(sid)) {
        return lintIssueBookCodeCache.get(sid) ?? "UNKNOWN";
    }

    const bookCode = (sid ? parseSid(sid)?.book : null) ?? "UNKNOWN";
    lintIssueBookCodeCache.set(sid, bookCode);
    return bookCode;
}
