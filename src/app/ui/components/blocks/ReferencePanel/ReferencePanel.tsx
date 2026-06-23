import { Popover as BasePopover } from "@base-ui/react/popover";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Globe,
  Loader2,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TESTING_IDS } from "@/app/data/constants.ts";
import * as styles from "@/app/ui/components/blocks/ReferencePanel/referencePanel.css.ts";
import { joinClassNames } from "@/app/ui/components/primitives/classNames.ts";
import { CloudStatusButton } from "@/app/ui/components/primitives/CloudStatusButton/CloudStatusButton.tsx";
import { IconTooltip } from "@/app/ui/components/primitives/IconTooltip/index.ts";
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
          bucket.slice().sort((a, b) => labelOf(a).localeCompare(labelOf(b))),
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

// Sentinel stored in `referenceByProject` to mean "the user explicitly wants no
// reference" — distinct from "never chose one" (absent). Suppresses auto-pick so
// the choice to search only your own project sticks across opens.
const NO_REFERENCE_KEY = "__no_reference__";

/**
 * Reference picker surface for the reference pane.
 *
 * Two data sources in one popover: the reference texts already **on this
 * device** (grouped by language label, translation notes included) and the
 * curated WA-Catalog texts **available to add** (collapsible by language).
 * Picking an on-device text switches the reference; picking a catalog text
 * quietly downloads it and refreshes the on-device list.
 */
export function ReferencePanel({
  deviceOnly = false,
}: { deviceOnly?: boolean } = {}) {
  const { t } = useLingui();
  const { referenceResource, loadedProject } = useWorkspaceContext();
  const { settingsManager } = useRouter().options.context;
  const {
    referenceResourcesQuery,
    activeReferenceResourcePath,
    setActiveReferenceResourcePath,
    activeReferenceResourceDisplayName,
  } = referenceResource;

  const deviceResources = useMemo<ResourceLibraryItem[]>(() => {
    const all = referenceResourcesQuery.data ?? [];
    // deviceOnly (the search picker) lists only Bible scripture — you can't
    // compare/replace against translation notes or other resource types.
    return deviceOnly
      ? all.filter((resource) => resource.type === "usfmScripture")
      : all;
  }, [referenceResourcesQuery.data, deviceOnly]);

  // Remember the user's reference choice per target project (a UI preference,
  // keyed by project path) so opening the pane again reopens it.
  const projectKey = loadedProject.projectPath;
  const rememberReference = (resourcePath: string) => {
    const map = settingsManager.get("referenceByProject");
    settingsManager.update({
      referenceByProject: { ...map, [projectKey]: resourcePath },
    });
  };

  // Sane default when the pane opens with nothing active: reopen the remembered
  // reference if it's still on device; else, ignoring the project we're editing,
  // auto-load the sole *other* reference (the onboarding case is one alternative
  // text alongside your own). 0 → friendly empty state; 2+ → let the user pick.
  // Runs once per open — this component mounts with the pane.
  const didAutoPick = useRef(false);
  useEffect(() => {
    if (didAutoPick.current) return;
    if (activeReferenceResourcePath) {
      didAutoPick.current = true;
      return;
    }
    if (referenceResourcesQuery.isLoading) return;
    didAutoPick.current = true;
    const remembered = settingsManager.get("referenceByProject")[projectKey];
    // The user explicitly chose "no reference" — honor it, don't re-default.
    if (remembered === NO_REFERENCE_KEY) return;
    const onDevice =
      !!remembered && deviceResources.some((r) => r.projectPath === remembered);
    if (onDevice) {
      setActiveReferenceResourcePath(remembered);
      return;
    }
    // Only the reference pane invents a default. The search picker (deviceOnly)
    // starts empty so you can search just your own project without a forced
    // side-by-side comparison; pick a reference explicitly to compare.
    if (deviceOnly) return;
    const alternatives = deviceResources.filter(
      (r) => r.projectPath !== projectKey,
    );
    if (alternatives.length === 1) {
      setActiveReferenceResourcePath(alternatives[0].projectPath);
    }
  }, [
    activeReferenceResourcePath,
    deviceOnly,
    deviceResources,
    projectKey,
    referenceResourcesQuery.isLoading,
    setActiveReferenceResourcePath,
    settingsManager,
  ]);
  const deviceResourcePaths = useMemo(
    () => deviceResources.map((resource) => resource.projectPath),
    [deviceResources],
  );
  const catalog = useReferenceCatalog({ deviceResourcePaths });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [triggerDimensions, setTriggerDimensions] = useState({
    width: 0,
    height: 0,
  });
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
    rememberReference(projectPath);
    setOpen(false);
  }

  // Clear the reference so search runs against your project alone (single-column
  // results, no comparison). Persisted so it sticks across opens.
  function handleClearReference() {
    setActiveReferenceResourcePath(undefined);
    rememberReference(NO_REFERENCE_KEY);
    setOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setTriggerDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    }
    setOpen(nextOpen);
  }

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const triggerLabel = referenceResourcesQuery.isLoading
    ? t`Loading…`
    : (activeReferenceResourceDisplayName ??
      (deviceOnly ? t`No source text` : t`Select a resource`));

  return (
    <div className={styles.root}>
      <BasePopover.Root open={open} onOpenChange={handleOpenChange}>
        <BasePopover.Trigger
          ref={triggerRef}
          className={styles.trigger}
          aria-label={t`Choose a resource`}
          data-testid={TESTING_IDS.referenceProjectTrigger}
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
            sideOffset={open ? -triggerDimensions.height : 8}
            align="start"
            style={{ zIndex: zLayer.selectDropdown }}
          >
            <BasePopover.Popup
              className={styles.popup}
              data-testid={TESTING_IDS.referenceProjectDropdown}
              style={
                triggerDimensions.width
                  ? { width: triggerDimensions.width }
                  : undefined
              }
            >
              <div className={styles.header}>
                <Search
                  size={16}
                  className={styles.searchIcon}
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  className={styles.searchInput}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t`Search resources…`}
                  aria-label={t`Search resources`}
                />
              </div>
              <div className={styles.scroll}>
                {/* The search picker's default: search only your project, no
                    side-by-side source. Sits above the on-device list as a
                    standalone sentinel. */}
                {deviceOnly ? (
                  <button
                    type="button"
                    className={styles.row}
                    onClick={handleClearReference}
                    data-testid={TESTING_IDS.referenceProjectItem}
                  >
                    <span className={styles.rowIndicator}>
                      {activeReferenceResourcePath ? null : <Check size={14} />}
                    </span>
                    <span className={styles.rowLabel}>{t`No source text`}</span>
                    <span />
                  </button>
                ) : null}
                <DeviceSection
                  groups={deviceGroups}
                  activePath={activeReferenceResourcePath}
                  onSelect={handleSelectDeviceResource}
                  isLoading={referenceResourcesQuery.isLoading}
                  notesLabel={t`Notes`}
                  sectionLabel={t`On this device`}
                  emptyLabel={
                    q ? t`No matches on this device.` : t`No resources yet.`
                  }
                />
                {deviceOnly ? null : (
                  <CatalogSection
                    groups={catalogGroups}
                    sectionLabel={t`Available to add`}
                    isLoading={catalog.isLoading}
                    isError={catalog.isError}
                    isExpanded={isLanguageExpanded}
                    onToggleLanguage={toggleLanguage}
                    isAlreadyImported={catalog.isAlreadyImported}
                    isDownloading={catalog.isDownloading}
                    onDownload={catalog.downloadReferenceText}
                    addedLabel={t`Added`}
                    loadingLabel={t`Loading catalog…`}
                    errorLabel={t`Couldn't load the catalog.`}
                    emptyLabel={t`No catalog matches.`}
                  />
                )}
              </div>
            </BasePopover.Popup>
          </BasePopover.Positioner>
        </BasePopover.Portal>
      </BasePopover.Root>
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
              const isActive = resource.projectPath === props.activePath;
              return (
                <button
                  type="button"
                  key={resource.projectPath}
                  className={joinClassNames(styles.row, styles.rowIndent)}
                  onClick={() => props.onSelect(resource.projectPath)}
                  data-testid={TESTING_IDS.referenceProjectItem}
                >
                  <span className={styles.rowIndicator}>
                    {isActive ? <Check size={14} /> : null}
                  </span>
                  <span className={styles.rowLabel}>
                    {resource.displayName}
                  </span>
                  {resource.type === "translationNotes" ? (
                    <span className={styles.rowTag}>{props.notesLabel}</span>
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
  const { t } = useLingui();
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
                {language}
                <ChevronRight
                  size={14}
                  className={joinClassNames(
                    styles.languageToggleChevron,
                    expanded ? styles.languageToggleChevronOpen : undefined,
                  )}
                  aria-hidden="true"
                />
              </button>
              {expanded
                ? repos.map((repo) => {
                    const added = props.isAlreadyImported(repo);
                    const downloading = props.isDownloading(repo);
                    return (
                      <div
                        key={`${repo.username}/${repo.repo_name}`}
                        className={joinClassNames(
                          styles.row,
                          styles.rowIndent,
                          styles.catalogRow,
                          added ? styles.rowDisabled : undefined,
                        )}
                      >
                        <span className={styles.rowIndicator} />
                        <span className={styles.rowLabel}>
                          {catalogLabelOf(repo)}
                        </span>
                        <span className={styles.rowTrailing}>
                          {added ? (
                            props.addedLabel
                          ) : downloading ? (
                            <Loader2 size={14} className={styles.spin} />
                          ) : (
                            <IconTooltip
                              label={t`Download ${catalogLabelOf(repo)}`}
                            >
                              <CloudStatusButton
                                state="connected"
                                className={styles.downloadButton}
                                icon={<CloudDownload size={15} />}
                                ariaLabel={t`Download ${catalogLabelOf(repo)}`}
                                onClick={() => props.onDownload(repo)}
                              />
                            </IconTooltip>
                          )}
                        </span>
                      </div>
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
