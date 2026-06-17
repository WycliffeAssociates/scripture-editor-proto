// The workspace findings panel ("Content errors"): every producer's findings
// — onion USFM structure and sous-chef content — in one policy-filtered,
// navigable triage list. Rows render the same decorated message every other
// surface shows (one formatter, no popover/panel divergence), and counts ride
// the policy-filtered views, so a stored-but-hidden finding (e.g. `\s5`)
// never increments a badge.

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

import { TESTING_IDS } from "@/app/data/constants.ts";
import type { DecoratedFinding } from "@/app/domain/editor/annotations/finding.ts";
import type { FlatFinding } from "@/app/state/findingsSelectors.ts";
import { FindingsFilterMenu } from "@/app/ui/components/blocks/findingsFilters.tsx";
import {
  buildFindingBookOptions,
  buildFindingCodeOptions,
  type FindingsFilterLabels,
  summarizeSelection,
  toggleSelection,
} from "@/app/ui/components/blocks/findingsFilters.utils.ts";
import * as buttonStyles from "@/app/ui/components/primitives/Button/button.css.ts";
import { joinClassNames } from "@/app/ui/components/primitives/classNames.ts";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import { useDecorateFindings } from "@/app/ui/hooks/useDecorateFindings.ts";
import type { FindingCategoryFilter } from "@/app/ui/hooks/useFindings.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/FindingsPopover.css.ts";
import * as projectViewStyles from "@/app/ui/styles/modules/Projectview.css.ts";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import { parseSid, sortListByBookCanonical } from "@/core/data/bible/bible.ts";

type Scope = "local" | "all";

export function FindingsPopover() {
  const { t } = useLingui();
  const { actions, bookCodeToProjectLocalizedTitle, findings, project } =
    useWorkspaceContext();
  const decorate = useDecorateFindings();

  const [opened, setOpened] = useState(false);
  const {
    scope,
    setScope,
    categoryFilter,
    setCategoryFilter,
    selectedCodes,
    setSelectedCodes,
    selectedBooks,
    setSelectedBooks,
    categoryFilteredAll,
    shownVisible,
    shownAll,
    categoryCounts,
    baseScopeCount,
  } = findings;

  const filterLabels: FindingsFilterLabels = useMemo(
    () => ({ all: t`All`, none: t`None` }),
    [t],
  );

  const codeOptions = useMemo(
    () => buildFindingCodeOptions(categoryFilteredAll, filterLabels),
    [categoryFilteredAll, filterLabels],
  );
  const bookOptions = useMemo(
    () =>
      buildFindingBookOptions(
        categoryFilteredAll,
        bookCodeToProjectLocalizedTitle,
        filterLabels,
      ),
    [bookCodeToProjectLocalizedTitle, categoryFilteredAll, filterLabels],
  );

  const currentBookCode = project.pickedFile.bookCode;
  const currentChapter =
    project.pickedChapter?.chapterNumber ?? project.currentChapter;

  const localCount = shownVisible.length;
  const allCount = shownAll.length;
  const badgeCount = scope === "local" ? localCount : allCount;

  const sortedFindings = useMemo(
    () => sortFindingsForDisplay(scope === "local" ? shownVisible : shownAll),
    [scope, shownVisible, shownAll],
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
    setSelectedCodes((current) => toggleSelection(current, codeOptions, value));
  const toggleBook = (value: string) =>
    setSelectedBooks((current) => toggleSelection(current, bookOptions, value));

  const currentBookName =
    bookCodeToProjectLocalizedTitle({ bookCode: currentBookCode }) ||
    currentBookCode;

  const distinctBookCount = useMemo(
    () => new Set(categoryFilteredAll.map((entry) => entry.bookCode)).size,
    [categoryFilteredAll],
  );

  const handleJump = (entry: FlatFinding) => {
    navigateToFinding(entry, {
      currentBookCode,
      currentChapter,
      switchBookOrChapter: actions.switchBookOrChapter,
    });
    setOpened(false);
  };

  return (
    <BasePopover.Root open={opened} onOpenChange={setOpened}>
      <IconTooltip label={t`Content errors (${badgeCount})`}>
        <BasePopover.Trigger
          render={
            <TriggerButton
              count={badgeCount}
              active={opened}
              ariaLabel={t`Content errors (${badgeCount})`}
              data-testid={TESTING_IDS.findingsPopover.triggerButton}
            />
          }
        />
      </IconTooltip>
      <BasePopover.Portal>
        <BasePopover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          style={{ zIndex: zLayer.popoverPositioner }}
        >
          <BasePopover.Popup
            className={styles.popover}
            data-testid={TESTING_IDS.findingsPopover.container}
          >
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
              <IconTooltip label={t`Close`}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setOpened(false)}
                  aria-label={t`Close`}
                >
                  <X size={18} />
                </button>
              </IconTooltip>
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
              <CategorySelect
                value={categoryFilter}
                onChange={setCategoryFilter}
                counts={categoryCounts}
                label={t`Type`}
                labels={{
                  all: t`All`,
                  content: t`Content`,
                  structure: t`USFM`,
                }}
              />
              {baseScopeCount > 0 ? (
                <>
                  <FindingsFilterMenu
                    label={t`Filter`}
                    options={codeOptions}
                    activeValues={selectedCodes}
                    summary={codeSummary}
                    onToggle={toggleCode}
                  />
                  {scope === "all" ? (
                    <FindingsFilterMenu
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

            {sortedFindings.length === 0 ? (
              <div className={styles.listViewport}>
                <EmptyState
                  scope={scope}
                  localCount={localCount}
                  allCount={allCount}
                  filterExcludesEverything={
                    baseScopeCount > 0 && sortedFindings.length === 0
                  }
                  onSwitchScope={() =>
                    setScope(scope === "local" ? "all" : "local")
                  }
                />
              </div>
            ) : (
              <VirtualizedFindingList
                entries={sortedFindings}
                decorate={decorate}
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
        active && styles.triggerButtonActive,
      )}
      {...rest}
    >
      <AlertCircle size={16} />
      {hasErrors ? (
        <span className={styles.countPill}>{count > 999 ? "999+" : count}</span>
      ) : null}
    </button>
  );
}

function CategorySelect(props: {
  value: FindingCategoryFilter;
  onChange: (next: FindingCategoryFilter) => void;
  counts: Record<FindingCategoryFilter, number>;
  label: string;
  labels: Record<FindingCategoryFilter, string>;
}) {
  const order: FindingCategoryFilter[] = ["content", "structure", "all"];
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
          <Menu.Popup className={projectViewStyles.lintFilterMenuPopup}>
            <Menu.RadioGroup
              value={props.value}
              onValueChange={(next) =>
                props.onChange(next as FindingCategoryFilter)
              }
              className={projectViewStyles.lintFilterMenuList}
            >
              {order.map((key) => (
                <Menu.RadioItem
                  key={key}
                  value={key}
                  className={projectViewStyles.lintFilterMenuItem}
                >
                  <span
                    className={projectViewStyles.lintFilterMenuIndicator}
                    aria-hidden="true"
                  >
                    {props.value === key ? <Check size={14} /> : null}
                  </span>
                  <span>
                    {props.labels[key]} ({props.counts[key]})
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

function FindingRow(props: {
  entry: FlatFinding;
  decorated: DecoratedFinding;
  localizedBookName: string;
  onJump: (entry: FlatFinding) => void;
}) {
  const sid = props.entry.finding.anchor.sid;
  const parsed = sid ? parseSid(sid) : null;
  const ref = formatFindingReference(
    props.localizedBookName,
    props.entry.chapter,
    parsed,
  );

  return (
    <button
      type="button"
      className={styles.issueRow}
      onClick={() => props.onJump(props.entry)}
      data-testid={TESTING_IDS.findingsPopover.errorItem}
    >
      <span className={styles.issueContent}>
        <span
          className={styles.issueRef}
          data-testid={TESTING_IDS.findingsPopover.errorSid}
        >
          {ref}
        </span>
        <span className={styles.issueSeparator}>&mdash;</span>
        <span
          className={styles.issueMessage}
          data-testid={TESTING_IDS.findingsPopover.errorMessage}
        >
          {props.decorated.message}
        </span>
      </span>
      <ChevronRight size={16} className={styles.chevronIcon} />
    </button>
  );
}

function VirtualizedFindingList(props: {
  entries: FlatFinding[];
  decorate: (finding: FlatFinding["finding"]) => DecoratedFinding;
  getLocalizedBookName: (bookCode: string) => string;
  onJump: (entry: FlatFinding) => void;
  opened: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
    getItemKey: (index) => props.entries[index].finding.id,
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
          const entry = props.entries[virtualRow.index];
          if (!entry) return null;
          return (
            <div
              key={entry.finding.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={styles.virtualRow}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <FindingRow
                entry={entry}
                // Decorated per rendered row (virtualized), so
                // a project-wide list never formats messages
                // it isn't showing.
                decorated={props.decorate(entry.finding)}
                localizedBookName={props.getLocalizedBookName(entry.bookCode)}
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

function formatFindingReference(
  localizedBookName: string,
  chapter: number,
  parsed: ReturnType<typeof parseSid>,
): string {
  // The sid contributes the verse; the chapter is the store address (so
  // front-matter findings — chapter 0, possibly no sid — still get a
  // sensible "Book 0" reference).
  if (!parsed) return `${localizedBookName} ${chapter}`;
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
    isLocalSceneCleanProjectDirty(props.scope, props.localCount, props.allCount)
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
        <Trans>This chapter has no errors that match your filters</Trans>
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

function sortFindingsForDisplay(entries: FlatFinding[]): FlatFinding[] {
  // canonical book order, then chapter (store address), then verse (sid)
  const bookCodes = Array.from(new Set(entries.map((e) => e.bookCode)));
  const canonical = sortListByBookCanonical(bookCodes, (b) => b);
  const order = new Map<string, number>();
  canonical.forEach((code, idx) => {
    order.set(code, idx);
  });

  return entries.toSorted((a, b) => {
    const aBook = order.get(a.bookCode) ?? 9999;
    const bBook = order.get(b.bookCode) ?? 9999;
    if (aBook !== bBook) return aBook - bBook;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    const aSid = a.finding.anchor.sid;
    const bSid = b.finding.anchor.sid;
    const ap = aSid ? parseSid(aSid) : null;
    const bp = bSid ? parseSid(bSid) : null;
    const aVerse = ap?.verseStart ?? 0;
    const bVerse = bp?.verseStart ?? 0;
    return aVerse - bVerse;
  });
}

/**
 * Jump from a panel row to the finding in the editor. The store address
 * always gives a navigable book+chapter (even for no-sid front-matter
 * findings); the scroll target degrades anchor-appropriately: token anchors
 * scroll to the token element, content anchors to their highlight rect, and
 * either falls back to the verse element when the precise target isn't
 * rendered yet.
 */
function navigateToFinding(
  entry: FlatFinding,
  ctx: {
    currentBookCode: string;
    currentChapter: number;
    switchBookOrChapter: (bookCode: string, chapter: number) => unknown;
  },
) {
  const { finding } = entry;

  const scrollTo = (): boolean => {
    const anchor = finding.anchor;
    let el: HTMLElement | null = null;
    if (anchor.kind === "token") {
      const tokenId = finding.touchedTokenIds?.[0] ?? anchor.tokenId;
      el = document.querySelector(
        `[data-id="${tokenId}"]`,
      ) as HTMLElement | null;
    } else {
      // Content highlight rect drawn by the overlay, keyed by id.
      el = document.querySelector(
        `[data-annotation-id="${finding.id}"]`,
      ) as HTMLElement | null;
    }
    // Verse-level fallback when the precise target isn't rendered.
    if (!el && anchor.sid) {
      el = document.querySelector(
        `[data-sid="${anchor.sid}"]`,
      ) as HTMLElement | null;
    }
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (finding.anchor.kind === "token") el.classList.add("selected");
    return true;
  };

  if (
    entry.bookCode === ctx.currentBookCode &&
    entry.chapter === ctx.currentChapter
  ) {
    scrollTo();
    return;
  }

  ctx.switchBookOrChapter(entry.bookCode, entry.chapter);
  let attempts = 0;
  const maxAttempts = 50;
  const interval = setInterval(() => {
    attempts++;
    if (scrollTo() || attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 100);
}
