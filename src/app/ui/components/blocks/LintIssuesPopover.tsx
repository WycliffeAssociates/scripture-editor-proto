import { Menu } from "@base-ui/react/menu";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    AlertCircle,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Filter,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ALL_FILTER_VALUE,
    buildLintBookOptions,
    buildLintCodeOptions,
    getLintIssueBookCode,
    type LintFilterLabels,
    LintFilterMenu,
    summarizeSelection,
    toggleSelection,
} from "@/app/ui/components/blocks/lintFilters.tsx";
import * as buttonStyles from "@/app/ui/components/primitives/Button/button.css.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/LintIssuesPopover.css.ts";
import * as projectViewStyles from "@/app/ui/styles/modules/Projectview.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import { parseSid, sortListByBookCanonical } from "@/core/data/bible/bible.ts";
import type { LintIssue } from "@/core/domain/usfm/usfmOnionTypes.ts";

type Scope = "local" | "all";
type IssueTypeFilter = "all" | "usfm" | "content";

function joinClassNames(...names: Array<string | false | undefined>) {
    return names.filter(Boolean).join(" ");
}

export function LintIssuesPopover() {
    const { t } = useLingui();
    const { actions, bookCodeToProjectLocalizedTitle, lint, project } =
        useWorkspaceContext();

    const [opened, setOpened] = useState(false);
    const [scope, setScope] = useState<Scope>("local");
    const [issueTypeFilter, setIssueTypeFilter] =
        useState<IssueTypeFilter>("content");
    const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
    const [selectedBooks, setSelectedBooks] = useState<string[]>([]);

    const typeFilteredAllIssues = useMemo(
        () =>
            issueTypeFilter === "all"
                ? lint.allIssues
                : lint.allIssues.filter(
                      (issue) => issue.issueType === issueTypeFilter,
                  ),
        [lint.allIssues, issueTypeFilter],
    );

    const filterLabels: LintFilterLabels = useMemo(
        () => ({ all: t`All`, none: t`None` }),
        [t],
    );

    const codeOptions = useMemo(
        () => buildLintCodeOptions(typeFilteredAllIssues, filterLabels),
        [typeFilteredAllIssues, filterLabels],
    );
    const bookOptions = useMemo(
        () =>
            buildLintBookOptions(
                typeFilteredAllIssues,
                bookCodeToProjectLocalizedTitle,
                filterLabels,
            ),
        [bookCodeToProjectLocalizedTitle, typeFilteredAllIssues, filterLabels],
    );

    useEffect(() => {
        const allCodes = codeOptions
            .filter((option) => option.value !== ALL_FILTER_VALUE)
            .map((option) => option.value);
        setSelectedCodes((current) => {
            if (!current.length) return allCodes;
            const next = current.filter((code) => allCodes.includes(code));
            return next.length ? next : allCodes;
        });
    }, [codeOptions]);

    useEffect(() => {
        const allBooks = bookOptions
            .filter((option) => option.value !== ALL_FILTER_VALUE)
            .map((option) => option.value);
        setSelectedBooks((current) => {
            if (!current.length) return allBooks;
            const next = current.filter((book) => allBooks.includes(book));
            return next.length ? next : allBooks;
        });
    }, [bookOptions]);

    const currentBookCode = project.pickedFile.bookCode;
    const currentChapter =
        project.pickedChapter?.chapterNumber ?? project.currentChapter;

    const localIssues = useMemo(
        () =>
            typeFilteredAllIssues.filter((issue) => {
                if (!issue.sid) return false;
                const parsed = parseSid(issue.sid);
                return (
                    parsed?.book === currentBookCode &&
                    parsed.chapter === currentChapter
                );
            }),
        [typeFilteredAllIssues, currentBookCode, currentChapter],
    );

    const localCount = localIssues.length;
    const allCount = typeFilteredAllIssues.length;
    const badgeCount = scope === "local" ? localCount : allCount;

    const baseIssues: LintIssue[] =
        scope === "local" ? localIssues : typeFilteredAllIssues;

    const filteredIssues = useMemo(
        () =>
            baseIssues.filter((issue) => {
                const matchesCode =
                    selectedCodes.length === codeOptions.length - 1 ||
                    selectedCodes.includes(issue.code);
                const matchesBook =
                    scope === "local" ||
                    selectedBooks.length === bookOptions.length - 1 ||
                    selectedBooks.includes(getLintIssueBookCode(issue));
                return matchesCode && matchesBook;
            }),
        [
            baseIssues,
            bookOptions.length,
            codeOptions.length,
            scope,
            selectedBooks,
            selectedCodes,
        ],
    );

    const sortedIssues = useMemo(
        () => sortIssuesForDisplay(filteredIssues),
        [filteredIssues],
    );

    const codeSummary = summarizeSelection(
        selectedCodes,
        codeOptions,
        filterLabels,
    );
    const bookSummary = summarizeSelection(
        selectedBooks,
        bookOptions,
        filterLabels,
    );

    const toggleCode = (value: string) =>
        setSelectedCodes((current) =>
            toggleSelection(current, codeOptions, value),
        );
    const toggleBook = (value: string) =>
        setSelectedBooks((current) =>
            toggleSelection(current, bookOptions, value),
        );

    const currentBookName =
        bookCodeToProjectLocalizedTitle({ bookCode: currentBookCode }) ||
        currentBookCode;

    const distinctBookCount = useMemo(
        () =>
            new Set(
                typeFilteredAllIssues.map((issue) =>
                    getLintIssueBookCode(issue),
                ),
            ).size,
        [typeFilteredAllIssues],
    );

    const handleJump = (issue: LintIssue) => {
        navigateToLintIssue(issue, {
            currentBookCode,
            currentChapter,
            switchBookOrChapter: actions.switchBookOrChapter,
        });
        setOpened(false);
    };

    return (
        <BasePopover.Root open={opened} onOpenChange={setOpened}>
            <BasePopover.Trigger
                render={
                    <TriggerButton
                        count={badgeCount}
                        active={opened}
                        ariaLabel={t`Content errors (${badgeCount})`}
                    />
                }
            />
            <BasePopover.Portal>
                <BasePopover.Positioner
                    side="bottom"
                    align="start"
                    sideOffset={8}
                    style={{ zIndex: zLayer.popoverPositioner }}
                >
                    <BasePopover.Popup className={styles.popover}>
                        <div className={styles.header}>
                            <div className={styles.headerText}>
                                <div className={styles.title}>
                                    <Trans>Content errors</Trans>
                                </div>
                                <div className={styles.subtitle}>
                                    <SubtitleText
                                        scope={scope}
                                        currentBookName={currentBookName}
                                        currentChapter={currentChapter}
                                        distinctBookCount={distinctBookCount}
                                    />
                                </div>
                            </div>
                            <button
                                type="button"
                                className={styles.closeButton}
                                onClick={() => setOpened(false)}
                                aria-label={t`Close`}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className={styles.scopeTabs}>
                            <ScopeTab
                                label={t`This chapter`}
                                count={localCount}
                                active={scope === "local"}
                                onClick={() => setScope("local")}
                            />
                            <ScopeTab
                                label={t`Whole project`}
                                count={allCount}
                                active={scope === "all"}
                                onClick={() => setScope("all")}
                            />
                        </div>

                        <div className={styles.filterRibbon}>
                            <IssueTypeSelect
                                value={issueTypeFilter}
                                onChange={setIssueTypeFilter}
                                counts={countByIssueType(lint.allIssues)}
                                label={t`Type`}
                                labels={{
                                    all: t`All`,
                                    content: t`Content`,
                                    usfm: t`USFM`,
                                }}
                            />
                            {baseIssues.length > 0 ? (
                                <>
                                    <LintFilterMenu
                                        label={t`Filter`}
                                        options={codeOptions}
                                        activeValues={selectedCodes}
                                        summary={codeSummary}
                                        onToggle={toggleCode}
                                    />
                                    {scope === "all" ? (
                                        <LintFilterMenu
                                            label={t`Books`}
                                            options={bookOptions}
                                            activeValues={selectedBooks}
                                            summary={bookSummary}
                                            onToggle={toggleBook}
                                        />
                                    ) : null}
                                </>
                            ) : null}
                        </div>

                        {sortedIssues.length === 0 ? (
                            <div className={styles.listViewport}>
                                <EmptyState
                                    scope={scope}
                                    localCount={localCount}
                                    allCount={allCount}
                                    filterExcludesEverything={
                                        baseIssues.length > 0 &&
                                        filteredIssues.length === 0
                                    }
                                    onSwitchScope={() =>
                                        setScope(
                                            scope === "local" ? "all" : "local",
                                        )
                                    }
                                />
                            </div>
                        ) : (
                            <VirtualizedIssueList
                                issues={sortedIssues}
                                getLocalizedBookName={(bookCode) =>
                                    bookCodeToProjectLocalizedTitle({
                                        bookCode,
                                    }) || bookCode
                                }
                                onJump={handleJump}
                                opened={opened}
                            />
                        )}
                    </BasePopover.Popup>
                </BasePopover.Positioner>
            </BasePopover.Portal>
        </BasePopover.Root>
    );
}

function TriggerButton(props: {
    count: number;
    active: boolean;
    ariaLabel: string;
    [key: string]: unknown;
}) {
    const { count, active, ariaLabel, ...rest } = props;
    const hasErrors = count > 0;
    return (
        <button
            type="button"
            aria-label={ariaLabel}
            aria-expanded={active}
            className={joinClassNames(
                styles.triggerButton,
                hasErrors && styles.triggerButtonWithCount,
                active && styles.triggerButtonActive,
            )}
            {...rest}
        >
            <AlertCircle size={16} />
            {hasErrors ? (
                <span className={styles.countPill}>
                    {count > 999 ? "999+" : count}
                </span>
            ) : null}
        </button>
    );
}

function IssueTypeSelect(props: {
    value: IssueTypeFilter;
    onChange: (next: IssueTypeFilter) => void;
    counts: Record<IssueTypeFilter, number>;
    label: string;
    labels: Record<IssueTypeFilter, string>;
}) {
    const order: IssueTypeFilter[] = ["content", "usfm", "all"];
    const triggerClassName = [
        buttonStyles.buttonBase,
        buttonStyles.buttonVariants.secondary,
        buttonStyles.buttonSizes.xs,
        projectViewStyles.lintFilterTrigger,
    ].join(" ");
    return (
        <Menu.Root>
            <Menu.Trigger className={triggerClassName}>
                <span className={projectViewStyles.lintFilterTriggerLabel}>
                    <Filter size={14} />
                    {props.label}
                </span>
                <span className={projectViewStyles.lintFilterTriggerValue}>
                    {props.labels[props.value]}
                </span>
                <ChevronDown size={14} />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner
                    side="bottom"
                    align="start"
                    sideOffset={4}
                    alignOffset={0}
                    className={projectViewStyles.lintFilterMenuPositioner}
                >
                    <Menu.Popup
                        className={projectViewStyles.lintFilterMenuPopup}
                    >
                        <Menu.RadioGroup
                            value={props.value}
                            onValueChange={(next) =>
                                props.onChange(next as IssueTypeFilter)
                            }
                            className={projectViewStyles.lintFilterMenuList}
                        >
                            {order.map((key) => (
                                <Menu.RadioItem
                                    key={key}
                                    value={key}
                                    className={
                                        projectViewStyles.lintFilterMenuItem
                                    }
                                >
                                    <span
                                        className={
                                            projectViewStyles.lintFilterMenuIndicator
                                        }
                                        aria-hidden="true"
                                    >
                                        {props.value === key ? (
                                            <Check size={14} />
                                        ) : null}
                                    </span>
                                    <span>
                                        {props.labels[key]} ({props.counts[key]}
                                        )
                                    </span>
                                </Menu.RadioItem>
                            ))}
                        </Menu.RadioGroup>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

function countByIssueType(
    issues: LintIssue[],
): Record<IssueTypeFilter, number> {
    let usfm = 0;
    let content = 0;
    for (const issue of issues) {
        if (issue.issueType === "content") content++;
        else usfm++;
    }
    return { all: issues.length, usfm, content };
}

function ScopeTab(props: {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={joinClassNames(
                styles.scopeTab,
                props.active && styles.scopeTabActive,
            )}
        >
            {props.label}
            <span
                className={joinClassNames(
                    styles.scopeTabCount,
                    props.active && styles.scopeTabCountActive,
                )}
            >
                {props.count}
            </span>
        </button>
    );
}

function IssueRow(props: {
    issue: LintIssue;
    localizedBookName: string;
    onJump: (issue: LintIssue) => void;
}) {
    const parsed = props.issue.sid ? parseSid(props.issue.sid) : null;
    const ref = formatIssueReference(props.localizedBookName, parsed);

    return (
        <button
            type="button"
            className={styles.issueRow}
            onClick={() => props.onJump(props.issue)}
        >
            <span className={styles.issueContent}>
                <span className={styles.issueRef}>{ref}</span>
                <span className={styles.issueSeparator}>&mdash;</span>
                <span className={styles.issueMessage}>
                    {props.issue.message}
                </span>
            </span>
            <ChevronRight size={16} className={styles.chevronIcon} />
        </button>
    );
}

function VirtualizedIssueList(props: {
    issues: LintIssue[];
    getLocalizedBookName: (bookCode: string) => string;
    onJump: (issue: LintIssue) => void;
    opened: boolean;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: props.issues.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 44,
        overscan: 8,
        measureElement: (el) => el.getBoundingClientRect().height,
        getItemKey: (index) => issueRowKey(props.issues[index], index),
    });

    // Re-measure when the popover opens or the list changes
    useEffect(() => {
        if (props.opened) virtualizer.measure();
    }, [props.opened, virtualizer]);

    return (
        <div ref={scrollRef} className={styles.listViewport}>
            <div
                className={styles.virtualInner}
                style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const issue = props.issues[virtualRow.index];
                    if (!issue) return null;
                    return (
                        <div
                            key={issueRowKey(issue, virtualRow.index)}
                            ref={virtualizer.measureElement}
                            data-index={virtualRow.index}
                            className={styles.virtualRow}
                            style={{
                                transform: `translateY(${virtualRow.start}px)`,
                            }}
                        >
                            <IssueRow
                                issue={issue}
                                localizedBookName={props.getLocalizedBookName(
                                    getLintIssueBookCode(issue),
                                )}
                                onJump={props.onJump}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SubtitleText(props: {
    scope: Scope;
    currentBookName: string;
    currentChapter: number;
    distinctBookCount: number;
}) {
    if (props.scope === "local") {
        return (
            <Trans>
                In {props.currentBookName} {props.currentChapter}
            </Trans>
        );
    }
    return (
        <Plural
            value={props.distinctBookCount}
            one="In 1 book"
            other="Across # books"
        />
    );
}

function formatIssueReference(
    localizedBookName: string,
    parsed: ReturnType<typeof parseSid>,
): string {
    if (!parsed) return localizedBookName;
    if (parsed.isBookChapOnly) {
        return `${localizedBookName} ${parsed.chapter}`;
    }
    const verseRange =
        parsed.verseStart !== parsed.verseEnd
            ? `${parsed.verseStart}-${parsed.verseEnd}`
            : `${parsed.verseStart}`;
    return `${localizedBookName} ${parsed.chapter}:${verseRange}`;
}

function isLocalSceneCleanProjectDirty(
    scope: Scope,
    localCount: number,
    allCount: number,
): boolean {
    return scope === "local" && localCount === 0 && allCount > 0;
}

function EmptyState(props: {
    scope: Scope;
    localCount: number;
    allCount: number;
    filterExcludesEverything: boolean;
    onSwitchScope: () => void;
}) {
    if (props.filterExcludesEverything) {
        return <FilteredOutEmptyState />;
    }

    if (
        isLocalSceneCleanProjectDirty(
            props.scope,
            props.localCount,
            props.allCount,
        )
    ) {
        return (
            <LocalCleanEmptyState
                allCount={props.allCount}
                onSwitchScope={props.onSwitchScope}
            />
        );
    }

    return <AllClearEmptyState />;
}

function FilteredOutEmptyState() {
    return (
        <div className={styles.emptyState}>
            <div className={styles.emptyStateIconCircle}>
                <CheckCircle2 size={24} />
            </div>
            <div className={styles.emptyStateTitle}>
                <Trans>No issues match this filter</Trans>
            </div>
        </div>
    );
}

function LocalCleanEmptyState(props: {
    allCount: number;
    onSwitchScope: () => void;
}) {
    return (
        <div className={styles.emptyState}>
            <div className={styles.emptyStateIconCircle}>
                <CheckCircle2 size={24} />
            </div>
            <div className={styles.emptyStateTitle}>
                <Trans>
                    This chapter has no errors that match your filters
                </Trans>
            </div>
            <div className={styles.emptyStateBody}>
                <Plural
                    value={props.allCount}
                    one="Nice work. 1 issue remains elsewhere in the project."
                    other="Nice work. # issues remain elsewhere in the project."
                />
            </div>
            <button
                type="button"
                className={styles.emptyStateAction}
                onClick={props.onSwitchScope}
            >
                <Plural
                    value={props.allCount}
                    one="View 1 project issue"
                    other="View # project issues"
                />
                <ArrowRight size={14} />
            </button>
        </div>
    );
}

function AllClearEmptyState() {
    return (
        <div className={styles.emptyState}>
            <div
                className={joinClassNames(
                    styles.emptyStateIconCircle,
                    styles.emptyStateIconCircleLarge,
                )}
            >
                <CheckCircle2 size={30} />
            </div>
            <div
                className={joinClassNames(
                    styles.emptyStateTitle,
                    styles.emptyStateTitleLarge,
                )}
            >
                <Trans>All clear</Trans>
            </div>
            <div className={styles.emptyStateBody}>
                <Trans>No content errors found</Trans>
            </div>
        </div>
    );
}

function issueRowKey(issue: LintIssue, index: number) {
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

function sortIssuesForDisplay(issues: LintIssue[]): LintIssue[] {
    // canonical book order, then chapter, then verse
    const bookCodes = Array.from(
        new Set(issues.map((i) => getLintIssueBookCode(i))),
    );
    const canonical = sortListByBookCanonical(bookCodes, (b) => b);
    const order = new Map<string, number>();
    canonical.forEach((code, idx) => {
        order.set(code, idx);
    });

    return [...issues].sort((a, b) => {
        const aBook = order.get(getLintIssueBookCode(a)) ?? 9999;
        const bBook = order.get(getLintIssueBookCode(b)) ?? 9999;
        if (aBook !== bBook) return aBook - bBook;
        const ap = a.sid ? parseSid(a.sid) : null;
        const bp = b.sid ? parseSid(b.sid) : null;
        const aChap = ap?.chapter ?? 0;
        const bChap = bp?.chapter ?? 0;
        if (aChap !== bChap) return aChap - bChap;
        const aVerse = ap?.verseStart ?? 0;
        const bVerse = bp?.verseStart ?? 0;
        return aVerse - bVerse;
    });
}

function navigateToLintIssue(
    issue: LintIssue,
    ctx: {
        currentBookCode: string;
        currentChapter: number;
        switchBookOrChapter: (bookCode: string, chapter: number) => unknown;
    },
) {
    if (!issue.sid) return;
    const parsed = parseSid(issue.sid);
    if (!parsed) return;
    const tokenId = issue.tokenId ?? issue.relatedTokenId;

    const scrollToToken = () => {
        if (!tokenId) return false;
        const el = document.querySelector(
            `[data-id="${tokenId}"]`,
        ) as HTMLElement | null;
        if (!el) return false;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("selected");
        return true;
    };

    if (
        parsed.book === ctx.currentBookCode &&
        parsed.chapter === ctx.currentChapter
    ) {
        scrollToToken();
        return;
    }

    ctx.switchBookOrChapter(parsed.book, parsed.chapter);
    if (!tokenId) return;
    let attempts = 0;
    const maxAttempts = 50;
    const interval = setInterval(() => {
        attempts++;
        if (scrollToToken() || attempts >= maxAttempts) {
            clearInterval(interval);
        }
    }, 100);
}
