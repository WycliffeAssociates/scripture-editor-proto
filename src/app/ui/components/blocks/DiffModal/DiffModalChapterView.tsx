import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { BookOpen } from "lucide-react";
import { useMemo } from "react";

import { requiresExplicitPresenceDecision } from "@/app/domain/project/compare/decisionState.ts";
import type {
  CompareDecisionMap,
  CompareSide,
} from "@/app/domain/project/compare/types.ts";
import {
  buildCompareChapterRows,
  type CompareChapterSlotRow,
  type CompareRowFilters,
} from "@/app/domain/project/compare/viewModels.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import { joinClassNames } from "@/app/ui/components/primitives/classNames.ts";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

import {
  movedAnchorCaptions,
  shouldShowUnitSide,
  tokensToReviewText,
  unitDetailLabels,
  unitReference,
  unitStatusVariant,
} from "./chapterDiffViewModel.ts";
import {
  type CompareDecisionChange,
  CompareDecisionControl,
  type CompareNavigate,
  type ComparePresenceDecisionChange,
  ComparePresenceDecisionControl,
  type ComparePresentationChapter,
} from "./DiffModalListView.tsx";

type ChapterDecisionChange = (
  address: ComparePresentationChapter["comparison"]["address"],
  decision: CompareSide | null,
) => void;

const NO_DECISIONS: CompareDecisionMap = Object.freeze({});

/** A displaced unit's origin/destination slot each get exactly one direction
 * of the shared decision — the skeleton already lays the unit out at both of
 * its real positions, so there is no ambiguity to resolve with a full L/R/Clear
 * control at either one. Clicking the already-selected side clears it. */
function CompareMoveSideToggle({
  chapter,
  unitId,
  decision,
  side,
  label,
  onDecisionChange,
}: {
  chapter: ComparePresentationChapter;
  unitId: string;
  decision: CompareSide | null;
  side: CompareSide;
  label: string;
  onDecisionChange: CompareDecisionChange;
}) {
  const pressed = decision === side;
  return (
    <button
      type="button"
      className={styles.compareMoveSideToggle}
      data-pressed={pressed || undefined}
      title={label}
      onClick={() =>
        onDecisionChange(
          chapter.comparison.address,
          unitId,
          pressed ? null : side,
        )
      }
    >
      {side === "left" ? "◀" : "▶"}
      <span className={styles.visuallyHidden}>{label}</span>
    </button>
  );
}

/** One skeleton slot — three grid children (left cell, gutter, right cell)
 * contributed directly into the parent's 3-column grid via a Fragment, so no
 * extra wrapper element disturbs column alignment. A displaced unit's slot
 * shows only its own side's content (`shouldShowUnitSide`) plus a single
 * direction-appropriate toggle in the gutter, instead of a bespoke card —
 * the skeleton already lays the move out at its two real positions. */
function CompareChapterRowCells({
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
  row: CompareChapterSlotRow;
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
  const changed = unit.status !== "unchanged";
  const isMovedSlot = unit.displaced;
  const details = unitDetailLabels({ unit, leftLabel, rightLabel });
  const detailTitle = details.length > 0 ? details.join(" · ") : undefined;
  const leftVisible = shouldShowUnitSide({
    unit,
    slot: row.slot,
    side: "left",
  });
  const rightVisible = shouldShowUnitSide({
    unit,
    slot: row.slot,
    side: "right",
  });
  const leftText = tokensToReviewText({
    tokens: unit.baselineTokens,
    showUsfmMarkers,
  });
  const rightText = tokensToReviewText({
    tokens: unit.currentTokens,
    showUsfmMarkers,
  });
  const captions = isMovedSlot
    ? movedAnchorCaptions({
        skeleton: comparison.skeleton,
        leftSlotIndex:
          row.slot.role === "pairBaseline"
            ? row.slotIndex
            : row.linkedSlotIndex,
        rightSlotIndex:
          row.slot.role === "pairCurrent" ? row.slotIndex : row.linkedSlotIndex,
      })
    : null;

  const cell = (side: "left" | "right") => {
    const visible = side === "left" ? leftVisible : rightVisible;
    const text = side === "left" ? leftText : rightText;
    const caption = side === "left" ? captions?.from : captions?.to;
    return (
      <div
        className={styles.compareChapterCell}
        data-compare-unit-id={unit.id}
        data-selected={row.decision === side || undefined}
        data-dimmed={
          (row.decision !== null && row.decision !== side) || undefined
        }
        data-empty={!visible || undefined}
        title={detailTitle}
      >
        <span
          className={joinClassNames(
            changed ? styles.compareChapterSid : styles.compareChapterSidMuted,
            changed && styles.statusBadgeClassName[unitStatusVariant(unit)],
          )}
        >
          {sid}
          {caption ? (
            <span className={styles.compareChapterMoveCaption}>
              {" "}
              · {caption}
            </span>
          ) : null}
        </span>
        {visible ? (
          text ? (
            <pre className={styles.diffPre}>{text}</pre>
          ) : (
            <span className={styles.versePlaceholder}>
              <Trans>No content on this side</Trans>
            </span>
          )
        ) : (
          <span className={styles.versePlaceholder} aria-hidden="true">
            —
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      {cell("left")}
      <div className={styles.compareChapterGutterCell}>
        {!readOnly && changed && onDecisionChange ? (
          isMovedSlot ? (
            <CompareMoveSideToggle
              chapter={chapter}
              unitId={unit.id}
              decision={row.decision}
              side={row.slot.role === "pairBaseline" ? "left" : "right"}
              label={
                row.slot.role === "pairBaseline"
                  ? t`Use original position`
                  : t`Use new position`
              }
              onDecisionChange={onDecisionChange}
            />
          ) : (
            <CompareDecisionControl
              chapter={chapter}
              unitId={unit.id}
              decision={row.decision}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
              instanceId={`slot-${row.slotIndex}`}
              onDecisionChange={onDecisionChange}
              compact
            />
          )
        ) : null}
        {onNavigate && changed ? (
          <Button
            variant="default"
            size="xs"
            aria-label={t`Open in editor`}
            title={t`Open in editor`}
            onClick={() =>
              onNavigate({ address: comparison.address, unitId: unit.id, sid })
            }
          >
            <BookOpen size={12} />
          </Button>
        ) : null}
      </div>
      {cell("right")}
    </>
  );
}

export function ChapterDiffStructuredDocument({
  chapter,
  filters = {},
  leftLabel,
  rightLabel,
  readOnly,
  showUsfmMarkers,
  onDecisionChange,
  onPresenceDecision,
  onChapterDecision,
  onNavigate,
}: {
  chapter: ComparePresentationChapter;
  filters?: CompareRowFilters;
  leftLabel: string;
  rightLabel: string;
  readOnly: boolean;
  showUsfmMarkers: boolean;
  onDecisionChange?: CompareDecisionChange;
  onPresenceDecision?: ComparePresenceDecisionChange;
  onChapterDecision?: ChapterDecisionChange;
  onNavigate?: CompareNavigate;
}) {
  const { comparison } = chapter;
  const decisions = readOnly ? NO_DECISIONS : chapter.decisions.units;
  const rows = useMemo(
    () =>
      buildCompareChapterRows({
        skeleton: comparison.skeleton,
        decisions,
        filters,
      }),
    [comparison.skeleton, decisions, filters],
  );

  return (
    <section className={styles.chapterDiffItem} aria-label={chapter.label}>
      <header className={styles.compareChapterToolbar}>
        <h3 className={styles.compareChapterHeading}>{chapter.label}</h3>
        {!readOnly && onChapterDecision ? (
          <div
            className={styles.compareBulkActions}
            aria-label={t`Chapter decisions`}
          >
            <Button
              variant="default"
              size="xs"
              onClick={() => onChapterDecision(comparison.address, "left")}
            >
              <Trans>Use {leftLabel}</Trans>
            </Button>
            <Button
              variant="default"
              size="xs"
              onClick={() => onChapterDecision(comparison.address, "right")}
            >
              <Trans>Use {rightLabel}</Trans>
            </Button>
            <Button
              variant="default"
              size="xs"
              onClick={() => onChapterDecision(comparison.address, null)}
            >
              <Trans>Clear chapter</Trans>
            </Button>
          </div>
        ) : null}
      </header>

      {!readOnly &&
      onPresenceDecision &&
      requiresExplicitPresenceDecision(comparison) ? (
        <ComparePresenceDecisionControl
          chapter={chapter}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
          onPresenceDecision={onPresenceDecision}
        />
      ) : null}

      <div className={styles.compareChapterRows}>
        <div className={styles.compareChapterColumnHeader}>
          <span className={styles.diffLabel}>{leftLabel}</span>
        </div>
        <div className={styles.compareChapterColumnHeader} />
        <div className={styles.compareChapterColumnHeader}>
          <span className={styles.diffLabel}>{rightLabel}</span>
        </div>
        {rows.map((row) => (
          <CompareChapterRowCells
            key={row.slotIndex}
            chapter={chapter}
            row={row}
            leftLabel={leftLabel}
            rightLabel={rightLabel}
            readOnly={readOnly}
            showUsfmMarkers={showUsfmMarkers}
            onDecisionChange={onDecisionChange}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}
