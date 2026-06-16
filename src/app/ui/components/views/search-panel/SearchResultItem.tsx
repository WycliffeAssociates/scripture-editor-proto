import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import type { SearchResult } from "@/app/domain/search/SearchService.ts";
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
  defaultReplaceTerm?: string;
  onReplace?: (replacement: string) => Promise<void> | void;
  /**
   * Occurrence cursor for this verse, present when the verse holds more than one
   * match. `entered` is true only for the active row (real position + clamped
   * arrows); non-active rows show "1/N" with both arrows live (they enter the
   * verse). Drives the header stepper.
   */
  occurrence?: { count: number; position: number; entered: boolean } | null;
  onStep?: (direction: "next" | "prev") => void;
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
    defaultReplaceTerm = "",
    onReplace,
    occurrence,
    onStep,
  } = props;
  const { t } = useLingui();
  const [replacement, setReplacement] = useState(defaultReplaceTerm);
  const [hasCustomReplacement, setHasCustomReplacement] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const locationLabel =
    result.chapNum === 0
      ? t`Introduction`
      : formatResultLocationLabel(result, localizedBookName);
  const isGrouped = Boolean(sourceProjectName && currentProjectName);
  const missingVerseFallback = t`Verse not available in this text`;
  // Preview the replacement on the occurrence Replace will actually hit: the
  // active (cycled-to) one on the active row, the first occurrence otherwise.
  const previewOccurrenceIndex = occurrence?.position ?? 0;

  useEffect(() => {
    if (hasCustomReplacement) return;
    setReplacement(defaultReplaceTerm);
  }, [defaultReplaceTerm, hasCustomReplacement]);

  const handleReplaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!replacement.trim() || !onReplace) return;
    setIsReplacing(true);
    try {
      await onReplace(replacement);
      setReplacement("");
    } finally {
      setIsReplacing(false);
    }
  };

  const replaceControls = canReplace ? (
    <ReplaceControls
      replacement={replacement}
      isReplacing={isReplacing}
      onChange={(value) => {
        setReplacement(value);
        setHasCustomReplacement(true);
      }}
      onSubmit={handleReplaceSubmit}
    />
  ) : null;

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
        occurrence={occurrence}
        onStep={onStep}
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
          />
        ) : (
          <SinglePreview
            text={result.text}
            searchTerm={searchTerm}
            replacement={replacement}
            matchCase={matchCase}
            matchWholeWord={matchWholeWord}
            previewOccurrenceIndex={previewOccurrenceIndex}
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
  occurrence?: { count: number; position: number; entered: boolean } | null;
  onStep?: (direction: "next" | "prev") => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const showStepper = Boolean(
    props.occurrence && props.occurrence.count > 1 && props.onStep,
  );
  return (
    <div className={styles.searchResultHeader}>
      <span className={styles.searchResultLocation}>{props.locationLabel}</span>
      {showStepper && props.occurrence ? (
        <OccurrenceStepper
          occurrence={props.occurrence}
          onStep={props.onStep}
          prevLabel={props.prevLabel}
          nextLabel={props.nextLabel}
        />
      ) : null}
      <button
        type="button"
        className={styles.searchResultNavigate}
        onClick={props.onPick}
        aria-label={props.navigateLabel}
        title={props.navigateLabel}
      >
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

function OccurrenceStepper(props: {
  occurrence: { count: number; position: number; entered: boolean };
  onStep?: (direction: "next" | "prev") => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const { count, position, entered } = props.occurrence;
  // The active row clamps at the verse ends; a non-active row keeps both arrows
  // live so either one enters the verse.
  const prevDisabled = entered && position <= 0;
  const nextDisabled = entered && position >= count - 1;
  return (
    <div className={styles.occurrenceStepper}>
      <button
        type="button"
        className={styles.occurrenceStepButton}
        data-testid={TESTING_IDS.searchPrevButton}
        onClick={() => props.onStep?.("prev")}
        disabled={prevDisabled}
        aria-label={props.prevLabel}
        title={props.prevLabel}
      >
        <ChevronLeft size={12} />
      </button>
      <span className={styles.occurrenceCount}>
        {position + 1}/{count}
      </span>
      <button
        type="button"
        className={styles.occurrenceStepButton}
        data-testid={TESTING_IDS.searchNextButton}
        onClick={() => props.onStep?.("next")}
        disabled={nextDisabled}
        aria-label={props.nextLabel}
        title={props.nextLabel}
      >
        <ChevronRight size={12} />
      </button>
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
          disabled={props.isReplacing || !props.replacement.trim()}
          aria-label={t`Replace this match`}
          title={t`Replace this match`}
        >
          <Trans>Replace</Trans>
        </button>
      </div>
    </form>
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
      if (replacement.trim() && matchOrdinal === previewOccurrenceIndex) {
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
      return (
        <mark key={`${index}-${part}`} className={styles.searchHighlight}>
          {part}
        </mark>
      );
    }
    return part;
  });
}
