import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowUpDown,
  Braces,
  CaseSensitive,
  Check,
  CornerRightDown,
  LoaderCircle,
  Search,
  WholeWord,
} from "lucide-react";
import { type KeyboardEvent, type RefObject, useEffect, useState } from "react";

import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import {
  type SelectItem,
  SelectPrimitive,
} from "@/app/ui/components/primitives/Select/Select.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";
import type { ResourceLibraryItem } from "@/core/library/ProjectIndex.ts";

type SearchHook = ReturnType<typeof useWorkspaceContext>["search"];

const NO_REFERENCE_VALUE = "none";

interface SearchControlsProps {
  portalContainer?: RefObject<HTMLElement | null>;
}

export function SearchControls({ portalContainer }: SearchControlsProps = {}) {
  const { search, referenceResource, loadedProject } = useWorkspaceContext();
  const [
    isSwitchingReferenceSearchSource,
    setIsSwitchingReferenceSearchSource,
  ] = useState(false);
  const [selectedReferenceDisplaySource, setSelectedReferenceDisplaySource] =
    useState<string>(
      referenceResource.activeReferenceResourcePath ?? NO_REFERENCE_VALUE,
    );
  const isReferenceSearchLoading =
    isSwitchingReferenceSearchSource ||
    (search.searchReference &&
      (referenceResource.activeReferenceResourceQuery.isLoading ||
        referenceResource.referenceScriptureQuery.isLoading));

  useEffect(() => {
    if (isSwitchingReferenceSearchSource) return;
    setSelectedReferenceDisplaySource(
      referenceResource.activeReferenceResourcePath ?? NO_REFERENCE_VALUE,
    );
  }, [
    isSwitchingReferenceSearchSource,
    referenceResource.activeReferenceResourcePath,
  ]);

  const searchableReferenceResources = filterSearchableReferenceResources(
    referenceResource.referenceResourcesQuery.data ?? [],
    loadedProject.projectPath,
  );

  const hasDisplayReference =
    selectedReferenceDisplaySource !== NO_REFERENCE_VALUE;

  const handleSelectReferenceSource = async (value: string | null) => {
    if (!value || value === NO_REFERENCE_VALUE) {
      setSelectedReferenceDisplaySource(NO_REFERENCE_VALUE);
      search.setSearchReferenceImmediate(false);
      referenceResource.setActiveReferenceResourcePath(undefined);
      await search.runSearchLogic(search.searchTerm, {
        autoPick: false,
        scope: "project",
        overrides: { searchReference: false },
      });
      return;
    }

    setSelectedReferenceDisplaySource(value);
    setIsSwitchingReferenceSearchSource(true);
    try {
      const loadedReference =
        await referenceResource.selectActiveReferenceResourcePath(value);
      // Default search scope stays "project" even when a reference is
      // shown side-by-side. The user toggles into reference scope below.
      search.setSearchReferenceImmediate(false);
      await search.runSearchLogic(search.searchTerm, {
        autoPick: false,
        scope: "project",
        overrides: {
          searchReference: false,
          referenceFiles: loadedReference?.parsedFiles ?? [],
        },
      });
    } finally {
      setIsSwitchingReferenceSearchSource(false);
    }
  };

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
        <div className={styles.searchInlineControls}>
          <ReferenceSourceSelector
            portalContainer={portalContainer}
            availableResources={searchableReferenceResources}
            selectedSource={selectedReferenceDisplaySource}
            isSwitching={isSwitchingReferenceSearchSource}
            onSelect={handleSelectReferenceSource}
          />
          {hasDisplayReference ? (
            <SearchScopeToggle
              checked={search.searchReference}
              onChange={handleToggleSearchScope}
            />
          ) : null}
          {isReferenceSearchLoading ? <ReferenceLoadingIndicator /> : null}
        </div>
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
        visualLabel={t`Case`}
        testId={TESTING_IDS.sortToggleButton}
        disabled={!search.results.length}
      />
      <ToggleButton
        active={search.matchCase}
        onClick={() => search.setMatchCase(!search.matchCase)}
        icon={<CaseSensitive size={12} />}
        label={search.matchCase ? t`Disable match case` : t`Match case`}
        visualLabel={t`Match Case`}
        testId={TESTING_IDS.matchCaseCheckbox}
      />
      <ToggleButton
        active={search.matchWholeWord}
        onClick={() => search.setMatchWholeWord(!search.matchWholeWord)}
        icon={<WholeWord size={12} />}
        label={search.matchWholeWord ? t`Disable whole word` : t`Whole word`}
        visualLabel={t`Match Word`}
        testId={TESTING_IDS.matchWholeWordCheckbox}
      />
      <ToggleButton
        active={search.searchUSFM}
        onClick={() => search.setSearchUSFM(!search.searchUSFM)}
        icon={<Braces size={12} />}
        label={
          search.searchUSFM ? t`Disable USFM markers` : t`Include USFM markers`
        }
        visualLabel={t`USFM`}
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

function ReferenceSourceSelector(props: {
  portalContainer?: RefObject<HTMLElement | null>;
  availableResources: Array<{ projectPath: string; displayName: string }>;
  selectedSource: string;
  isSwitching: boolean;
  onSelect: (value: string | null) => Promise<void>;
}) {
  const { t } = useLingui();
  return (
    <div className={styles.searchModeRow}>
      <div className={styles.searchModeField}>
        <span className={styles.searchModeFieldLabel}>
          <Trans>Show reference</Trans>
        </span>
        <div data-testid={TESTING_IDS.searchReferenceToggle}>
          <SelectPrimitive
            items={showReferenceItems({
              availableResources: props.availableResources,
              noneLabel: t`None`,
            })}
            value={props.selectedSource || NO_REFERENCE_VALUE}
            defaultValue={NO_REFERENCE_VALUE}
            placeholder={t`Show reference`}
            disabled={props.isSwitching}
            onValueChange={(value) => {
              void props.onSelect(value);
            }}
            className={styles.searchModeSelect}
            listClassName={styles.searchModeSelectList}
            portalContainer={props.portalContainer}
          />
        </div>
      </div>
    </div>
  );
}

function SearchScopeToggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => Promise<void>;
}) {
  const { t } = useLingui();
  // Checked = searching the reference/source text; unchecked = your own project.
  // The label stays deliberately simple ("source text") even though the reference
  // pane can hold other material — the PO chose plainness over precision here.
  const label = props.checked ? t`Search source text` : t`Search your project`;
  return (
    <ToggleButton
      active={props.checked}
      onClick={() => {
        void props.onChange(!props.checked);
      }}
      icon={<Search size={12} />}
      label={label}
      visualLabel={label}
      testId={TESTING_IDS.searchScopeToggle}
    />
  );
}

function ReferenceLoadingIndicator() {
  return (
    <span className={styles.searchModeLoading}>
      <LoaderCircle size={12} className={styles.searchModeLoadingIcon} />
      <span>
        <Trans>Loading</Trans>
      </span>
    </span>
  );
}

function showReferenceItems(args: {
  availableResources: Array<{ projectPath: string; displayName: string }>;
  noneLabel: string;
}): SelectItem[] {
  return [
    { value: NO_REFERENCE_VALUE, label: args.noneLabel },
    ...args.availableResources.map((resource) => ({
      value: resource.projectPath,
      label: resource.displayName || resource.projectPath,
    })),
  ];
}

function filterSearchableReferenceResources(
  resources: ResourceLibraryItem[],
  currentProjectPath: string,
) {
  const out: { projectPath: string; displayName: string }[] = [];
  for (const resource of resources) {
    if (
      resource.type === "usfmScripture" &&
      resource.projectPath !== currentProjectPath
    ) {
      out.push({
        projectPath: resource.projectPath,
        displayName: resource.displayName,
      });
    }
  }
  return out;
}

function ToggleButton(props: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  visualLabel: string;
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
      title={props.label}
    >
      {props.icon}
      <span>{props.visualLabel}</span>
      <span
        className={`${styles.toggleCheckbox} ${props.active ? styles.toggleCheckboxChecked : ""}`}
        aria-hidden="true"
      >
        {props.active ? <Check size={10} strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
