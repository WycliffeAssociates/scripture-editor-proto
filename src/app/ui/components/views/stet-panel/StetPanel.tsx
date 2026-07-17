import { Trans, useLingui } from "@lingui/react/macro";

import { TESTING_IDS } from "@/app/data/constants.ts";
import type { StetCatalogSource } from "@/app/domain/stet/StetCatalogSource.ts";
import { ResultBrowser } from "@/app/ui/components/views/result-browser/ResultBrowser.tsx";
import { useStet } from "@/app/ui/hooks/stet/useStet.ts";
import * as styles from "@/app/ui/styles/modules/Stet.css.ts";

interface StetPanelProps {
  source?: StetCatalogSource;
  onClose?: () => void;
  /** Desktop-only: docked beside the revealed editor. */
  isDocked?: boolean;
  /** Present only on desktop; absent on small screens (no docking there). */
  onToggleDock?: () => void;
  /** Reveal the editor for a row navigation (dock on desktop / close on mobile). */
  onRevealEditor?: () => void;
  /**
   * Collapse the term rail to a combobox. Set when the tool track is narrow
   * (docked) or on small screens, so verse text and the editor stay usable.
   */
  compact?: boolean;
}

/**
 * Spiritual Terms Evaluation panel. A peer workspace tool: pick a term, read its
 * definition, and review curated GL/HL verse pairs with the term's GL glosses
 * highlighted from the frozen snapshot. Feature state is entirely local (see
 * `useStet`); the editor stays mounted throughout. `source` is injectable for
 * tests; production uses the default public catalog source.
 */
export function StetPanel({
  source,
  onClose,
  isDocked,
  onToggleDock,
  onRevealEditor,
  compact = false,
}: StetPanelProps = {}) {
  const { t } = useLingui();
  const stet = useStet({ source, onRevealEditor });

  return (
    <aside className={styles.stetShell} data-testid={TESTING_IDS.stet.panel}>
      <header className={styles.stetPanelHeader}>
        <span className={styles.stetTitle}>
          <Trans>Spiritual Terms Evaluation</Trans>
        </span>
        <div className={styles.stetHeaderActions}>
          {onToggleDock ? (
            <button
              type="button"
              className={styles.stetHeaderButton}
              data-testid={TESTING_IDS.stet.dockToggle}
              onClick={onToggleDock}
              aria-pressed={Boolean(isDocked)}
            >
              {isDocked ? t`Close Editor` : t`Open Editor`}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className={styles.stetHeaderButton}
              onClick={onClose}
              aria-label={t`Close spiritual terms evaluation`}
            >
              <Trans>Close</Trans>
            </button>
          ) : null}
        </div>
      </header>
      <StetBody stet={stet} compact={compact} />
    </aside>
  );
}

function StetBody({
  stet,
  compact,
}: {
  stet: ReturnType<typeof useStet>;
  compact: boolean;
}) {
  const { t } = useLingui();

  if (stet.isLoading) {
    return (
      <div className={styles.stetStateBox}>
        <Trans>Loading spiritual terms…</Trans>
      </div>
    );
  }

  if (stet.isError) {
    return (
      <div className={styles.stetStateBox}>
        <span>
          <Trans>Could not load the spiritual terms catalog.</Trans>
        </span>
        <button
          type="button"
          className={styles.stetRetryButton}
          data-testid={TESTING_IDS.stet.retryButton}
          onClick={stet.retry}
        >
          <Trans>Retry</Trans>
        </button>
      </div>
    );
  }

  if (stet.isEmpty) {
    return (
      <div
        className={styles.stetStateBox}
        data-testid={TESTING_IDS.stet.emptyState}
      >
        <Trans>No spiritual terms are available.</Trans>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={styles.stetCompact}>
        <div className={styles.stetComboboxBar}>
          <input
            type="text"
            className={styles.stetFilterInput}
            data-testid={TESTING_IDS.stet.filterInput}
            value={stet.filter}
            onChange={(event) => stet.setFilter(event.currentTarget.value)}
            placeholder={t`Filter terms`}
            aria-label={t`Filter spiritual terms`}
          />
          <select
            className={styles.stetCombobox}
            data-testid={TESTING_IDS.stet.termItem}
            value={stet.selectedKey ?? ""}
            onChange={(event) => stet.selectTerm(event.currentTarget.value)}
            aria-label={t`Select a spiritual term`}
            disabled={stet.terms.length === 0}
          >
            {stet.terms.length === 0 ? (
              <option value="">{t`No spiritual terms match your filter.`}</option>
            ) : (
              stet.terms.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.term.term}
                </option>
              ))
            )}
          </select>
        </div>
        <StetDetail stet={stet} />
      </div>
    );
  }

  return (
    <div className={styles.stetPanel}>
      <aside className={styles.stetTermRail}>
        <input
          type="text"
          className={styles.stetFilterInput}
          data-testid={TESTING_IDS.stet.filterInput}
          value={stet.filter}
          onChange={(event) => stet.setFilter(event.currentTarget.value)}
          placeholder={t`Filter terms`}
          aria-label={t`Filter spiritual terms`}
        />
        {stet.terms.length === 0 ? (
          <p className={styles.stetEmptyTerms}>
            <Trans>No spiritual terms match your filter.</Trans>
          </p>
        ) : (
          <ul className={styles.stetTermList}>
            {stet.terms.map((entry) => {
              const isSelected = entry.key === stet.selectedKey;
              return (
                <li key={entry.key}>
                  <button
                    type="button"
                    className={`${styles.stetTermButton} ${isSelected ? styles.stetTermButtonActive : ""}`}
                    data-testid={TESTING_IDS.stet.termItem}
                    aria-current={isSelected}
                    onClick={() => stet.selectTerm(entry.key)}
                  >
                    {entry.term.term}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <StetDetail stet={stet} />
    </div>
  );
}

function StetDetail({ stet }: { stet: ReturnType<typeof useStet> }) {
  const { t } = useLingui();

  if (!stet.selectedTerm) {
    return (
      <div className={styles.stetStateBox}>
        <Trans>No spiritual terms match your filter.</Trans>
      </div>
    );
  }

  return (
    <section className={styles.stetContent}>
      <header className={styles.stetHeader}>
        <div className={styles.stetHeaderRow}>
          <h2 className={styles.stetTermHeading}>{stet.selectedTerm.term}</h2>
          {stet.referenceDisplayName ? (
            <span className={styles.stetReferenceName}>
              {stet.referenceDisplayName}
            </span>
          ) : null}
        </div>
        <p
          className={styles.stetCoverage}
          data-testid={TESTING_IDS.stet.coverage}
        >
          {t`${stet.coverage.presentTargetCount} of ${stet.coverage.designatedCount} verses available in this project`}
        </p>
        {stet.definitionParagraphs.map((paragraph, index) => (
          <p
            // Definition paragraphs are positional and static per term.
            key={index}
            className={styles.stetDefinitionParagraph}
          >
            {paragraph}
          </p>
        ))}
        {stet.hasExhaustiveExtra ? (
          <button
            type="button"
            className={styles.stetExhaustiveToggle}
            data-testid={TESTING_IDS.stet.exhaustiveToggle}
            aria-pressed={stet.showExhaustive}
            onClick={() => stet.setShowExhaustive(!stet.showExhaustive)}
          >
            {stet.showExhaustive
              ? t`Show curated verses only (${stet.verseCounts.curated})`
              : t`Show all occurrences (${stet.verseCounts.union})`}
          </button>
        ) : null}
      </header>
      <ResultBrowser rows={stet.rows} />
    </section>
  );
}
