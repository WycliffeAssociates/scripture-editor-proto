import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

import { renderHighlightedText } from "./resultHighlight.tsx";
import type { ResultColumn, ResultRow } from "./resultRow.ts";

/**
 * Presentational verse-result row shared by Find and STET. Owns only ephemeral
 * UI state (the replacement draft and the per-verse occurrence cursor); it never
 * imports a feature hook or calls a replace verb — it hands values back through
 * `row.find.replacement.onCommit`. One column renders single-column; two columns
 * render a source/target pair.
 */
export function ResultBrowserRow({ row }: { row: ResultRow }) {
  const { t } = useLingui();
  const replacement = row.find?.replacement;
  const occurrenceCount = row.find?.occurrenceCount ?? 1;

  const [replaceValue, setReplaceValue] = useState(
    replacement?.defaultValue ?? "",
  );
  const [hasCustomReplacement, setHasCustomReplacement] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  // The occurrence cursor is row-local: the verse's match count comes from the
  // row and the active occurrence is plain UI state, so cycling moves the
  // highlight in this row's preview with no editor / pick / dock involved.
  const [activeOccurrence, setActiveOccurrence] = useState(0);
  // Clamp against the live count (a replace can shrink it out from under us).
  const safeOccurrence = Math.min(
    activeOccurrence,
    Math.max(0, occurrenceCount - 1),
  );
  const stepOccurrence = (direction: "next" | "prev") => {
    setActiveOccurrence((current) => {
      const next = direction === "next" ? current + 1 : current - 1;
      return Math.min(Math.max(next, 0), Math.max(0, occurrenceCount - 1));
    });
  };
  // Preview (and Replace) act on the cycled-to occurrence; it also reads loudest
  // (orange) when the verse holds several matches.
  const previewOccurrenceIndex = safeOccurrence;
  const activeOccurrenceIndex = occurrenceCount > 1 ? safeOccurrence : null;

  useEffect(() => {
    if (hasCustomReplacement) return;
    setReplaceValue(replacement?.defaultValue ?? "");
  }, [replacement?.defaultValue, hasCustomReplacement]);

  const handleReplaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // Whitespace-only replacements are legitimate edits (spaces are meaningful
    // bytes); only a fully empty replacement is refused.
    if (replaceValue.length === 0 || !replacement) return;
    setIsReplacing(true);
    try {
      await replacement.onCommit(replaceValue, safeOccurrence);
      setReplaceValue("");
    } finally {
      setIsReplacing(false);
    }
  };

  const replaceControls = !replacement ? null : replacement.disabledReason ? (
    <UsfmModeAffordance onEditInUsfm={() => replacement.onEditInUsfm?.()} />
  ) : (
    <ReplaceControls
      replacement={replaceValue}
      isReplacing={isReplacing}
      onChange={(value) => {
        setReplaceValue(value);
        setHasCustomReplacement(true);
      }}
      onSubmit={handleReplaceSubmit}
    />
  );

  const isGrouped = row.columns.length > 1;
  // The replacement preview + controls attach to the editable (target) column,
  // or the sole column when single.
  const bearerIndex = Math.max(
    0,
    row.columns.findIndex((column) => column.kind === "target"),
  );

  return (
    <div
      className={`${styles.searchResultItem} ${row.active ? styles.searchResultItemActive : ""}`}
      data-testid={row.testId}
      {...row.dataAttributes}
    >
      <ResultHeader
        locationLabel={row.locationLabel}
        onPick={row.onNavigate}
        navigateLabel={t`Navigate to ${row.locationLabel}`}
        navigateDisabled={row.navigateDisabled}
        navigateDisabledLabel={row.navigateDisabledLabel}
        occurrenceCount={occurrenceCount}
        occurrencePosition={safeOccurrence}
        onStep={stepOccurrence}
        prevLabel={t`Previous match in this verse`}
        nextLabel={t`Next match in this verse`}
      />
      <div className={styles.searchResultPreview}>
        {isGrouped ? (
          <div className={styles.searchResultPair} data-result-layout="grouped">
            {row.columns.map((column, index) => (
              <PreviewBlock
                key={column.kind}
                column={column}
                replacement={index === bearerIndex ? replaceValue : ""}
                previewOccurrenceIndex={
                  index === bearerIndex ? previewOccurrenceIndex : 0
                }
                activeOccurrenceIndex={
                  index === bearerIndex ? activeOccurrenceIndex : null
                }
                trailing={index === bearerIndex ? replaceControls : undefined}
              />
            ))}
          </div>
        ) : (
          <span data-result-layout="single">
            {renderColumnText(row.columns[0], {
              replacement: replaceValue,
              previewOccurrenceIndex,
              activeOccurrenceIndex,
            })}
          </span>
        )}
      </div>
      {!isGrouped ? replaceControls : null}
    </div>
  );
}

// Render column text, falling back to the column's missing copy for blank text
// so absence is explicit rather than mistaken for "no match".
function renderColumnText(
  column: ResultColumn | undefined,
  opts: {
    replacement: string;
    previewOccurrenceIndex: number;
    activeOccurrenceIndex: number | null;
  },
) {
  if (!column) return null;
  if (!column.text.trim()) {
    return (
      <span className={styles.searchResultFallbackText}>
        {column.missingText}
      </span>
    );
  }
  return renderHighlightedText(column.text, column.highlight, opts);
}

function PreviewBlock(props: {
  column: ResultColumn;
  replacement: string;
  previewOccurrenceIndex: number;
  activeOccurrenceIndex: number | null;
  trailing?: React.ReactNode;
}) {
  return (
    <div className={styles.searchResultPairBlock}>
      <span
        className={styles.searchResultProjectLabel}
        data-result-column={props.column.kind}
      >
        {props.column.label}
      </span>
      <div className={styles.searchResultPairText}>
        {renderColumnText(props.column, {
          replacement: props.replacement,
          previewOccurrenceIndex: props.previewOccurrenceIndex,
          activeOccurrenceIndex: props.activeOccurrenceIndex,
        })}
      </div>
      {props.trailing}
    </div>
  );
}

function ResultHeader(props: {
  locationLabel: string;
  navigateLabel: string;
  navigateDisabled?: boolean;
  navigateDisabledLabel?: string;
  onPick: () => void;
  occurrenceCount: number;
  occurrencePosition: number;
  onStep: (direction: "next" | "prev") => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const showStepper = props.occurrenceCount > 1;
  const label =
    props.navigateDisabled && props.navigateDisabledLabel
      ? props.navigateDisabledLabel
      : props.navigateLabel;
  return (
    <div className={styles.searchResultHeader}>
      <span className={styles.searchResultLocation}>{props.locationLabel}</span>
      {showStepper ? (
        <OccurrenceStepper
          count={props.occurrenceCount}
          position={props.occurrencePosition}
          onStep={props.onStep}
          prevLabel={props.prevLabel}
          nextLabel={props.nextLabel}
        />
      ) : null}
      <IconTooltip label={label}>
        <button
          type="button"
          className={styles.searchResultNavigate}
          onClick={props.onPick}
          disabled={props.navigateDisabled}
          aria-label={label}
        >
          <ArrowRight size={14} />
        </button>
      </IconTooltip>
    </div>
  );
}

function OccurrenceStepper(props: {
  count: number;
  position: number;
  onStep: (direction: "next" | "prev") => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const { count, position } = props;
  const prevDisabled = position <= 0;
  const nextDisabled = position >= count - 1;
  return (
    <div className={styles.occurrenceStepper}>
      <IconTooltip label={props.prevLabel}>
        <button
          type="button"
          className={styles.occurrenceStepButton}
          data-testid={TESTING_IDS.searchPrevButton}
          onClick={() => props.onStep("prev")}
          disabled={prevDisabled}
          aria-label={props.prevLabel}
        >
          <ChevronLeft size={12} />
        </button>
      </IconTooltip>
      <span className={styles.occurrenceCount}>
        {position + 1}/{count}
      </span>
      <IconTooltip label={props.nextLabel}>
        <button
          type="button"
          className={styles.occurrenceStepButton}
          data-testid={TESTING_IDS.searchNextButton}
          onClick={() => props.onStep("next")}
          disabled={nextDisabled}
          aria-label={props.nextLabel}
        >
          <ChevronRight size={12} />
        </button>
      </IconTooltip>
    </div>
  );
}

function ReplaceControls(props: {
  replacement: string;
  isReplacing: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const { t } = useLingui();
  return (
    <form
      className={styles.searchResultReplace}
      onSubmit={(event) => {
        void props.onSubmit(event);
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className={styles.searchResultReplaceControls}>
        <input
          type="text"
          className={styles.searchResultReplaceInput}
          value={props.replacement}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          placeholder={t`Replace with...`}
          disabled={props.isReplacing}
        />
        <button
          type="submit"
          className={styles.searchResultReplaceButton}
          disabled={props.isReplacing || props.replacement.length === 0}
          aria-label={t`Replace this match`}
          title={t`Replace this match`}
        >
          <Trans>Replace</Trans>
        </button>
      </div>
    </form>
  );
}

/**
 * Replaces the replace input for a gap match. Rather than silently refuse, it
 * offers a direct toggle to USFM mode (no confirm dialog) that lands the user
 * on the verse.
 */
function UsfmModeAffordance(props: { onEditInUsfm: () => void }) {
  const { t } = useLingui();
  return (
    <div
      className={styles.searchResultReplace}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className={styles.searchResultReplaceControls}>
        <button
          type="button"
          className={styles.searchResultReplaceButton}
          onClick={(event) => {
            event.stopPropagation();
            props.onEditInUsfm();
          }}
          title={t`This match crosses hidden formatting — edit it in USFM mode`}
        >
          <Trans>Edit in USFM mode</Trans>
        </button>
      </div>
    </div>
  );
}
