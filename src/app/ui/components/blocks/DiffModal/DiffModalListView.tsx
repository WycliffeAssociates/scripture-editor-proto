import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BookOpen, X } from "lucide-react";
import { useMemo, useRef } from "react";

import { requiresExplicitPresenceDecision } from "@/app/domain/project/compare/decisionState.ts";
import type {
  ChapterAddress,
  CompareChapterDecisions,
  CompareDecisionMap,
  CompareSide,
  FrozenChapterComparison,
} from "@/app/domain/project/compare/types.ts";
import {
  buildCompareListRows,
  type CompareListRow,
  type CompareRowFilters,
} from "@/app/domain/project/compare/viewModels.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { joinClassNames } from "@/app/ui/components/primitives/classNames.ts";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";
import type { DecisionUnit } from "@/core/domain/usfm/usfmOnionTypes.ts";

import {
  movedAnchorCaptions,
  tokensToReviewText,
  unitDetailLabels,
  unitPositionNarration,
  unitReference,
  unitStatusLabel,
  unitStatusVariant,
} from "./chapterDiffViewModel.ts";

export type ComparePresentationChapter = Readonly<{
  comparison: FrozenChapterComparison;
  label: string;
  decisions: CompareChapterDecisions;
}>;

export type CompareDecisionChange = (
  address: ChapterAddress,
  unitId: string,
  decision: CompareSide | null,
) => void;

export type ComparePresenceDecisionChange = (
  address: ChapterAddress,
  decision: CompareSide | null,
) => void;

export type CompareNavigate = (args: {
  address: ChapterAddress;
  unitId: string;
  sid: string;
}) => void;

const NO_DECISIONS: CompareDecisionMap = Object.freeze({});

type DecisionControlProps = Readonly<{
  chapter: ComparePresentationChapter;
  unitId: string;
  decision: CompareSide | null;
  leftLabel: string;
  rightLabel: string;
  instanceId?: string;
  onDecisionChange: CompareDecisionChange;
  /** Bare arrows + icon, full labels moved to title/visually-hidden text —
   * for narrow spaces like the chapter-view gutter. */
  compact?: boolean;
}>;

export function CompareDecisionControl({
  chapter,
  unitId,
  decision,
  leftLabel,
  rightLabel,
  instanceId,
  onDecisionChange,
  compact = false,
}: DecisionControlProps) {
  const address = chapter.comparison.address;
  const groupName = `${address.bookCode}-${address.chapterNum}-${unitId}-${instanceId ?? "list"}`;
  return (
    <fieldset
      className={styles.compareDecisionFieldset}
      data-compact={compact || undefined}
    >
      <legend className={styles.visuallyHidden}>
        <Trans>Choose which source to use</Trans>
      </legend>
      <label
        className={styles.compareDecisionOption}
        title={compact ? leftLabel : undefined}
      >
        <input
          className={styles.compareDecisionInput}
          type="radio"
          name={groupName}
          checked={decision === "left"}
          onChange={() => onDecisionChange(address, unitId, "left")}
        />
        <span className={styles.compareDecisionText}>
          <span aria-hidden={compact ? undefined : "true"}>
            {compact ? "◀" : "◀ "}
          </span>
          <span className={compact ? styles.visuallyHidden : undefined}>
            {leftLabel}
          </span>
        </span>
      </label>
      <label
        className={styles.compareDecisionOption}
        title={compact ? rightLabel : undefined}
      >
        <input
          className={styles.compareDecisionInput}
          type="radio"
          name={groupName}
          checked={decision === "right"}
          onChange={() => onDecisionChange(address, unitId, "right")}
        />
        <span className={styles.compareDecisionText}>
          <span className={compact ? styles.visuallyHidden : undefined}>
            {rightLabel}
          </span>
          <span aria-hidden={compact ? undefined : "true"}>
            {compact ? "▶" : " ▶"}
          </span>
        </span>
      </label>
      <button
        type="button"
        className={styles.compareClearDecision}
        disabled={decision === null}
        title={compact ? t`Clear` : undefined}
        onClick={() => onDecisionChange(address, unitId, null)}
      >
        {compact ? <X size={12} aria-hidden="true" /> : <Trans>Clear</Trans>}
        {compact ? (
          <span className={styles.visuallyHidden}>{t`Clear`}</span>
        ) : null}
      </button>
    </fieldset>
  );
}

export function ComparePresenceDecisionControl({
  chapter,
  leftLabel,
  rightLabel,
  onPresenceDecision,
}: {
  chapter: ComparePresentationChapter;
  leftLabel: string;
  rightLabel: string;
  onPresenceDecision: ComparePresenceDecisionChange;
}) {
  const { address } = chapter.comparison;
  const decision = chapter.decisions.presence;
  const groupName = `${address.bookCode}-${address.chapterNum}-presence`;
  return (
    <fieldset className={styles.comparePresenceFieldset}>
      <legend className={styles.comparePresenceLegend}>
        <Trans>This whole chapter exists on only one side. Use:</Trans>
      </legend>
      <label className={styles.compareDecisionOption}>
        <input
          className={styles.compareDecisionInput}
          type="radio"
          name={groupName}
          checked={decision === "left"}
          onChange={() => onPresenceDecision(address, "left")}
        />
        <span className={styles.compareDecisionText}>
          <span aria-hidden="true">◀ </span>
          {leftLabel}
        </span>
      </label>
      <label className={styles.compareDecisionOption}>
        <input
          className={styles.compareDecisionInput}
          type="radio"
          name={groupName}
          checked={decision === "right"}
          onChange={() => onPresenceDecision(address, "right")}
        />
        <span className={styles.compareDecisionText}>
          {rightLabel}
          <span aria-hidden="true"> ▶</span>
        </span>
      </label>
      <button
        type="button"
        className={styles.compareClearDecision}
        disabled={decision === null}
        onClick={() => onPresenceDecision(address, null)}
      >
        <Trans>Clear</Trans>
      </button>
    </fieldset>
  );
}

function EmptySide() {
  return (
    <span className={styles.versePlaceholder}>
      <Trans>No content on this side</Trans>
    </span>
  );
}

function ReviewText({ text }: { text: string }) {
  return text ? <pre className={styles.diffPre}>{text}</pre> : <EmptySide />;
}

type ListItem =
  | Readonly<{
      kind: "heading";
      key: string;
      chapter: ComparePresentationChapter;
      presenceRequired: boolean;
    }>
  | Readonly<{
      kind: "row";
      key: string;
      chapter: ComparePresentationChapter;
      row: CompareListRow;
    }>;

function chapterKeyOf(chapter: ComparePresentationChapter): string {
  return `${chapter.comparison.address.bookCode}:${chapter.comparison.address.chapterNum}`;
}

/** Flattens every chapter's rows into one array so the whole list — headings
 * included — can live in a single virtualizer, instead of one non-virtualized
 * `<section>` per chapter. */
function useListItems(
  chapters: readonly ComparePresentationChapter[],
  filters: CompareRowFilters,
  readOnly: boolean,
): readonly ListItem[] {
  return useMemo(() => {
    const items: ListItem[] = [];
    for (const chapter of chapters) {
      const ck = chapterKeyOf(chapter);
      const decisions = readOnly ? NO_DECISIONS : chapter.decisions.units;
      const rows = buildCompareListRows({
        skeleton: chapter.comparison.skeleton,
        decisions,
        filters: { ...filters, hideUnchanged: true },
      });
      const presenceRequired = requiresExplicitPresenceDecision(
        chapter.comparison,
      );
      if (rows.length === 0 && !presenceRequired) continue;
      items.push({
        kind: "heading",
        key: `h:${ck}`,
        chapter,
        presenceRequired,
      });
      for (const row of rows) {
        items.push({
          kind: "row",
          key: `r:${ck}:${row.unit.id}`,
          chapter,
          row,
        });
      }
    }
    return items;
  }, [chapters, filters, readOnly]);
}

function ChapterHeadingItem({
  chapter,
  presenceRequired,
  leftLabel,
  rightLabel,
  readOnly,
  onPresenceDecision,
}: {
  chapter: ComparePresentationChapter;
  presenceRequired: boolean;
  leftLabel: string;
  rightLabel: string;
  readOnly: boolean;
  onPresenceDecision?: ComparePresenceDecisionChange;
}) {
  return (
    <div
      className={joinClassNames(
        styles.compareListChapterHeading,
        styles.compareChapterToolbar,
      )}
    >
      <h3 className={styles.compareChapterHeading}>{chapter.label}</h3>
      {!readOnly && onPresenceDecision && presenceRequired ? (
        <ComparePresenceDecisionControl
          chapter={chapter}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
          onPresenceDecision={onPresenceDecision}
        />
      ) : null}
    </div>
  );
}

/** The "collocated" 2x2 body for a moved unit's list row — columns
 * {left, right}, rows {old, new} position. Real content sits on the
 * diagonal; the anti-diagonal carries compact placeholder notes instead of
 * repeating text, so a move never reads as two disconnected edits. */
function CompareMovedContentGrid({
  unit,
  leftLabel,
  rightLabel,
  showUsfmMarkers,
  decision,
  captions,
}: {
  unit: DecisionUnit;
  leftLabel: string;
  rightLabel: string;
  showUsfmMarkers: boolean;
  decision: CompareSide | null;
  captions: { from: string; to: string } | null;
}) {
  const leftText = tokensToReviewText({
    tokens: unit.baselineTokens,
    showUsfmMarkers,
  });
  const rightText = tokensToReviewText({
    tokens: unit.currentTokens,
    showUsfmMarkers,
  });
  const pureMove = unit.status === "moved";

  return (
    <div className={styles.collocatedGrid}>
      <div className={styles.collocatedCornerLabel} />
      <div className={styles.collocatedColLabel}>{leftLabel}</div>
      <div className={styles.collocatedColLabel}>{rightLabel}</div>

      <div className={styles.collocatedRowLabel}>
        <Trans>Old position</Trans>
        {captions ? (
          <span className={styles.diffTextMuted}> · {captions.from}</span>
        ) : null}
      </div>
      <div
        className={styles.collocatedCell}
        data-chosen={decision === "left" || undefined}
        data-dim={decision === "right" || undefined}
      >
        {pureMove && decision === "right" ? (
          <span className={styles.diffTextMuted}>
            <Trans>(same text — shown below)</Trans>
          </span>
        ) : leftText ? (
          <pre className={styles.diffPre}>{leftText}</pre>
        ) : (
          <span className={styles.versePlaceholder}>
            <Trans>No content on this side</Trans>
          </span>
        )}
      </div>
      <div className={styles.collocatedCorner}>
        <Trans>moved away</Trans>
      </div>

      <div className={styles.collocatedRowLabel}>
        <Trans>New position</Trans>
        {captions ? (
          <span className={styles.diffTextMuted}> · {captions.to}</span>
        ) : null}
      </div>
      <div className={styles.collocatedCorner}>
        <Trans>not here yet</Trans>
      </div>
      <div
        className={styles.collocatedCell}
        data-chosen={decision === "right" || undefined}
        data-dim={decision === "left" || undefined}
      >
        {pureMove && decision === "left" ? (
          <span className={styles.diffTextMuted}>
            <Trans>(same text — shown above)</Trans>
          </span>
        ) : rightText ? (
          <pre className={styles.diffPre}>{rightText}</pre>
        ) : (
          <span className={styles.versePlaceholder}>
            <Trans>No content on this side</Trans>
          </span>
        )}
      </div>
    </div>
  );
}

function CompareListRowArticle({
  chapter,
  row,
  leftLabel,
  rightLabel,
  readOnly,
  showUsfmMarkers,
  onDecisionChange,
  onNavigate,
}: {
  chapter: ComparePresentationChapter;
  row: CompareListRow;
  leftLabel: string;
  rightLabel: string;
  readOnly: boolean;
  showUsfmMarkers: boolean;
  onDecisionChange?: CompareDecisionChange;
  onNavigate?: CompareNavigate;
}) {
  const { comparison } = chapter;
  const unit = row.unit;
  const sid = unitReference(unit);
  const details = unitDetailLabels({ unit, leftLabel, rightLabel });
  // The moved grid narrates its own old/new position captions, so the header
  // only carries this sentence for the (non-moved) added/deleted case.
  const positionNarration = unit.displaced
    ? null
    : unitPositionNarration({
        skeleton: comparison.skeleton,
        unit,
        leftSlotIndex: row.leftSlotIndex,
        rightSlotIndex: row.rightSlotIndex,
      });
  const leftText = tokensToReviewText({
    tokens: unit.baselineTokens,
    showUsfmMarkers,
  });
  const rightText = tokensToReviewText({
    tokens: unit.currentTokens,
    showUsfmMarkers,
  });
  const actionable = unit.status !== "unchanged";
  return (
    <article className={styles.compareReviewRow} data-compare-unit-id={unit.id}>
      <header className={styles.compareReviewHeader}>
        <div className={styles.compareReviewIdentity}>
          <span className={styles.compareReviewSid}>{sid}</span>
          <span
            className={joinClassNames(
              styles.diffBadge,
              styles.statusBadgeClassName[unitStatusVariant(unit)],
            )}
          >
            {unitStatusLabel(unit)}
          </span>
          {positionNarration ? (
            <span className={styles.compareMoveNarration}>
              {positionNarration}
            </span>
          ) : null}
          {details.map((detail) => (
            <span key={detail} className={styles.compareReviewDetail}>
              {detail}
            </span>
          ))}
        </div>
        <div className={styles.compareReviewActions}>
          {onNavigate ? (
            <Button
              variant="default"
              size="xs"
              aria-label={t`Open in editor`}
              title={t`Open in editor`}
              onClick={() =>
                onNavigate({
                  address: comparison.address,
                  unitId: unit.id,
                  sid,
                })
              }
            >
              <BookOpen size={14} />
            </Button>
          ) : null}
          {!readOnly && actionable && onDecisionChange ? (
            <CompareDecisionControl
              chapter={chapter}
              unitId={unit.id}
              decision={row.decision}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
              onDecisionChange={onDecisionChange}
            />
          ) : null}
        </div>
      </header>
      {unit.displaced ? (
        <CompareMovedContentGrid
          unit={unit}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
          showUsfmMarkers={showUsfmMarkers}
          decision={row.decision}
          captions={movedAnchorCaptions({
            skeleton: comparison.skeleton,
            leftSlotIndex: row.leftSlotIndex,
            rightSlotIndex: row.rightSlotIndex,
          })}
        />
      ) : (
        <div className={styles.compareReviewPanes}>
          <div
            className={styles.compareReviewPane}
            data-selected={row.decision === "left" || undefined}
            data-dimmed={row.decision === "right" || undefined}
          >
            <span className={styles.diffLabel}>{leftLabel}</span>
            <ReviewText text={leftText} />
          </div>
          <div
            className={styles.compareReviewPane}
            data-selected={row.decision === "right" || undefined}
            data-dimmed={row.decision === "left" || undefined}
          >
            <span className={styles.diffLabel}>{rightLabel}</span>
            <ReviewText text={rightText} />
          </div>
        </div>
      )}
    </article>
  );
}

export function VirtualizedDiffList({
  chapters,
  filters = {},
  leftLabel,
  rightLabel,
  readOnly,
  showUsfmMarkers,
  onDecisionChange,
  onPresenceDecision,
  onNavigate,
}: {
  chapters: readonly ComparePresentationChapter[];
  filters?: CompareRowFilters;
  leftLabel: string;
  rightLabel: string;
  readOnly: boolean;
  showUsfmMarkers: boolean;
  onDecisionChange?: CompareDecisionChange;
  onPresenceDecision?: ComparePresenceDecisionChange;
  onNavigate?: CompareNavigate;
}) {
  const items = useListItems(chapters, filters, readOnly);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (items[index]?.kind === "heading" ? 44 : 180),
    overscan: 8,
  });

  return (
    <div
      ref={parentRef}
      className={styles.diffScrollArea}
      data-diff-scroll-container="true"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          return (
            <div
              key={item.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {item.kind === "heading" ? (
                <ChapterHeadingItem
                  chapter={item.chapter}
                  presenceRequired={item.presenceRequired}
                  leftLabel={leftLabel}
                  rightLabel={rightLabel}
                  readOnly={readOnly}
                  onPresenceDecision={onPresenceDecision}
                />
              ) : (
                <CompareListRowArticle
                  chapter={item.chapter}
                  row={item.row}
                  leftLabel={leftLabel}
                  rightLabel={rightLabel}
                  readOnly={readOnly}
                  showUsfmMarkers={showUsfmMarkers}
                  onDecisionChange={onDecisionChange}
                  onNavigate={onNavigate}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
