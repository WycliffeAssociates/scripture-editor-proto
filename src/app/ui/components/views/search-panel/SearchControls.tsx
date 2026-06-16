import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowUpDown,
  Braces,
  CaseSensitive,
  CornerRightDown,
  Search,
  WholeWord,
} from "lucide-react";
import type { KeyboardEvent } from "react";

import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import { ReferencePanel } from "@/app/ui/components/blocks/ReferencePanel/ReferencePanel.tsx";
import { Switch } from "@/app/ui/components/primitives/Switch/Switch.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";

type SearchHook = ReturnType<typeof useWorkspaceContext>["search"];

export function SearchControls() {
  const { search, referenceResource } = useWorkspaceContext();

  // The reference picker (reused from the editor) sets the active reference; a
  // scripture one is what reference-scope search can run against, so the scope
  // toggle only appears once a scripture reference is loaded.
  const hasScriptureReference =
    Boolean(referenceResource.activeReferenceResourcePath) &&
    referenceResource.supportsScriptureNavigation;

  const handleToggleSearchScope = async (checked: boolean) => {
    search.setSearchReferenceImmediate(checked);
    await search.runSearchLogic(search.searchTerm, {
      autoPick: false,
      scope: "project",
      overrides: {
        searchReference: checked,
        referenceFiles:
          referenceResource.referenceScriptureQuery.data?.parsedFiles ?? [],
      },
    });
  };

  return (
    <div className={styles.searchControls}>
      <SearchInputBar search={search} />
      <div className={styles.searchOptionsRow}>
        <div
          className={styles.searchStats}
          data-testid={TESTING_IDS.searchStats}
        >
          {`${search.results.length} results`}
        </div>
        <SearchToggles search={search} />
      </div>
      <div className={styles.searchReferenceRow}>
        <span className={styles.searchReferenceLabel}>
          <Trans>Reference</Trans>
        </span>
        <div className={styles.searchReferencePicker}>
          <ReferencePanel deviceOnly />
        </div>
        {hasScriptureReference ? (
          <SearchScopeToggle
            checked={search.searchReference}
            onChange={handleToggleSearchScope}
          />
        ) : null}
      </div>
    </div>
  );
}

function SearchInputBar(props: { search: SearchHook }) {
  const { t } = useLingui();
  const { search } = props;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      search.submitSearchNow();
    }
  };
  return (
    <div className={styles.searchInputRow}>
      <div className={styles.searchInputWrapper}>
        <Search size={16} className={styles.searchInputIcon} />
        <input
          type="text"
          className={styles.searchInput}
          value={search.searchTerm}
          data-testid={TESTING_IDS.searchInput}
          data-js={DATA_JS.searchInput}
          onKeyDown={handleKeyDown}
          onChange={(event) => search.onSearchChange(event.currentTarget.value)}
          placeholder={t`Search`}
        />
        <button
          type="button"
          className={styles.searchRunButton}
          data-testid={TESTING_IDS.searchRunButton}
          onClick={search.submitSearchNow}
          aria-label={t`Run search`}
          title={t`Run search`}
        >
          <CornerRightDown size={14} />
        </button>
      </div>
    </div>
  );
}

function SearchToggles(props: { search: SearchHook }) {
  const { t } = useLingui();
  const { search } = props;
  const toggleSort = () =>
    search.sortBy(
      search.currentSort === "caseMismatch" ? "canonical" : "caseMismatch",
    );
  return (
    <div className={styles.searchToggles}>
      <ToggleButton
        active={search.currentSort === "caseMismatch"}
        onClick={toggleSort}
        icon={<ArrowUpDown size={12} />}
        label={
          search.currentSort === "caseMismatch"
            ? t`Remove sort`
            : t`Group case mismatches`
        }
        testId={TESTING_IDS.sortToggleButton}
        disabled={!search.results.length}
      />
      <ToggleButton
        active={search.matchCase}
        onClick={() => search.setMatchCase(!search.matchCase)}
        icon={<CaseSensitive size={12} />}
        label={search.matchCase ? t`Disable match case` : t`Match case`}
        testId={TESTING_IDS.matchCaseCheckbox}
      />
      <ToggleButton
        active={search.matchWholeWord}
        onClick={() => search.setMatchWholeWord(!search.matchWholeWord)}
        icon={<WholeWord size={12} />}
        label={search.matchWholeWord ? t`Disable whole word` : t`Whole word`}
        testId={TESTING_IDS.matchWholeWordCheckbox}
      />
      <ToggleButton
        active={search.searchUSFM}
        onClick={() => search.setSearchUSFM(!search.searchUSFM)}
        icon={<Braces size={12} />}
        label={
          search.searchUSFM ? t`Disable USFM markers` : t`Include USFM markers`
        }
        testId={TESTING_IDS.includeUSFMMarkersCheckbox}
      />
      <ReplaceTermInput search={search} />
    </div>
  );
}

function ReplaceTermInput(props: { search: SearchHook }) {
  const { t } = useLingui();
  const { search } = props;
  return (
    <div className={styles.searchReplaceRow}>
      <div className={styles.replaceInputWrapper}>
        <input
          type="text"
          className={styles.replaceInput}
          value={search.replaceTerm}
          data-testid={TESTING_IDS.replaceInput}
          onChange={(event) => search.setReplaceTerm(event.currentTarget.value)}
          placeholder={t`Default replace term`}
          disabled={search.searchReference}
        />
      </div>
    </div>
  );
}

function SearchScopeToggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => Promise<void>;
}) {
  const { t } = useLingui();
  // On = searching the reference/source text; off = your own project. The label
  // reflects the current state rather than the action.
  const label = props.checked ? t`Searching source` : t`Searching your project`;
  return (
    <div
      className={styles.searchScopeField}
      data-testid={TESTING_IDS.searchScopeToggle}
    >
      <Switch
        compact
        className={styles.searchScopeSwitch}
        checked={props.checked}
        onCheckedChange={(checked) => {
          void props.onChange(Boolean(checked));
        }}
        label={label}
        aria-label={t`Search scope`}
      />
    </div>
  );
}

// Compact, icon-only find toggle (à la the save/review ribbon). The active
// state reads as a tinted segment; the label lives in the tooltip/aria.
function ToggleButton(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${styles.toggleButton} ${props.active ? styles.toggleButtonActive : ""}`}
      data-testid={props.testId}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
    >
      {props.icon}
    </button>
  );
}
