import { Trans } from "@lingui/react/macro";
import { BookOpen } from "lucide-react";
import { useMemo } from "react";

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
  type CompareRowFilters,
} from "@/app/domain/project/compare/viewModels.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

import {
  tokensToReviewText,
  unitDetailLabels,
  unitPositionNarration,
  unitReference,
  unitStatusLabel,
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
}>;

export function CompareDecisionControl({
  chapter,
  unitId,
  decision,
  leftLabel,
  rightLabel,
  instanceId,
  onDecisionChange,
}: DecisionControlProps) {
  const address = chapter.comparison.address;
  const groupName = `${address.bookCode}-${address.chapterNum}-${unitId}-${instanceId ?? "list"}`;
  return (
    <fieldset className={styles.compareDecisionFieldset}>
      <legend className={styles.visuallyHidden}>
        <Trans>Choose which source to use</Trans>
      </legend>
      <label className={styles.compareDecisionOption}>
        <input
          className={styles.compareDecisionInput}
          type="radio"
          name={groupName}
          checked={decision === "left"}
          onChange={() => onDecisionChange(address, unitId, "left")}
        />
        <span className={styles.compareDecisionText}>{leftLabel}</span>
      </label>
      <label className={styles.compareDecisionOption}>
        <input
          className={styles.compareDecisionInput}
          type="radio"
          name={groupName}
          checked={decision === "right"}
          onChange={() => onDecisionChange(address, unitId, "right")}
        />
        <span className={styles.compareDecisionText}>{rightLabel}</span>
      </label>
      <button
        type="button"
        className={styles.compareClearDecision}
        disabled={decision === null}
        onClick={() => onDecisionChange(address, unitId, null)}
      >
        <Trans>Clear</Trans>
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
        <span className={styles.compareDecisionText}>{leftLabel}</span>
      </label>
      <label className={styles.compareDecisionOption}>
        <input
          className={styles.compareDecisionInput}
          type="radio"
          name={groupName}
          checked={decision === "right"}
          onChange={() => onPresenceDecision(address, "right")}
        />
        <span className={styles.compareDecisionText}>{rightLabel}</span>
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

function CompareListChapter({
  chapter,
  filters,
  leftLabel,
  rightLabel,
  readOnly,
  showUsfmMarkers,
  onDecisionChange,
  onPresenceDecision,
  onNavigate,
}: {
  chapter: ComparePresentationChapter;
  filters: CompareRowFilters;
  leftLabel: string;
  rightLabel: string;
  readOnly: boolean;
  showUsfmMarkers: boolean;
  onDecisionChange?: CompareDecisionChange;
  onPresenceDecision?: ComparePresenceDecisionChange;
  onNavigate?: CompareNavigate;
}) {
  const { comparison } = chapter;
  const decisions = readOnly ? NO_DECISIONS : chapter.decisions.units;
  const rows = useMemo(
    () =>
      buildCompareListRows({
        skeleton: comparison.skeleton,
        decisions,
        filters: { ...filters, hideUnchanged: true },
      }),
    [comparison.skeleton, decisions, filters],
  );
  const presenceRequired = requiresExplicitPresenceDecision(comparison);
  if (rows.length === 0 && !presenceRequired) return null;

  return (
    <section className={styles.compareChapterGroup} aria-label={chapter.label}>
      <div className={styles.compareChapterToolbar}>
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
      {rows.map((row) => {
        const unit = row.unit;
        const sid = unitReference(unit);
        const details = unitDetailLabels({ unit, leftLabel, rightLabel });
        const positionNarration = unitPositionNarration({
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
          <article
            key={unit.id}
            className={styles.compareReviewRow}
            data-compare-unit-id={unit.id}
          >
            <header className={styles.compareReviewHeader}>
              <div className={styles.compareReviewIdentity}>
                <strong>{sid}</strong>
                <span className={styles.diffBadge}>
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
                    leftIcon={<BookOpen size={14} />}
                    onClick={() =>
                      onNavigate({
                        address: comparison.address,
                        unitId: unit.id,
                        sid,
                      })
                    }
                  >
                    <Trans>Open in editor</Trans>
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
          </article>
        );
      })}
    </section>
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
  return (
    <div className={styles.diffScrollArea} data-diff-scroll-container="true">
      {chapters.map((chapter) => (
        <CompareListChapter
          key={`${chapter.comparison.address.bookCode}:${chapter.comparison.address.chapterNum}`}
          chapter={chapter}
          filters={filters}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
          readOnly={readOnly}
          showUsfmMarkers={showUsfmMarkers}
          onDecisionChange={onDecisionChange}
          onPresenceDecision={onPresenceDecision}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
