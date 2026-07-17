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
  type CompareRowFilters,
} from "@/app/domain/project/compare/viewModels.ts";
import { Button } from "@/app/ui/components/primitives/Button/Button.tsx";
import * as styles from "@/app/ui/styles/modules/DiffModal.css.ts";

import {
  shouldShowUnitSide,
  slotMoveNarration,
  tokensToReviewText,
  unitDetailLabels,
  unitPositionNarration,
  unitReference,
  unitStatusLabel,
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

function ChapterSide({
  label,
  text,
  visible,
  selected,
  dimmed,
}: {
  label: string;
  text: string;
  visible: boolean;
  selected: boolean;
  dimmed: boolean;
}) {
  return (
    <div
      className={styles.compareReviewPane}
      data-selected={selected || undefined}
      data-dimmed={dimmed || undefined}
      data-empty={!visible || undefined}
    >
      <span className={styles.diffLabel}>{label}</span>
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
        {rows.map((row) => {
          const unit = row.unit;
          const sid = unitReference(unit);
          const details = unitDetailLabels({ unit, leftLabel, rightLabel });
          const positionNarration =
            slotMoveNarration({
              skeleton: comparison.skeleton,
              slotIndex: row.slotIndex,
              linkedSlotIndex: row.linkedSlotIndex,
            }) ??
            unitPositionNarration({
              skeleton: comparison.skeleton,
              unit,
              leftSlotIndex:
                row.side === "left" || row.side === "both"
                  ? row.slotIndex
                  : null,
              rightSlotIndex:
                row.side === "right" || row.side === "both"
                  ? row.slotIndex
                  : null,
            });
          const actionable = unit.status !== "unchanged";
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
          return (
            <article
              key={`${unit.id}:${row.slotIndex}`}
              id={`compare-slot-${row.slotIndex}`}
              className={styles.compareChapterSlot}
              data-compare-unit-id={unit.id}
              data-compare-slot-index={row.slotIndex}
              data-linked-slot-index={row.linkedSlotIndex ?? undefined}
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
                  {row.linkedSlotIndex !== null ? (
                    <a
                      className={styles.compareMoveLink}
                      href={`#compare-slot-${row.linkedSlotIndex}`}
                    >
                      <Trans>Show other position</Trans>
                    </a>
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
                      instanceId={`slot-${row.slotIndex}`}
                      onDecisionChange={onDecisionChange}
                    />
                  ) : null}
                </div>
              </header>
              <div className={styles.compareReviewPanes}>
                <ChapterSide
                  label={leftLabel}
                  text={leftText}
                  visible={leftVisible}
                  selected={row.decision === "left"}
                  dimmed={row.decision === "right"}
                />
                <ChapterSide
                  label={rightLabel}
                  text={rightText}
                  visible={rightVisible}
                  selected={row.decision === "right"}
                  dimmed={row.decision === "left"}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
