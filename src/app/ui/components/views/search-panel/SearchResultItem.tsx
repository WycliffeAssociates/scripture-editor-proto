import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import type { SearchResult } from "@/app/domain/search/SearchService.ts";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

interface SearchResultItemProps {
  result: SearchResult;
  isActive: boolean;
  searchTerm: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  localizedBookName?: string;
  onPick: () => void;
  sourceProjectName?: string;
  currentProjectName?: string;
  targetResult?: SearchResult;
  canReplace?: boolean;
  /**
   * The match crosses hidden inline markup in regular mode (see `matchHasGap`)
   * — replace is refused; the row offers a direct toggle to USFM mode instead.
   */
  isGap?: boolean;
  onEditInUsfm?: () => void;
  defaultReplaceTerm?: string;
  onReplace?: (
    replacement: string,
    occurrenceIndex: number,
  ) => Promise<void> | void;
}

export function SearchResultItem(props: SearchResultItemProps) {
  const {
    result,
    isActive,
    searchTerm,
    matchCase,
    matchWholeWord,
    localizedBookName,
    onPick,
    sourceProjectName,
    currentProjectName,
    targetResult,
    canReplace = false,
    isGap = false,
    onEditInUsfm,
    defaultReplaceTerm = "",
    onReplace,
  } = props;
  const { t } = useLingui();
  const [replacement, setReplacement] = useState(defaultReplaceTerm);
  const [hasCustomReplacement, setHasCustomReplacement] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  // The occurrence cursor is row-local: the verse's match count comes from the
  // result itself and the active occurrence is plain UI state, so cycling moves
  // the highlight in this row's preview with no editor / pick / dock involved.
  const occurrenceCount = result.occurrenceCount;
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
  const locationLabel =
    result.chapNum === 0
      ? t`Introduction`
      : formatResultLocationLabel(result, localizedBookName);
  const isGrouped = Boolean(sourceProjectName && currentProjectName);
  const missingVerseFallback = t`Verse not available in this text`;
  // Preview (and Replace) act on the cycled-to occurrence; it also reads loudest
  // (orange) when the verse holds several matches.
  const previewOccurrenceIndex = safeOccurrence;
  const activeOccurrenceIndex = occurrenceCount > 1 ? safeOccurrence : null;

  useEffect(() => {
    if (hasCustomReplacement) return;
    setReplacement(defaultReplaceTerm);
  }, [defaultReplaceTerm, hasCustomReplacement]);

  const handleReplaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // Whitespace-only replacements are legitimate edits (spaces are meaningful
    // bytes); only a fully empty replacement is refused.
    if (replacement.length === 0 || !onReplace) return;
    setIsReplacing(true);
    try {
      await onReplace(replacement, safeOccurrence);
      setReplacement("");
    } finally {
      setIsReplacing(false);
    }
  };

  const replaceControls = !canReplace ? null : isGap ? (
    <UsfmModeAffordance onEditInUsfm={() => onEditInUsfm?.()} />
  ) : (
    <ReplaceControls
      replacement={replacement}
      isReplacing={isReplacing}
      onChange={(value) => {
        setReplacement(value);
        setHasCustomReplacement(true);
      }}
      onSubmit={handleReplaceSubmit}
    />
  );

  return (
    <div
      className={`${styles.searchResultItem} ${isActive ? styles.searchResultItemActive : ""}`}
      data-testid={TESTING_IDS.searchResultItem}
      data-search-sid={result.sid}
      data-search-book={result.bibleIdentifier}
      data-search-chapter={String(result.chapNum)}
    >
      <ResultHeader
        locationLabel={locationLabel}
        onPick={onPick}
        navigateLabel={t`Navigate to ${locationLabel}`}
        occurrenceCount={occurrenceCount}
        occurrencePosition={safeOccurrence}
        onStep={stepOccurrence}
        prevLabel={t`Previous match in this verse`}
        nextLabel={t`Next match in this verse`}
      />
      <PreviewSurface onPick={onPick}>
        {isGrouped ? (
          <GroupedPreview
            sourceProjectName={sourceProjectName ?? ""}
            currentProjectName={currentProjectName ?? ""}
            result={result}
            targetResult={targetResult}
            searchTerm={searchTerm}
            replacement={replacement}
            matchCase={matchCase}
            matchWholeWord={matchWholeWord}
            missingVerseFallback={missingVerseFallback}
            replaceControls={replaceControls}
            previewOccurrenceIndex={previewOccurrenceIndex}
            activeOccurrenceIndex={activeOccurrenceIndex}
          />
        ) : (
          <SinglePreview
            text={result.text}
            searchTerm={searchTerm}
            replacement={replacement}
            matchCase={matchCase}
            matchWholeWord={matchWholeWord}
            previewOccurrenceIndex={previewOccurrenceIndex}
            activeOccurrenceIndex={activeOccurrenceIndex}
          />
        )}
      </PreviewSurface>
      {!isGrouped ? replaceControls : null}
    </div>
  );
}

function ResultHeader(props: {
  locationLabel: string;
  navigateLabel: string;
  onPick: () => void;
  occurrenceCount: number;
  occurrencePosition: number;
  onStep: (direction: "next" | "prev") => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const showStepper = props.occurrenceCount > 1;
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
      <IconTooltip label={props.navigateLabel}>
        <button
          type="button"
          className={styles.searchResultNavigate}
          onClick={props.onPick}
          aria-label={props.navigateLabel}
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

function PreviewSurface(props: {
  onPick: () => void;
  children: React.ReactNode;
}) {
  return <div className={styles.searchResultPreview}>{props.children}</div>;
}

function GroupedPreview(props: {
  sourceProjectName: string;
  currentProjectName: string;
  result: SearchResult;
  targetResult: SearchResult | undefined;
  searchTerm: string;
  replacement: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  missingVerseFallback: string;
  replaceControls: React.ReactNode;
  previewOccurrenceIndex: number;
  activeOccurrenceIndex: number | null;
}) {
  return (
    <div className={styles.searchResultPair} data-search-row-type="grouped">
      <PreviewBlock
        projectName={props.sourceProjectName}
        projectLabelKind="source"
        text={props.result.text}
        searchTerm={props.searchTerm}
        replacement=""
        matchCase={props.matchCase}
        matchWholeWord={props.matchWholeWord}
        missingVerseFallback={props.missingVerseFallback}
        previewOccurrenceIndex={0}
        activeOccurrenceIndex={null}
      />
      <PreviewBlock
        projectName={props.currentProjectName}
        projectLabelKind="target"
        text={props.targetResult?.text ?? ""}
        searchTerm={props.searchTerm}
        replacement={props.replacement}
        matchCase={props.matchCase}
        matchWholeWord={props.matchWholeWord}
        missingVerseFallback={props.missingVerseFallback}
        trailing={props.replaceControls}
        previewOccurrenceIndex={props.previewOccurrenceIndex}
        activeOccurrenceIndex={props.activeOccurrenceIndex}
      />
    </div>
  );
}

function PreviewBlock(props: {
  projectName: string;
  projectLabelKind: "source" | "target";
  text: string;
  searchTerm: string;
  replacement: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  missingVerseFallback: string;
  trailing?: React.ReactNode;
  previewOccurrenceIndex: number;
  activeOccurrenceIndex: number | null;
}) {
  return (
    <div className={styles.searchResultPairBlock}>
      <span
        className={styles.searchResultProjectLabel}
        data-project-label={props.projectLabelKind}
      >
        {props.projectName}
      </span>
      <div className={styles.searchResultPairText}>
        <VersePreviewText
          text={props.text}
          searchTerm={props.searchTerm}
          replacement={props.replacement}
          matchCase={props.matchCase}
          matchWholeWord={props.matchWholeWord}
          missingVerseFallback={props.missingVerseFallback}
          previewOccurrenceIndex={props.previewOccurrenceIndex}
          activeOccurrenceIndex={props.activeOccurrenceIndex}
        />
      </div>
      {props.trailing}
    </div>
  );
}

function SinglePreview(props: {
  text: string;
  searchTerm: string;
  replacement: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  previewOccurrenceIndex: number;
  activeOccurrenceIndex: number | null;
}) {
  return (
    <span data-search-row-type="single">
      {renderSearchPreview(
        props.text,
        props.searchTerm,
        props.replacement,
        props.matchCase,
        props.matchWholeWord,
        props.previewOccurrenceIndex,
        props.activeOccurrenceIndex,
      )}
    </span>
  );
}

function VersePreviewText(props: {
  text: string;
  searchTerm: string;
  replacement: string;
  matchCase: boolean;
  matchWholeWord: boolean;
  missingVerseFallback: string;
  previewOccurrenceIndex: number;
  activeOccurrenceIndex: number | null;
}) {
  if (!props.text.trim()) {
    return (
      <span className={styles.searchResultFallbackText}>
        {props.missingVerseFallback}
      </span>
    );
  }
  return (
    <>
      {renderSearchPreview(
        props.text,
        props.searchTerm,
        props.replacement,
        props.matchCase,
        props.matchWholeWord,
        props.previewOccurrenceIndex,
        props.activeOccurrenceIndex,
      )}
    </>
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

function formatResultLocationLabel(
  result: SearchResult,
  localizedBookName?: string,
) {
  const parsed = result.parsedSid;
  if (!parsed) {
    return result.sid;
  }
  const bookLabel = localizedBookName || parsed.book;

  if (parsed.isBookChapOnly) {
    return `${bookLabel} ${parsed.chapter}`;
  }

  if (parsed.verseStart !== parsed.verseEnd) {
    return `${bookLabel} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`;
  }

  return `${bookLabel} ${parsed.chapter}:${parsed.verseStart}`;
}

function renderSearchPreview(
  text: string,
  searchTerm: string,
  replacement: string,
  matchCase: boolean,
  matchWholeWord: boolean,
  previewOccurrenceIndex = 0,
  activeOccurrenceIndex: number | null = null,
): React.ReactNode {
  if (!searchTerm) return text;

  const flags = matchCase ? "g" : "gi";
  const escapedTerm = searchTerm.replace(REGEX_SPECIAL_CHARS, "\\$&");
  const pattern = matchWholeWord
    ? `\\b(${escapedTerm})\\b`
    : `(${escapedTerm})`;
  const searchTermRegex = new RegExp(pattern, flags);
  const parts = text.split(searchTermRegex);
  // Preview the replacement on the occurrence Replace will hit, not always the
  // first — keeps the strikethrough in sync with the row's stepper.
  let matchOrdinal = -1;

  return parts.map((part, index) => {
    const isMatch = matchCase
      ? part === searchTerm
      : part.toLowerCase() === searchTerm.toLowerCase();

    if (isMatch) {
      matchOrdinal += 1;
      if (replacement.length > 0 && matchOrdinal === previewOccurrenceIndex) {
        return (
          <span
            key={`${index}-${part}`}
            className={styles.searchReplacementPreview}
          >
            <span className={styles.searchReplacementOld}>{part}</span>
            <span className={styles.searchReplacementNew}>{replacement}</span>
          </span>
        );
      }
      const isActiveOccurrence = matchOrdinal === activeOccurrenceIndex;
      return (
        <mark
          key={`${index}-${part}`}
          className={
            isActiveOccurrence
              ? styles.searchHighlightActive
              : styles.searchHighlight
          }
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}
