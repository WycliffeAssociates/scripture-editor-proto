import { Trans, useLingui } from "@lingui/react/macro";
import {
    ArrowUpDown,
    Braces,
    CaseSensitive,
    ChevronLeft,
    ChevronRight,
    CornerRightDown,
    LoaderCircle,
    Search,
    WholeWord,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DATA_JS, TESTING_IDS } from "@/app/data/constants.ts";
import {
    type SelectItem,
    SelectPrimitive,
} from "@/app/ui/components/primitives/Select/Select.tsx";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import * as styles from "@/app/ui/styles/modules/SearchPanel.css.ts";
import {
    isEditableScriptureProjectLibraryItem,
    type ResourceLibraryItem,
} from "@/core/library/ProjectIndex.ts";

export function SearchControls() {
    const { search, referenceResource } = useWorkspaceContext();
    const { t } = useLingui();
    const [
        isSwitchingReferenceSearchSource,
        setIsSwitchingReferenceSearchSource,
    ] = useState(false);
    const [selectedReferenceSearchSource, setSelectedReferenceSearchSource] =
        useState<string>(
            search.searchReference
                ? (referenceResource.activeReferenceResourcePath ?? "current")
                : "current",
        );
    const isReferenceSearchLoading =
        isSwitchingReferenceSearchSource ||
        (search.searchReference &&
            (referenceResource.activeReferenceResourceQuery.isLoading ||
                referenceResource.referenceScriptureQuery.isLoading));

    useEffect(() => {
        if (isSwitchingReferenceSearchSource) return;
        setSelectedReferenceSearchSource(
            search.searchReference
                ? (referenceResource.activeReferenceResourcePath ?? "current")
                : "current",
        );
    }, [
        isSwitchingReferenceSearchSource,
        referenceResource.activeReferenceResourcePath,
        search.searchReference,
    ]);

    return (
        <div className={styles.searchControls}>
            <div className={styles.searchInputRow}>
                <div className={styles.searchInputWrapper}>
                    <Search size={16} className={styles.searchInputIcon} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        value={search.searchTerm}
                        data-testid={TESTING_IDS.searchInput}
                        data-js={DATA_JS.searchInput}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                search.submitSearchNow();
                            }
                        }}
                        onChange={(event) =>
                            search.onSearchChange(event.currentTarget.value)
                        }
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

                <div className={styles.searchNavButtons}>
                    <button
                        type="button"
                        className={styles.searchNavButton}
                        data-testid={TESTING_IDS.searchPrevButton}
                        onClick={search.prevMatch}
                        disabled={!search.hasPrev}
                        aria-label={t`Previous result`}
                        title={t`Previous result`}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        type="button"
                        className={styles.searchNavButton}
                        data-testid={TESTING_IDS.searchNextButton}
                        onClick={search.nextMatch}
                        disabled={!search.hasNext}
                        aria-label={t`Next result`}
                        title={t`Next result`}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className={styles.searchOptionsRow}>
                <div
                    className={styles.searchStats}
                    data-testid={TESTING_IDS.searchStats}
                >
                    {search.pickedResultIdx >= 0
                        ? `${search.pickedResultIdx + 1} of ${search.results.length} results`
                        : `${search.results.length} results`}
                </div>

                <div className={styles.searchToggles}>
                    <ToggleButton
                        active={search.currentSort === "caseMismatch"}
                        onClick={() =>
                            search.sortBy(
                                search.currentSort === "caseMismatch"
                                    ? "canonical"
                                    : "caseMismatch",
                            )
                        }
                        icon={<ArrowUpDown size={14} />}
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
                        icon={<CaseSensitive size={14} />}
                        label={
                            search.matchCase
                                ? t`Disable match case`
                                : t`Match case`
                        }
                        testId={TESTING_IDS.matchCaseCheckbox}
                    />
                    <ToggleButton
                        active={search.matchWholeWord}
                        onClick={() =>
                            search.setMatchWholeWord(!search.matchWholeWord)
                        }
                        icon={<WholeWord size={14} />}
                        label={
                            search.matchWholeWord
                                ? t`Disable whole word`
                                : t`Whole word`
                        }
                        testId={TESTING_IDS.matchWholeWordCheckbox}
                    />
                    <ToggleButton
                        active={search.searchUSFM}
                        onClick={() => search.setSearchUSFM(!search.searchUSFM)}
                        icon={<Braces size={14} />}
                        label={
                            search.searchUSFM
                                ? t`Disable USFM markers`
                                : t`Include USFM markers`
                        }
                        testId={TESTING_IDS.includeUSFMMarkersCheckbox}
                    />
                </div>
            </div>

            <div className={styles.searchModeRow}>
                <span className={styles.searchModeLabel}>
                    <Trans>Search reference text</Trans>
                </span>
                <div data-testid={TESTING_IDS.searchReferenceToggle}>
                    <SelectPrimitive
                        items={searchModeItems({
                            t,
                            availableResources:
                                filterSearchableReferenceResources(
                                    referenceResource.referenceResourcesQuery
                                        .data ?? [],
                                ),
                        })}
                        value={selectedReferenceSearchSource}
                        placeholder={t`Current text`}
                        disabled={isSwitchingReferenceSearchSource}
                        onValueChange={async (value) => {
                            if (!value || value === "current") {
                                setSelectedReferenceSearchSource("current");
                                search.setSearchReferenceImmediate(false);
                                await search.runSearchLogic(search.searchTerm, {
                                    autoPick: false,
                                    scope: "project",
                                    overrides: {
                                        searchReference: false,
                                    },
                                });
                                return;
                            }

                            setSelectedReferenceSearchSource(value);
                            setIsSwitchingReferenceSearchSource(true);
                            try {
                                const loadedReference =
                                    await referenceResource.selectActiveReferenceResourcePath(
                                        value,
                                    );
                                search.setSearchReferenceImmediate(true);
                                await search.runSearchLogic(search.searchTerm, {
                                    autoPick: false,
                                    scope: "project",
                                    overrides: {
                                        searchReference: true,
                                        referenceFiles:
                                            loadedReference?.parsedFiles ?? [],
                                    },
                                });
                            } finally {
                                setIsSwitchingReferenceSearchSource(false);
                            }
                        }}
                        className={styles.searchModeSelect}
                    />
                </div>
                {isReferenceSearchLoading ? (
                    <span
                        className={styles.searchModeLoading}
                        aria-label={t`Loading reference search source`}
                    >
                        <LoaderCircle
                            size={12}
                            className={styles.searchModeLoadingIcon}
                        />
                        <span>
                            <Trans>Loading</Trans>
                        </span>
                    </span>
                ) : null}
            </div>

            {!search.searchReference ? (
                <div className={styles.searchReplaceRow}>
                    <span className={styles.searchModeLabel}>
                        <Trans>Default replace term</Trans>
                    </span>
                    <div className={styles.replaceInputWrapper}>
                        <input
                            type="text"
                            className={styles.replaceInput}
                            value={search.replaceTerm}
                            data-testid={TESTING_IDS.replaceInput}
                            onChange={(event) =>
                                search.setReplaceTerm(event.currentTarget.value)
                            }
                            placeholder={t`Replace with...`}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function searchModeItems(args: {
    t: ReturnType<typeof useLingui>["t"];
    availableResources: Array<{ projectPath: string; displayName: string }>;
}): SelectItem[] {
    return [
        { value: "current", label: args.t`Current text` },
        ...args.availableResources.map((resource) => ({
            value: resource.projectPath,
            label: resource.displayName,
        })),
    ];
}

function filterSearchableReferenceResources(resources: ResourceLibraryItem[]) {
    return resources
        .filter((resource) => isEditableScriptureProjectLibraryItem(resource))
        .map((resource) => ({
            projectPath: resource.projectPath,
            displayName: resource.displayName,
        }));
}

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
            title={props.label}
        >
            {props.icon}
        </button>
    );
}
