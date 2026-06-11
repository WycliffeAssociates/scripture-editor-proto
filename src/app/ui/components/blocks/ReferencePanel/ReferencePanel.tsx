import { Popover as BasePopover } from "@base-ui/react/popover";
import { useLingui } from "@lingui/react/macro";
import {
    Check,
    ChevronDown,
    ChevronRight,
    Download,
    Globe,
    Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import * as styles from "@/app/ui/components/blocks/ReferencePanel/referencePanel.css.ts";
import { joinClassNames } from "@/app/ui/components/primitives/classNames.ts";
import { useReferenceCatalog } from "@/app/ui/hooks/useReferenceCatalog.ts";
import { useWorkspaceContext } from "@/app/ui/hooks/useWorkspaceContext.tsx";
import { zLayer } from "@/app/ui/styles/zLayers.ts";
import type { ConsolidatedRepo } from "@/core/domain/project/import/LanguageApiImporter.ts";
import type { ResourceLibraryItem } from "@/core/library/ProjectIndex.ts";

/**
 * Group items under a language label, sorted by label then by row label.
 *
 * Language is a grouping label here, never a selectable row — the rows are the
 * actual texts/projects on disk (or catalog entries) that live under it.
 */
function groupByLanguage<T>(
    items: T[],
    languageOf: (item: T) => string,
    labelOf: (item: T) => string,
): Array<[string, T[]]> {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const language = languageOf(item) || "—";
        const bucket = groups.get(language);
        if (bucket) bucket.push(item);
        else groups.set(language, [item]);
    }
    return [...groups.entries()]
        .map(
            ([language, bucket]) =>
                [
                    language,
                    bucket.toSorted((a, b) =>
                        labelOf(a).localeCompare(labelOf(b)),
                    ),
                ] as [string, T[]],
        )
        .sort(([a], [b]) => a.localeCompare(b));
}

function catalogLanguageOf(repo: ConsolidatedRepo): string {
    return repo.language_english_name || repo.language_name;
}

function catalogLabelOf(repo: ConsolidatedRepo): string {
    return repo.title || repo.repo_name;
}

/**
 * Reference picker surface for the reference pane.
 *
 * Two data sources in one popover: the reference texts already **on this
 * device** (grouped by language label, translation notes included) and the
 * curated WA-Catalog texts **available to add** (collapsible by language).
 * Picking an on-device text switches the reference; picking a catalog text
 * quietly downloads it and refreshes the on-device list.
 */
export function ReferencePanel() {
    const { t } = useLingui();
    const { referenceResource } = useWorkspaceContext();
    const {
        referenceResourcesQuery,
        activeReferenceResourcePath,
        setActiveReferenceResourcePath,
        activeReferenceResourceDisplayName,
    } = referenceResource;

    const deviceResources = useMemo<ResourceLibraryItem[]>(
        () => referenceResourcesQuery.data ?? [],
        [referenceResourcesQuery.data],
    );
    const deviceResourcePaths = useMemo(
        () => deviceResources.map((resource) => resource.projectPath),
        [deviceResources],
    );
    const catalog = useReferenceCatalog({ deviceResourcePaths });

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [expandedLanguages, setExpandedLanguages] = useState<
        ReadonlySet<string>
    >(() => new Set());

    const q = query.trim().toLowerCase();

    const deviceGroups = useMemo(() => {
        const matches = deviceResources.filter((resource) => {
            if (!q) return true;
            return (
                resource.displayName.toLowerCase().includes(q) ||
                resource.languageName.toLowerCase().includes(q)
            );
        });
        return groupByLanguage(
            matches,
            (resource) => resource.languageName,
            (resource) => resource.displayName,
        );
    }, [deviceResources, q]);

    const catalogGroups = useMemo(() => {
        const repos = catalog.repos ?? [];
        const matches = repos.filter((repo) => {
            if (!q) return true;
            return [
                repo.repo_name,
                repo.title ?? "",
                repo.language_english_name,
                repo.language_name,
                repo.username,
            ].some((field) => field.toLowerCase().includes(q));
        });
        return groupByLanguage(matches, catalogLanguageOf, catalogLabelOf);
    }, [catalog.repos, q]);

    function toggleLanguage(language: string) {
        setExpandedLanguages((prev) => {
            const next = new Set(prev);
            if (next.has(language)) next.delete(language);
            else next.add(language);
            return next;
        });
    }

    // A search hit auto-expands the catalog groups so matches are visible.
    const isLanguageExpanded = (language: string) =>
        q.length > 0 || expandedLanguages.has(language);

    function handleSelectDeviceResource(projectPath: string) {
        setActiveReferenceResourcePath(projectPath);
        setOpen(false);
    }

    const triggerLabel = referenceResourcesQuery.isLoading
        ? t`Loading…`
        : (activeReferenceResourceDisplayName ?? t`Select a reference`);

    return (
        <div className={styles.root}>
            <BasePopover.Root open={open} onOpenChange={setOpen}>
                <BasePopover.Trigger
                    className={styles.trigger}
                    aria-label={t`Choose a reference text`}
                >
                    <span className={styles.triggerLabel}>
                        <Globe size={14} aria-hidden="true" />
                        {triggerLabel}
                    </span>
                    <ChevronDown
                        size={14}
                        className={styles.triggerChevron}
                        aria-hidden="true"
                    />
                </BasePopover.Trigger>
                <BasePopover.Portal>
                    <BasePopover.Positioner
                        sideOffset={8}
                        align="start"
                        style={{ zIndex: zLayer.selectDropdown }}
                    >
                        <BasePopover.Popup className={styles.popup}>
                            <div className={styles.header}>
                                <input
                                    className={styles.searchInput}
                                    value={query}
                                    onChange={(event) =>
                                        setQuery(event.target.value)
                                    }
                                    placeholder={t`Search references…`}
                                    aria-label={t`Search references`}
                                />
                            </div>
                            <div className={styles.scroll}>
                                <DeviceSection
                                    groups={deviceGroups}
                                    activePath={activeReferenceResourcePath}
                                    onSelect={handleSelectDeviceResource}
                                    isLoading={
                                        referenceResourcesQuery.isLoading
                                    }
                                    notesLabel={t`Notes`}
                                    sectionLabel={t`On this device`}
                                    emptyLabel={
                                        q
                                            ? t`No matches on this device.`
                                            : t`No reference texts yet.`
                                    }
                                />
                                <CatalogSection
                                    groups={catalogGroups}
                                    sectionLabel={t`Available to add`}
                                    isLoading={catalog.isLoading}
                                    isError={catalog.isError}
                                    isExpanded={isLanguageExpanded}
                                    onToggleLanguage={toggleLanguage}
                                    isAlreadyImported={
                                        catalog.isAlreadyImported
                                    }
                                    isDownloading={catalog.isDownloading}
                                    onDownload={catalog.downloadReferenceText}
                                    addedLabel={t`Added`}
                                    loadingLabel={t`Loading catalog…`}
                                    errorLabel={t`Couldn't load the catalog.`}
                                    emptyLabel={t`No catalog matches.`}
                                />
                            </div>
                        </BasePopover.Popup>
                    </BasePopover.Positioner>
                </BasePopover.Portal>
            </BasePopover.Root>
            {activeReferenceResourceDisplayName ? (
                <span className={styles.triggerInfo}>
                    {activeReferenceResourceDisplayName}
                </span>
            ) : null}
        </div>
    );
}

function DeviceSection(props: {
    groups: Array<[string, ResourceLibraryItem[]]>;
    activePath: string | undefined;
    onSelect: (projectPath: string) => void;
    isLoading: boolean;
    notesLabel: string;
    sectionLabel: string;
    emptyLabel: string;
}) {
    return (
        <section>
            <div className={styles.sectionLabel}>{props.sectionLabel}</div>
            {props.isLoading ? null : props.groups.length === 0 ? (
                <div className={styles.empty}>{props.emptyLabel}</div>
            ) : (
                props.groups.map(([language, resources]) => (
                    <div key={language}>
                        <div className={styles.languageHeader}>{language}</div>
                        {resources.map((resource) => {
                            const isActive =
                                resource.projectPath === props.activePath;
                            return (
                                <button
                                    type="button"
                                    key={resource.projectPath}
                                    className={joinClassNames(
                                        styles.row,
                                        styles.rowIndent,
                                    )}
                                    onClick={() =>
                                        props.onSelect(resource.projectPath)
                                    }
                                >
                                    <span className={styles.rowIndicator}>
                                        {isActive ? <Check size={14} /> : null}
                                    </span>
                                    <span className={styles.rowLabel}>
                                        {resource.displayName}
                                    </span>
                                    {resource.type === "translationNotes" ? (
                                        <span className={styles.rowTag}>
                                            {props.notesLabel}
                                        </span>
                                    ) : (
                                        <span />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))
            )}
        </section>
    );
}

function CatalogSection(props: {
    groups: Array<[string, ConsolidatedRepo[]]>;
    sectionLabel: string;
    isLoading: boolean;
    isError: boolean;
    isExpanded: (language: string) => boolean;
    onToggleLanguage: (language: string) => void;
    isAlreadyImported: (repo: ConsolidatedRepo) => boolean;
    isDownloading: (repo: ConsolidatedRepo) => boolean;
    onDownload: (repo: ConsolidatedRepo) => void;
    addedLabel: string;
    loadingLabel: string;
    errorLabel: string;
    emptyLabel: string;
}) {
    return (
        <section>
            <div className={styles.sectionLabel}>{props.sectionLabel}</div>
            {props.isError ? (
                <div className={styles.empty}>{props.errorLabel}</div>
            ) : props.isLoading ? (
                <div className={styles.empty}>{props.loadingLabel}</div>
            ) : props.groups.length === 0 ? (
                <div className={styles.empty}>{props.emptyLabel}</div>
            ) : (
                props.groups.map(([language, repos]) => {
                    const expanded = props.isExpanded(language);
                    return (
                        <div key={language}>
                            <button
                                type="button"
                                className={styles.languageToggle}
                                aria-expanded={expanded}
                                onClick={() => props.onToggleLanguage(language)}
                            >
                                <ChevronRight
                                    size={14}
                                    className={joinClassNames(
                                        styles.languageToggleChevron,
                                        expanded
                                            ? styles.languageToggleChevronOpen
                                            : undefined,
                                    )}
                                    aria-hidden="true"
                                />
                                {language}
                            </button>
                            {expanded
                                ? repos.map((repo) => {
                                      const added =
                                          props.isAlreadyImported(repo);
                                      const downloading =
                                          props.isDownloading(repo);
                                      return (
                                          <button
                                              type="button"
                                              key={`${repo.username}/${repo.repo_name}`}
                                              className={joinClassNames(
                                                  styles.row,
                                                  styles.rowIndent,
                                                  added
                                                      ? styles.rowDisabled
                                                      : undefined,
                                              )}
                                              disabled={added || downloading}
                                              onClick={() =>
                                                  props.onDownload(repo)
                                              }
                                          >
                                              <span
                                                  className={
                                                      styles.rowIndicator
                                                  }
                                              />
                                              <span className={styles.rowLabel}>
                                                  {catalogLabelOf(repo)}
                                              </span>
                                              <span
                                                  className={styles.rowTrailing}
                                              >
                                                  {added ? (
                                                      props.addedLabel
                                                  ) : downloading ? (
                                                      <Loader2
                                                          size={14}
                                                          className={
                                                              styles.spin
                                                          }
                                                      />
                                                  ) : (
                                                      <Download size={14} />
                                                  )}
                                              </span>
                                          </button>
                                      );
                                  })
                                : null}
                        </div>
                    );
                })
            )}
        </section>
    );
}
